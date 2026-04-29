"""
Liminal TTS Server — wraps chatterbox-tts (rsxdalv/chatterbox@faster) with an
OpenAI-compatible API.

  GET  /v1/models          — health / status check
  POST /v1/audio/speech    — synthesise speech, returns audio/wav
  GET  /device             — current device info

Device selection (in priority order):
  1. TTS_DEVICE env var  (e.g. "cuda:1", "cuda:0", "cpu")
  2. tts_device value in Liminal's SQLite DB  (set via Settings UI)
  3. "auto" → picks first CUDA GPU if available, else CPU
"""

# ── Multiprocessing-child short-circuit ───────────────────────────────────────
# PyInstaller-bundled apps re-execute the entry binary for every multiprocessing
# child. Each child's PyInstaller bootloader runs the full module-level code
# here — `import torch`, `import chatterbox`, etc. — and during those imports
# yet another lib (huggingface_hub / diffusers / numpy / etc.) often fires its
# own multiprocessing init, which spawns ANOTHER child that does the same
# thing. The result is a chain of orphaned `multiprocessing.resource_tracker`
# processes each at 100-600% CPU, observed as "TTS suddenly went very slow"
# after a few minutes of mixed Whisper + Turbo use.
#
# None of our actual deps (ctranslate2, onnxruntime, av, faster-whisper) use
# Python multiprocessing for their real work — they're all C++ thread pools.
# The mp invocations we see are bookkeeping spawned during import.
#
# Detection: helpers are launched as `python -c "from multiprocessing.X import
# main; main(N)"`. PyInstaller's bootloader does NOT rewrite argv when the
# bundle is invoked this way — the full argv is preserved (binary path, then
# `-B -S -I -c <command>`). So we scan the *whole* argv for the helper
# command, not just argv[0]. We can't use multiprocessing.current_process()
# .name == 'MainProcess' because that returns True even in fresh helper
# interpreters — multiprocessing's child-name bookkeeping runs AFTER our
# guard. Verified empirically by writing argv to /tmp from inside the bundle
# during a helper invocation.
import sys as _liminal_sys
def _liminal_is_mp_helper():
    # PyInstaller does NOT rewrite argv when the bundled binary is invoked
    # as a multiprocessing helper — argv[0] stays the binary path, with the
    # helper command preserved as later args (e.g.
    # ['.../tts_server', '-B', '-S', '-I', '-c',
    #  'from multiprocessing.resource_tracker import main; main(9)']).
    # So we look for the helper command anywhere in argv, not just argv[0].
    a = _liminal_sys.argv or []
    if a and a[0] == '-c':  # belt-and-suspenders for unbundled / future PyI
        return True
    blob = ' '.join(str(x or '') for x in a)
    return ('multiprocessing.resource_tracker' in blob
            or 'multiprocessing.spawn' in blob
            or '--multiprocessing-fork' in blob)
if _liminal_is_mp_helper():
    _liminal_sys.exit(0)

import io
import os
import re
import sys
import json
import logging
import sqlite3
from pathlib import Path

import torch
import soundfile as sf
import uvicorn
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.responses import Response
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("tts_server")

# ── Config ────────────────────────────────────────────────────────────────────

PORT       = int(os.environ.get("TTS_PORT", 8100))
BASE_DIR   = Path(__file__).parent

# Production override: Electron sets LIMINAL_USER_DATA to the per-OS user data
# directory. In dev (no env var), fall back to the original repo-relative paths
# so the existing workflow (`python tts_server.py` from repo root) keeps working.
USER_DATA_DIR = Path(os.environ.get("LIMINAL_USER_DATA", BASE_DIR / "backend" / "data"))
VOICES_DIR    = Path(os.environ.get("VOICES_DIR", USER_DATA_DIR / "voices"))
DB_PATH       = USER_DATA_DIR / "liminal.db"

def resolve_gpu_by_name(name: str) -> str | None:
    """Find cuda:N index by GPU name substring (e.g. '4090' matches 'NVIDIA GeForce RTX 4090')."""
    if not torch.cuda.is_available():
        return None
    needle = name.lower()
    for i in range(torch.cuda.device_count()):
        if needle in torch.cuda.get_device_name(i).lower():
            log.info(f"Resolved GPU name '{name}' → cuda:{i} ({torch.cuda.get_device_name(i)})")
            return f"cuda:{i}"
    return None

