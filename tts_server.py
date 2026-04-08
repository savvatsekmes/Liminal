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

log.info("Loading ChatterboxTTS (first run downloads ~1 GB)…")
from chatterbox.tts import ChatterboxTTS

if COMPAT_MODE:
    with torch.nn.attention.sdpa_kernel(torch.nn.attention.SDPBackend.MATH):
        model = ChatterboxTTS.from_pretrained(device=DEVICE)
    log.info("Model loaded in math-only SDPA mode")
else:
    model = ChatterboxTTS.from_pretrained(device=DEVICE)

# BFloat16 only on Ampere+ where it's hardware-native.
# Turing reports bf16 support but it's emulated and causes kernel issues.
if DEVICE.startswith("cuda") and not COMPAT_MODE and torch.cuda.is_bf16_supported():
    try:
        model.t3.to(torch.bfloat16)
        torch.cuda.empty_cache()
        log.info("BFloat16 enabled on t3")
    except Exception as e:
        log.warning(f"BFloat16 not applied: {e}")

log.info("Model ready.")

# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(title="Liminal TTS Server")

class SpeechRequest(BaseModel):
    model: str = "chatterbox"
    input: str
    voice: str = "Abigail.wav"
    exaggeration: float = 0.5
    cfg_weight: float = 0.5
    temperature: float = 1.3

@app.get("/v1/models")
def list_models():
    return {"object": "list", "data": [{"id": "chatterbox", "object": "model"}]}

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


# cudagraphs-manual is the faster branch default but fails on many PyTorch/CUDA
# version combos with cudaErrorStreamCaptureInvalidated during capture.
# "eager" is stable; bfloat16 on both t3+conds.t3 still gives a speed boost.
_T3_PARAMS = {"generate_token_backend": "eager"} if DEVICE.startswith("cuda") else {}

def _do_generate(text, voice_path, exaggeration, cfg_weight, temperature):
    try:
        return model.generate(
            text,
            audio_prompt_path=voice_path,
            exaggeration=exaggeration,
            cfg_weight=cfg_weight,
            temperature=temperature,
            t3_params=_T3_PARAMS,
        )
    except TypeError:
        # Older API without t3_params / temperature
        return model.generate(
            text,
            audio_prompt_path=voice_path,
            exaggeration=exaggeration,
            cfg_weight=cfg_weight,
        )

def generate_chunk(text, voice_path, exaggeration, cfg_weight, temperature):
    if COMPAT_MODE:
        # Force math-only SDPA backend at generation time — cutlassF/flash crash on older GPUs
        with torch.nn.attention.sdpa_kernel(torch.nn.attention.SDPBackend.MATH):
            return _do_generate(text, voice_path, exaggeration, cfg_weight, temperature)
    return _do_generate(text, voice_path, exaggeration, cfg_weight, temperature)


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
             f"voice={req.voice} exag={req.exaggeration} cfg={req.cfg_weight} temp={req.temperature}")

    try:
        audio_parts = []
        for i, chunk in enumerate(chunks):
            log.info(f"  chunk {i+1}/{len(chunks)}: {len(chunk.split())} words")
            wav = generate_chunk(
                chunk, voice_path,
                float(req.exaggeration), float(req.cfg_weight), float(req.temperature),
            )
            audio_parts.append(wav.squeeze().cpu().float().numpy())
    except Exception as e:
        log.error(f"Generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    # Concatenate all chunks with a short silence between them
    import numpy as np
    silence = np.zeros(int(model.sr * 0.25), dtype=np.float32)  # 250ms gap
    combined = np.concatenate(
        [p for pair in zip(audio_parts, [silence] * len(audio_parts)) for p in pair][:-1]
    ) if len(audio_parts) > 1 else audio_parts[0]

    buf = io.BytesIO()
    sf.write(buf, combined, model.sr, format="WAV")
    buf.seek(0)

    return Response(content=buf.read(), media_type="audio/wav")

# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    log.info(f"Voices: {VOICES_DIR}")
    log.info(f"Starting on http://localhost:{PORT}")
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="warning")
