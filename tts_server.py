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
VOICES_DIR = Path(os.environ.get("VOICES_DIR", BASE_DIR / "backend" / "data" / "voices"))
DB_PATH    = BASE_DIR / "backend" / "data" / "liminal.db"

def resolve_device() -> str:
    """Pick the device to run on, checking env → DB → auto."""
    # 1. Explicit env var
    env = os.environ.get("TTS_DEVICE", "").strip()
    if env and env != "auto":
        return env

    # 2. Liminal settings DB
    if DB_PATH.exists():
        try:
            con = sqlite3.connect(str(DB_PATH))
            row = con.execute("SELECT value FROM settings WHERE key='tts_device'").fetchone()
            con.close()
            if row and row[0] and row[0] != "auto":
                return row[0]
        except Exception:
            pass

    # 3. Auto: first CUDA GPU, else CPU
    if torch.cuda.is_available() and torch.cuda.device_count() > 0:
        return "cuda:0"
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

# ── Patch resemble-perth (v1.0.0 ships PerthImplicitWatermarker as None) ──────
import perth
if perth.PerthImplicitWatermarker is None:
    perth.PerthImplicitWatermarker = perth.DummyWatermarker

# ── Load model ────────────────────────────────────────────────────────────────

log.info("Loading ChatterboxTTS (first run downloads ~1 GB)…")
from chatterbox.tts import ChatterboxTTS
model = ChatterboxTTS.from_pretrained(device=DEVICE)

# Convert T3 to BFloat16. model.conds.t3 is a custom dataclass (T3Cond), not an
# nn.Module, so it doesn't accept .to(dtype) — cast only the LLaMA backbone.
if DEVICE.startswith("cuda") and torch.cuda.is_bf16_supported():
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
    info = {"device": DEVICE, "cuda": torch.cuda.is_available()}
    if DEVICE.startswith("cuda"):
        idx = int(DEVICE.split(":")[-1]) if ":" in DEVICE else 0
        info["gpu_name"] = torch.cuda.get_device_name(idx)
        info["vram_gb"]  = round(torch.cuda.get_device_properties(idx).total_memory / 1e9, 1)
        info["bfloat16"] = torch.cuda.is_bf16_supported()
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

def generate_chunk(text, voice_path, exaggeration, cfg_weight, temperature):
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