def _mps_available() -> bool:
    """Check for Apple Silicon MPS (Metal) backend."""
    try:
        return bool(getattr(torch.backends, "mps", None) and torch.backends.mps.is_available())
    except Exception:
        return False

def resolve_device() -> str:
    """Pick the device to run on, checking env → DB → auto.
    Supports cuda:N indices, GPU name substrings (e.g. '4090'), 'mps', or 'cpu'."""
    raw = None

    # 1. Explicit env var
    env = os.environ.get("TTS_DEVICE", "").strip()
    if env and env != "auto":
        raw = env

    # 2. Liminal settings DB
    if not raw and DB_PATH.exists():
        try:
            con = sqlite3.connect(str(DB_PATH))
            row = con.execute("SELECT value FROM settings WHERE key='tts_device'").fetchone()
            con.close()
            if row and row[0] and row[0] != "auto":
                raw = row[0]
        except Exception:
            pass

    # 3. If we got a value, resolve it
    if raw:
        if raw.startswith("cuda:") or raw == "cpu":
            return raw
        if raw == "mps":
            return "mps" if _mps_available() else "cpu"
        # Treat as GPU name substring (CUDA only — MPS has only one device)
        match = resolve_gpu_by_name(raw)
        if match:
            return match
        log.warning(f"GPU '{raw}' not found, falling back to auto")

    # 4. Auto: first CUDA GPU → MPS (Apple Silicon) → CPU
    if torch.cuda.is_available() and torch.cuda.device_count() > 0:
        return "cuda:0"
    if _mps_available():
        return "mps"
    return "cpu"

_requested = resolve_device()
try:
    if _requested.startswith("cuda"):
        torch.cuda.init()
    DEVICE = _requested
except Exception as e:
    log.warning(f"CUDA init failed ({e}), falling back to CPU")
    DEVICE = "cpu"
log.info(f"Using device: {DEVICE}")

# ── Compat mode for older GPUs (Turing / Pascal, compute cap < 8.0) ──────────
# cutlassF and flash-SDP kernels require compute capability >= 8.0 (Ampere+).
# On older cards these crash with "cutlassF: no kernel found to launch!".
# We disable all non-math SDPA backends globally, wrap model load and generation
# in math-only context, switch diffusers to vanilla attention, and skip bf16.

COMPAT_MODE = False
if DEVICE.startswith("cuda"):
    idx = int(DEVICE.split(":")[-1]) if ":" in DEVICE else 0
    major, minor = torch.cuda.get_device_capability(idx)
    if major < 8:
        COMPAT_MODE = True
        torch.backends.cuda.enable_flash_sdp(False)
        torch.backends.cuda.enable_mem_efficient_sdp(False)
        if hasattr(torch.backends.cuda, 'enable_cudnn_sdp'):
            torch.backends.cuda.enable_cudnn_sdp(False)
        os.environ["TORCH_CUDNN_V8_API_DISABLED"] = "1"
        log.warning(f"Compatibility mode ON — {torch.cuda.get_device_name(idx)} "
                    f"(compute {major}.{minor}) lacks cutlassF/flash-SDP support")
    else:
        log.info(f"GPU compute capability {major}.{minor} — fast kernels enabled")

# ── Patch resemble-perth (v1.0.0 ships PerthImplicitWatermarker as None) ──────
import perth
if perth.PerthImplicitWatermarker is None:
    perth.PerthImplicitWatermarker = perth.DummyWatermarker

