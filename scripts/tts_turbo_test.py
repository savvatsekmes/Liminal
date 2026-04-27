"""Standalone test: time a Chatterbox-Turbo synthesis on MPS and compare to fp32 baseline.

Run from repo root with the .venv-turbo venv:
    source .venv-turbo/bin/activate
    python scripts/tts_turbo_test.py

Baseline to beat (fp32 ChatterboxTTS English on MPS):
    18.81s wall time → 5.52s audio = 3.4× slower than realtime.
"""
import time
from pathlib import Path

import torch
import soundfile as sf

# Same monkey-patch we apply in tts_server.py — perth ships PerthImplicitWatermarker
# as None in some installs, and chatterbox tries to instantiate it in __init__.
import perth
if perth.PerthImplicitWatermarker is None:
    perth.PerthImplicitWatermarker = perth.DummyWatermarker

REPO_ROOT = Path(__file__).resolve().parent.parent
VOICE = REPO_ROOT / "backend" / "default-voices" / "Iris.wav"
TEXT = ("The quick brown fox jumps over the lazy dog. "
        "It was the best of times, it was the worst of times.")
OUT = Path("/tmp/turbo-out.wav")
WARMUP = Path("/tmp/turbo-warmup.wav")

assert VOICE.exists(), f"voice not found: {VOICE}"
assert torch.backends.mps.is_available(), "MPS not available"

print("Loading ChatterboxTurboTTS on MPS…")
t0 = time.perf_counter()
from chatterbox.tts_turbo import ChatterboxTurboTTS
model = ChatterboxTurboTTS.from_pretrained(device="mps")
print(f"  load: {time.perf_counter() - t0:.2f}s")

# Warmup — first call always pays JIT/cache cost; we don't want to penalize that.
print("Warmup synthesis (discarded)…")
t0 = time.perf_counter()
wav = model.generate("Warming up the kernels.", audio_prompt_path=str(VOICE))
print(f"  warmup: {time.perf_counter() - t0:.2f}s")
sf.write(str(WARMUP), wav.squeeze().cpu().float().numpy(), model.sr)

print(f"\nTimed synthesis ({len(TEXT)} chars):")
t0 = time.perf_counter()
wav = model.generate(TEXT, audio_prompt_path=str(VOICE))
wall = time.perf_counter() - t0

audio = wav.squeeze().cpu().float().numpy()
duration = len(audio) / model.sr
sf.write(str(OUT), audio, model.sr)

print(f"  wall:        {wall:.2f}s")
print(f"  audio:       {duration:.2f}s @ {model.sr} Hz")
print(f"  realtime ×:  {wall / duration:.2f}× slower than realtime")
print(f"  output:      {OUT}")
print()
print(f"fp32 baseline:  18.81s wall / 5.52s audio = 3.41× slower than realtime")
print(f"Turbo result:   {wall:.2f}s wall / {duration:.2f}s audio = {wall / duration:.2f}× slower than realtime")
ratio = (wall / duration) / 3.41
if ratio < 1:
    print(f"→ Turbo is {1/ratio:.2f}× faster than fp32 baseline.")
else:
    print(f"→ Turbo is {ratio:.2f}× slower than fp32 baseline.")
