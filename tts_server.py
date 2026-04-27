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
from fastapi import FastAPI, HTTPException
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
    Only 'turbo' and 'original' are valid — multilingual is auto-selected per language."""
    if not DB_PATH.exists():
        return "turbo"
    try:
        con = sqlite3.connect(str(DB_PATH))
        row = con.execute("SELECT value FROM settings WHERE key='tts_model'").fetchone()
        con.close()
        if row and row[0] in ("turbo", "original"):
            return row[0]
    except Exception:
        pass
    return "turbo"

def resolve_model_kind(language: str) -> str:
    """Pick the model class based on requested language and tts_model setting.
    Non-English always uses multilingual; English honours user preference (default Turbo)."""
    lang = (language or "en").lower()
    if lang != "en" and lang in SUPPORTED_LANGUAGES:
        return "multilingual" if _MTL_AVAILABLE else "original"
    # English (or unsupported language falling back to English)
    pref = _read_tts_model_setting()
    if pref == "turbo" and _TURBO_AVAILABLE:
        return "turbo"
    return "original"

def _apply_bf16(m):
    # Tested on MPS: bf16 cast made synthesis ~40% slower because chatterbox uses
    # ops without native bf16 MPS kernels, forcing constant bf16↔fp32 conversions.
    # fp16 on MPS also fails: t3 has residuals / input embeds that stay fp32 in
    # upstream chatterbox code, and MPS's mps.add op refuses mixed dtypes
    # ("requires the same element type for all operands"), aborting the process.
    # Casting the whole model (rather than just t3) is unsafe for s3gen/ve.
    # CUDA-only for now; MPS stays fp32.
    if DEVICE.startswith("cuda") and not COMPAT_MODE and torch.cuda.is_bf16_supported():
        try:
            m.t3.to(torch.bfloat16)
            torch.cuda.empty_cache()
            log.info("BFloat16 enabled on t3")
        except Exception as e:
            log.warning(f"BFloat16 not applied: {e}")

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

# Warm-start with the user's preferred English model — keeps the common case fast
ensure_model(resolve_model_kind("en"))

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
        log.error(f"Generation failed: {e}")
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

# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    log.info(f"Voices: {VOICES_DIR}")
    log.info(f"Starting on http://localhost:{PORT}")
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="warning")