# ── Patch librosa.load + librosa.resample to always return fp32 ──────────────
# librosa returns fp64 in some setups (depending on numpy/scipy/librosa
# version interactions). On CUDA, fp64 propagates from the loaded audio
# through every downstream layer (voice_encoder LSTM, FSMN conv,
# mel-spectrogram matmul, t3 transformer, s3gen) and crashes mixed-dtype
# ops. MPS auto-demotes silently — invisible on Mac, fatal on Windows.
# Monkey-patching at the module level catches every chatterbox call
# (Original, Turbo, Multilingual) since they all import `librosa` and use
# the qualified `librosa.load(...)` / `librosa.resample(...)` form.
# The chatterbox/s3tokenizer source files we edited locally have similar
# defensive casts, but THIS is the source-portable fix that ships with
# Liminal — a fresh `pip install chatterbox-tts==0.1.7` will work because
# this patch runs before any chatterbox audio loading.
import librosa as _liminal_librosa
_liminal_orig_load = _liminal_librosa.load
_liminal_orig_resample = _liminal_librosa.resample
def _liminal_load_fp32(*args, **kwargs):
    arr, sr = _liminal_orig_load(*args, **kwargs)
    if hasattr(arr, "dtype") and str(arr.dtype) != "float32":
        arr = arr.astype("float32", copy=False)
    return arr, sr
def _liminal_resample_fp32(*args, **kwargs):
    out = _liminal_orig_resample(*args, **kwargs)
    if hasattr(out, "dtype") and str(out.dtype) != "float32":
        out = out.astype("float32", copy=False)
    return out
_liminal_librosa.load = _liminal_load_fp32
_liminal_librosa.resample = _liminal_resample_fp32

# ── Load model ────────────────────────────────────────────────────────────────
# Three model classes available from upstream chatterbox-tts:
#   - ChatterboxTTS         (Original, English, 500M)
#   - ChatterboxTurboTTS    (Turbo, English, 350M, ~3× faster on Mac MPS)
#   - ChatterboxMultilingualTTS (23 languages, 500M)
# Only one is ever resident in VRAM — they swap on language change or user
# preference change. The lock serialises swap requests so two simultaneous TTS
# calls in different languages can't both try to load at once.

import gc, threading
from chatterbox.tts import ChatterboxTTS
try:
    from chatterbox.tts_turbo import ChatterboxTurboTTS
    _TURBO_AVAILABLE = True
except ImportError as e:
    log.warning(f"Chatterbox Turbo not available ({e}) — defaulting English to Original")
    ChatterboxTurboTTS = None
    _TURBO_AVAILABLE = False
try:
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS, SUPPORTED_LANGUAGES
    _MTL_AVAILABLE = True
except ImportError as e:
    log.warning(f"Multilingual Chatterbox not available ({e}) — English-only mode")
    ChatterboxMultilingualTTS = None
    SUPPORTED_LANGUAGES = {}
    _MTL_AVAILABLE = False

_model_lock = threading.RLock()  # RLock: _do_generate holds it while calling ensure_model, which also acquires it
_current_kind = None  # "original" | "turbo" | "multilingual"
model = None

def _read_tts_model_setting() -> str:
    """Read tts_model from SQLite settings; default 'turbo'.
    Valid values: 'turbo', 'original', 'multilingual'. Multilingual is also
    auto-selected for non-English requests; explicit 'multilingual' here lets
    a user pick the multilingual model even for English (e.g. for testing or
    consistency across language switches)."""
    if not DB_PATH.exists():
        return "turbo"
    try:
        con = sqlite3.connect(str(DB_PATH))
        row = con.execute("SELECT value FROM settings WHERE key='tts_model'").fetchone()
        con.close()
        if row and row[0] in ("turbo", "original", "multilingual"):
            return row[0]
    except Exception:
        pass
    return "turbo"

def resolve_model_kind(language: str) -> str:
    """Pick the model class based on requested language and tts_model setting.
    Non-English always uses multilingual; English honours user preference
    (default Turbo, but multilingual / original also allowed)."""
    lang = (language or "en").lower()
    if lang != "en" and lang in SUPPORTED_LANGUAGES:
        return "multilingual" if _MTL_AVAILABLE else "original"
    # English (or unsupported language falling back to English)
    pref = _read_tts_model_setting()
    if pref == "turbo" and _TURBO_AVAILABLE:
        return "turbo"
    if pref == "multilingual" and _MTL_AVAILABLE:
        return "multilingual"
    return "original"

def _apply_bf16(m):
    # bf16 cast on t3 was previously enabled on CUDA for VRAM savings — disabled
    # 2026-04-28 because newer chatterbox-tts 0.1.7 wheels (the dual-mode T3 with
    # GPT2/Llama dispatch + new BFloat16 logic) don't propagate the cast through
    # to input embeddings, producing
    #   "mat1 and mat2 must have the same dtype, but got Float and BFloat16"
    # on every generation. Same MPS-side reasoning applies: chatterbox's t3 has
    # residuals / input embeds that stay fp32, and matmul refuses mixed dtypes.
    # fp32 costs ~1-2 GB extra VRAM on a 4090 vs bf16 — irrelevant for users with
    # modern GPUs. Re-enable when chatterbox's own bf16 path is internally
    # consistent (or when we patch the casts ourselves).
    pass

def _force_fp32_on_cuda(m):
    """Demote every fp64 tensor reachable from m to float32 — params,
    buffers, and plain attributes. Plus monkey-patch F.conv1d/linear/matmul
    so any fp64 weights that escape this pass get coerced at call time.

    chatterbox+s3tokenizer have fp64 weights/buffers in places (mel_filters,
    FSMN conv layers, RoPE freqs_cis). MPS auto-demotes; CUDA preserves
    and crashes downstream ops with mixed dtypes. .float() recursion keeps
    not catching everything (some buffers held as plain attrs, some weights
    look like Parameters but don't respond to .to() calls), so we belt-and-
    suspenders by walking named_parameters / named_buffers explicitly AND
    monkey-patching the most common F.* functions.
    """
    if not DEVICE.startswith("cuda"):
        return  # MPS / CPU don't need this

    # ── Pass 1: standard .float() recursion via every nn.Module attribute
    seen = set()
    def cast_recursive(obj, path="m"):
        if id(obj) in seen:
            return
        seen.add(id(obj))
        if isinstance(obj, torch.nn.Module):
            try: obj.float()
            except Exception as e: log.warning(f"  .float() failed at {path}: {e}")
        if not hasattr(obj, "__dict__"): return
        for attr_name, attr in list(vars(obj).items()):
            if attr_name.startswith("_"): continue
            if isinstance(attr, torch.nn.Module):
                cast_recursive(attr, f"{path}.{attr_name}")
            elif isinstance(attr, torch.Tensor) and attr.dtype == torch.float64:
                try:
                    setattr(obj, attr_name, attr.to(torch.float32))
                    log.info(f"  demoted plain tensor {path}.{attr_name} to fp32")
                except Exception: pass
    try:
        cast_recursive(m, "m")
    except Exception as e:
        log.warning(f"recursion failed: {e}")

    # ── Pass 2: walk named_parameters / named_buffers on every nn.Module
    # we can find, and forcefully demote any fp64 to fp32 in-place. This
    # is more thorough than .float() because it operates on .data directly
    # and handles edge cases where .to() doesn't propagate (e.g. fused
    # operations, frozen parameters).
    fp64_found = []
    def force_demote_module(mod, path="m"):
        if not isinstance(mod, torch.nn.Module): return
        for name, p in mod.named_parameters(recurse=True):
            if p.dtype == torch.float64:
                fp64_found.append(f"{path}.{name} (param)")
                p.data = p.data.to(torch.float32)
        for name, b in mod.named_buffers(recurse=True):
            if b.dtype == torch.float64:
                fp64_found.append(f"{path}.{name} (buffer)")
                b.data = b.data.to(torch.float32)

    for sub_name in dir(m):
        if sub_name.startswith("_"): continue
        sub = getattr(m, sub_name, None)
        if isinstance(sub, torch.nn.Module):
            try: force_demote_module(sub, f"m.{sub_name}")
            except Exception as e: log.warning(f"force-demote failed at m.{sub_name}: {e}")
        # Also drill one level deeper for nested modules held as plain attrs
        if hasattr(sub, "__dict__"):
            for attr_name, attr in list(vars(sub).items()):
                if attr_name.startswith("_"): continue
                if isinstance(attr, torch.nn.Module):
                    try: force_demote_module(attr, f"m.{sub_name}.{attr_name}")
                    except Exception: pass

    if fp64_found:
        log.info(f"Demoted {len(fp64_found)} fp64 tensors to fp32:")
        for path in fp64_found[:20]:  # cap at 20 to avoid log flood
            log.info(f"  {path}")
        if len(fp64_found) > 20:
            log.info(f"  ... and {len(fp64_found) - 20} more")

    # ── Pass 3: monkey-patch F.conv1d/linear/matmul to coerce dtype at
    # call time. Catches any fp64 weights that survived passes 1+2 (e.g.
    # tensors created at runtime, lazy init, or held in non-Module objects).
    if not getattr(_force_fp32_on_cuda, "_patched_torch_fns", False):
        import torch.nn.functional as F
        for fn_name in ("conv1d", "conv2d", "conv3d", "linear"):
            if not hasattr(F, fn_name): continue
            orig = getattr(F, fn_name)
            def make_wrapper(orig_fn, name):
                def coerce(input, weight, bias=None, *args, **kwargs):
                    if weight.dtype != input.dtype:
                        weight = weight.to(input.dtype)
                    if bias is not None and bias.dtype != input.dtype:
                        bias = bias.to(input.dtype)
                    return orig_fn(input, weight, bias, *args, **kwargs)
                return coerce
            setattr(F, fn_name, make_wrapper(orig, fn_name))
        _force_fp32_on_cuda._patched_torch_fns = True
        log.info("Monkey-patched F.{conv1d,conv2d,conv3d,linear} for dtype coercion")

    log.info("Forced fp32 on CUDA — float64 contamination guarded (deep+)")

_KIND_TO_CLASS = {
    "original": ChatterboxTTS,
    "turbo": ChatterboxTurboTTS,
    "multilingual": ChatterboxMultilingualTTS,
}

def _load(kind):
    cls = _KIND_TO_CLASS[kind]
    if cls is None:
        raise RuntimeError(f"Model class for kind '{kind}' is not available in this build")
    log.info(f"Loading {cls.__name__} on {DEVICE} (first run downloads model weights)…")
    if COMPAT_MODE:
        with torch.nn.attention.sdpa_kernel(torch.nn.attention.SDPBackend.MATH):
            m = cls.from_pretrained(device=DEVICE)
        log.info(f"{cls.__name__} loaded in math-only SDPA mode")
    else:
        m = cls.from_pretrained(device=DEVICE)
    _force_fp32_on_cuda(m)
    _apply_bf16(m)
    log.info(f"{cls.__name__} ready.")
    return m

def ensure_model(kind):
    """Swap loaded model if needed. kind is 'original' | 'turbo' | 'multilingual'."""
    global model, _current_kind
    if kind == "multilingual" and not _MTL_AVAILABLE:
        log.warning("Multilingual requested but not available — falling back to Original")
        kind = "original"
    if kind == "turbo" and not _TURBO_AVAILABLE:
        log.warning("Turbo requested but not available — falling back to Original")
        kind = "original"
    with _model_lock:
        if _current_kind == kind and model is not None:
            return model
        if model is not None:
            log.info(f"Unloading {_current_kind} model to swap to {kind}…")
            try:
                model.t3.to("cpu")
            except Exception:
                pass
            del model
            model = None
            gc.collect()
            if DEVICE.startswith("cuda"):
                torch.cuda.empty_cache()
                torch.cuda.synchronize()
        model = _load(kind)
        _current_kind = kind
        return model

# NOTE: The English warm-start used to live here at module top-level. It's now
# inside the __main__ guard at the bottom so PyInstaller multiprocessing
# workers (spawned by ctranslate2 / onnxruntime / av / faster-whisper)
# re-importing this module DON'T also try to allocate a GPU slab and bind :8100,
# which crash-loops the supervisor and on Apple Silicon can cascade into a
# JetsamEvent system freeze.

# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(title="Liminal TTS Server")

class SpeechRequest(BaseModel):
    model: str = "chatterbox"
    input: str
    voice: str = "Abigail.wav"
    exaggeration: float = 0.5
    cfg_weight: float = 0.5
    temperature: float = 1.3
    language: str = "en"  # ISO 639-1; "en" routes to English-only model

@app.get("/v1/models")
def list_models():
    return {
        "object": "list",
        "data": [{"id": "chatterbox", "object": "model"}],
        "languages": sorted(SUPPORTED_LANGUAGES.keys()) if _MTL_AVAILABLE else ["en"],
    }

class PreloadRequest(BaseModel):
    # Either pass the explicit kind ('original'/'turbo'/'multilingual') OR a
    # language and let the server resolve. Used by the frontend to warm the
    # right model on language change / Set-click without producing audio.
    kind: str | None = None
    language: str | None = None

@app.post("/v1/preload")
def preload(req: PreloadRequest):
    """Trigger model swap to the requested kind. Returns once loaded so the
    client can display a 'loading' overlay while waiting. No audio produced."""
    if req.kind:
        kind = req.kind
    elif req.language is not None:
        kind = resolve_model_kind(req.language)
    else:
        kind = resolve_model_kind("en")
    if kind not in _KIND_TO_CLASS or _KIND_TO_CLASS[kind] is None:
        raise HTTPException(status_code=400, detail=f"unsupported kind: {kind}")
    ensure_model(kind)
    return {"ok": True, "kind": kind, "current": _current_kind}

@app.get("/device")
def device_info():
    info = {
        "device": DEVICE,
        "cuda": torch.cuda.is_available(),
        "mps": _mps_available(),
        "compat_mode": COMPAT_MODE,
    }
    if DEVICE.startswith("cuda"):
        idx = int(DEVICE.split(":")[-1]) if ":" in DEVICE else 0
        major, minor = torch.cuda.get_device_capability(idx)
        info["gpu_name"] = torch.cuda.get_device_name(idx)
        info["vram_gb"]  = round(torch.cuda.get_device_properties(idx).total_memory / 1e9, 1)
        info["bfloat16"] = torch.cuda.is_bf16_supported()
        info["compute_capability"] = f"{major}.{minor}"
    elif DEVICE == "mps":
        info["gpu_name"] = "Apple Silicon GPU (Metal)"
        info["vram_gb"] = "shared"
    info["loaded_model"] = _current_kind
    info["multilingual_available"] = _MTL_AVAILABLE
    info["supported_languages"] = sorted(SUPPORTED_LANGUAGES.keys()) if _MTL_AVAILABLE else ["en"]
    return info

# ── Text chunking ─────────────────────────────────────────────────────────────
# Chatterbox cuts off at ~200 words. Split at sentence boundaries, keeping
# each chunk under MAX_WORDS words.

MAX_WORDS = 180

def split_into_chunks(text: str) -> list[str]:
    """Split text on sentence boundaries so each chunk ≤ MAX_WORDS words."""
    # Split on sentence-ending punctuation followed by whitespace
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())
    chunks, current, count = [], [], 0
    for sent in sentences:
        words = len(sent.split())
        if count + words > MAX_WORDS and current:
            chunks.append(' '.join(current))
            current, count = [sent], words
        else:
            current.append(sent)
            count += words
    if current:
        chunks.append(' '.join(current))
    return [c for c in chunks if c.strip()]


def _do_generate(text, voice_path, exaggeration, cfg_weight, temperature, language="en"):
    lang = (language or "en").lower()
    if lang != "en" and lang not in SUPPORTED_LANGUAGES:
        log.warning(f"Unsupported language '{lang}', falling back to English")
        lang = "en"
    kind = resolve_model_kind(lang)
    # Hold the lock across ensure_model AND generate — otherwise a second request
    # can swap the model out from under a generation in flight and free its CUDA
    # memory, crashing the first request and wedging the server.
    with _model_lock:
        m = ensure_model(kind)
        kwargs = dict(
            audio_prompt_path=voice_path,
            exaggeration=exaggeration,
            cfg_weight=cfg_weight,
            temperature=temperature,
        )
        if kind == "multilingual":
            kwargs["language_id"] = lang
        return m.generate(text, **kwargs)

def generate_chunk(text, voice_path, exaggeration, cfg_weight, temperature, language="en"):
    if COMPAT_MODE:
        # Force math-only SDPA backend at generation time — cutlassF/flash crash on older GPUs
        with torch.nn.attention.sdpa_kernel(torch.nn.attention.SDPBackend.MATH):
            return _do_generate(text, voice_path, exaggeration, cfg_weight, temperature, language)
    return _do_generate(text, voice_path, exaggeration, cfg_weight, temperature, language)


@app.post("/v1/audio/speech")
def synthesise(req: SpeechRequest):
    if not req.input.strip():
        raise HTTPException(status_code=400, detail="input is required")

    # Resolve voice file
    voice_path = None
    candidate = VOICES_DIR / req.voice
    if candidate.exists():
        voice_path = str(candidate)
    elif Path(req.voice).exists():
        voice_path = req.voice
    else:
        wavs = list(VOICES_DIR.glob("*.wav")) + list(VOICES_DIR.glob("*.mp3"))
        if wavs:
            voice_path = str(wavs[0])
            log.warning(f"Voice '{req.voice}' not found, using {wavs[0].name}")

    chunks = split_into_chunks(req.input)
    log.info(f"Generating {len(req.input)} chars in {len(chunks)} chunk(s) | "
             f"voice={req.voice} lang={req.language} exag={req.exaggeration} cfg={req.cfg_weight} temp={req.temperature}")

    # Hold the lock for the full request so all chunks generate on the same
    # model instance — prevents a mid-request swap between chunks.
    try:
        with _model_lock:
            audio_parts = []
            for i, chunk in enumerate(chunks):
                log.info(f"  chunk {i+1}/{len(chunks)}: {len(chunk.split())} words")
                wav = generate_chunk(
                    chunk, voice_path,
                    float(req.exaggeration), float(req.cfg_weight), float(req.temperature),
                    req.language,
                )
                audio_parts.append(wav.squeeze().cpu().float().numpy())
            sr = model.sr
    except Exception as e:
        # Full traceback so dtype / shape failures show their origin file/line
        # instead of just the bare error message.
        log.exception(f"Generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    # Concatenate all chunks with a short silence between them
    import numpy as np
    silence = np.zeros(int(sr * 0.25), dtype=np.float32)  # 250ms gap
    combined = np.concatenate(
        [p for pair in zip(audio_parts, [silence] * len(audio_parts)) for p in pair][:-1]
    ) if len(audio_parts) > 1 else audio_parts[0]

    buf = io.BytesIO()
    sf.write(buf, combined, sr, format="WAV")
    wav_bytes = _embed_wav_synthetic_metadata(buf.getvalue())

    return Response(
        content=wav_bytes,
        media_type="audio/wav",
        headers={
            "X-AI-Generated": "true",
            "X-AI-System": "Liminal-Chatterbox-TTS",
        },
    )


def _embed_wav_synthetic_metadata(wav_bytes: bytes) -> bytes:
    """Append a RIFF LIST/INFO chunk marking the audio as AI-generated.

    Required for EU AI Act Art. 50(2) machine-readable disclosure of
    synthetic audio. Fields written:
        ICMT — free-form comment ("ai-generated=true; ...")
        ISFT — software identifier ("Liminal Chatterbox TTS")
        IART — artist ("Liminal — Synthetic Voice")
        IPRD — product
    """
    import struct
    if len(wav_bytes) < 12 or wav_bytes[:4] != b"RIFF" or wav_bytes[8:12] != b"WAVE":
        return wav_bytes  # not a WAV, leave alone

    def _info_subchunk(fourcc: bytes, value: str) -> bytes:
        payload = value.encode("ascii", errors="replace") + b"\x00"
        if len(payload) % 2:
            payload += b"\x00"
        return fourcc + struct.pack("<I", len(payload)) + payload

    fields = [
        (b"ICMT", "ai-generated=true; ai-act=Art50(2); system=Liminal-Chatterbox-TTS"),
        (b"ISFT", "Liminal Chatterbox TTS"),
        (b"IART", "Liminal - Synthetic Voice"),
        (b"IPRD", "Liminal"),
    ]
    info_payload = b"INFO" + b"".join(_info_subchunk(c, v) for c, v in fields)
    list_chunk = b"LIST" + struct.pack("<I", len(info_payload)) + info_payload

    new_body = wav_bytes[12:] + list_chunk
    new_size = len(new_body) + 4  # +4 for the "WAVE" marker
    return b"RIFF" + struct.pack("<I", new_size) + b"WAVE" + wav_bytes[12:] + list_chunk

# ── STT (Whisper) ─────────────────────────────────────────────────────────────
# faster-whisper runs on ctranslate2, independent of torch/chatterbox state, so
# it cannot interact with the dtype patches, model swaps, or fp32 monkey-patches
# above. The model is loaded lazily on the first /v1/transcribe call so app boot
# is unchanged for users who never use dictation.

_whisper_model = None
_whisper_loaded_name = None
_whisper_lock = threading.Lock()
_WHISPER_VALID = {"tiny", "base", "small", "medium", "large-v3"}

def _read_whisper_setting() -> str:
    # Resolution order: SQLite setting → env var → default 'base'. The DB read
    # mirrors how _read_tts_model_setting works for chatterbox so the user can
    # change the Whisper model from Settings without an env var or restart.
    try:
        db_path = os.path.join(USER_DATA, "liminal.db")
        if os.path.exists(db_path):
            import sqlite3
            con = sqlite3.connect(db_path)
            row = con.execute("SELECT value FROM settings WHERE key='whisper_model'").fetchone()
            con.close()
            if row and row[0] in _WHISPER_VALID:
                return row[0]
    except Exception:
        pass
    env_val = os.environ.get("LIMINAL_WHISPER_MODEL", "base")
    return env_val if env_val in _WHISPER_VALID else "base"

def _whisper_device_compute():
    # ctranslate2 device strings differ from torch's. CUDA → "cuda" + float16,
    # MPS isn't supported by ctranslate2 (falls back to CPU), CPU → int8 for speed.
    if DEVICE.startswith("cuda"):
        return "cuda", "float16"
    return "cpu", "int8"

def _ensure_whisper(want_name: str | None = None):
    """Load (or swap to) the requested Whisper model. If `want_name` is None,
    resolves from the SQLite setting / env var. A swap discards the old model
    and loads the new one — model files are cached on disk so swapping back is
    fast after the first load."""
    global _whisper_model, _whisper_loaded_name
    target = want_name or _read_whisper_setting()
    if target not in _WHISPER_VALID:
        target = "base"
    with _whisper_lock:
        if _whisper_model is not None and _whisper_loaded_name == target:
            return _whisper_model
        from faster_whisper import WhisperModel
        device, compute = _whisper_device_compute()
        if _whisper_model is not None:
            log.info(f"Swapping Whisper model {_whisper_loaded_name} -> {target}")
            del _whisper_model
            _whisper_model = None
            import gc; gc.collect()
            if DEVICE.startswith("cuda"):
                torch.cuda.empty_cache()
        log.info(f"Loading Whisper model={target} device={device} compute={compute}")
        _whisper_model = WhisperModel(target, device=device, compute_type=compute)
        _whisper_loaded_name = target
        return _whisper_model

class WhisperPreloadRequest(BaseModel):
    model: str | None = None  # one of _WHISPER_VALID; None = read setting

@app.post("/v1/whisper/preload")
def whisper_preload(req: WhisperPreloadRequest):
    """Pre-load (or swap to) a Whisper model so the next /v1/transcribe call
    doesn't pay the ~5-30s load cost. Frontend calls this after the user picks
    a model in Settings → Dictate."""
    if req.model and req.model not in _WHISPER_VALID:
        raise HTTPException(status_code=400, detail=f"unsupported whisper model: {req.model}")
    _ensure_whisper(req.model)
    return {"ok": True, "model": _whisper_loaded_name}

@app.post("/v1/transcribe")
async def transcribe(audio: UploadFile = File(...), language: str | None = Form(None)):
    """Transcribe an uploaded audio file (any format faster-whisper/ffmpeg accepts).
    `language` is optional ISO 639-1; omit for auto-detect."""
    try:
        data = await audio.read()
        if not data:
            raise HTTPException(status_code=400, detail="empty audio")
        # faster-whisper accepts a file-like or path; an in-memory BytesIO is simplest
        import io
        model = _ensure_whisper()
        segments, info = model.transcribe(
            io.BytesIO(data),
            language=language or None,
            vad_filter=True,
        )
        text = "".join(seg.text for seg in segments).strip()
        return {"text": text, "language": info.language, "duration": info.duration}
    except HTTPException:
        raise
    except Exception as e:
        log.exception("transcribe failed")
        raise HTTPException(status_code=500, detail=str(e))

# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    log.info(f"Voices: {VOICES_DIR}")
    # Warm-start with the user's preferred English model — keeps the common
    # case fast. Inside __main__ so multiprocessing workers don't re-trigger it.
    ensure_model(resolve_model_kind("en"))
    log.info(f"Starting on http://localhost:{PORT}")
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="warning")
