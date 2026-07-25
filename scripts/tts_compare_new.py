"""
Standalone A/B TTS test — hear the newest Chatterbox vs your current build.

This synthesizes a few sentences with whatever `chatterbox` is installed in the
ACTIVE venv, tags every output file with the installed version, and writes them
to ./tts_compare_out/. It touches NOTHING in your running Liminal — separate
venv, separate output folder.

How to use (see the chat message that generated this file for the exact venv +
install commands):
  1. Make a fresh venv and install the NEWEST chatterbox in it.
  2. Run:  python scripts/tts_compare_new.py
  3. Listen to ./tts_compare_out/*.wav
  4. (optional, for a true A/B) make a second venv pinned to your CURRENT
     commit (1a2e63a...) and run this again — the version tag in the filenames
     keeps the two sets from colliding, so you can compare old vs new directly.

It loads Turbo (English) and Multilingual, prints the model version + supported
language count (so you can confirm you actually got v3 / 25 languages), times
each synth (realtime factor), and saves the audio. Failures for one model are
caught and reported so the rest still runs.
"""
import time
from pathlib import Path

# perth (the watermarker) ships PerthImplicitWatermarker as None in some
# installs; chatterbox instantiates it in __init__, so patch it or loading
# crashes. Same shim Liminal's tts_server.py applies.
try:
    import perth
    if getattr(perth, "PerthImplicitWatermarker", None) is None:
        perth.PerthImplicitWatermarker = perth.DummyWatermarker
except Exception:
    pass

import numpy as np
import torch
import soundfile as sf

REPO_ROOT = Path(__file__).resolve().parent.parent
VOICE = REPO_ROOT / "backend" / "default-voices" / "Iris.wav"
OUT = REPO_ROOT / "tts_compare_out"
OUT.mkdir(exist_ok=True)

# Pick the best available device.
if torch.cuda.is_available():
    DEVICE = "cuda"
elif getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
    DEVICE = "mps"
else:
    DEVICE = "cpu"
print(f"device: {DEVICE}")

# Tag outputs by the installed chatterbox version so old-vs-new files don't collide.
try:
    import importlib.metadata as md
    VER = md.version("chatterbox-tts")
except Exception:
    try:
        import chatterbox
        VER = getattr(chatterbox, "__version__", "unknown")
    except Exception:
        VER = "unknown"
TAG = "".join(c if c.isalnum() else "-" for c in VER)[:24]
print(f"chatterbox version: {VER}  (file tag: {TAG})")

EN = ("The quick brown fox jumps over the lazy dog. "
      "I honestly can't believe how natural this sounds now.")
FR = "Bonjour, ceci est un test de la nouvelle voix multilingue de Chatterbox."

assert VOICE.exists(), f"reference voice not found: {VOICE}"


def save(wav, model, path):
    arr = wav.detach().cpu().numpy().squeeze() if hasattr(wav, "detach") else np.asarray(wav).squeeze()
    sr = int(getattr(model, "sr", 24000) or 24000)
    sf.write(str(path), arr, sr)
    return len(arr) / sr


def timed(label, fn, model, path):
    try:
        t0 = time.perf_counter()
        wav = fn()
        wall = time.perf_counter() - t0
        dur = save(wav, model, path)
        rt = wall / dur if dur else float("nan")
        print(f"  {label}: {path.name}  |  {wall:.2f}s wall / {dur:.2f}s audio = {rt:.2f}x realtime")
    except Exception as e:
        print(f"  {label}: FAILED — {e}")


# ── Turbo (English) ────────────────────────────────────────────────────────
try:
    from chatterbox.tts_turbo import ChatterboxTurboTTS
    print("loading Turbo...")
    m = ChatterboxTurboTTS.from_pretrained(device=DEVICE)
    timed("Turbo EN", lambda: m.generate(EN, audio_prompt_path=str(VOICE)), m, OUT / f"turbo_en_{TAG}.wav")
    del m
    if DEVICE == "cuda":
        torch.cuda.empty_cache()
except Exception as e:
    print(f"Turbo unavailable: {e}")

# ── Multilingual (report language count; try EN + FR) ──────────────────────
try:
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS
    try:
        from chatterbox.mtl_tts import SUPPORTED_LANGUAGES
        print(f"multilingual supported languages: {len(SUPPORTED_LANGUAGES)}")
    except Exception:
        pass
    print("loading Multilingual...")
    m = ChatterboxMultilingualTTS.from_pretrained(device=DEVICE)

    # generate() signature varies across versions — try with language_id, then without.
    def gen(text, lang):
        try:
            return m.generate(text, language_id=lang, audio_prompt_path=str(VOICE))
        except TypeError:
            return m.generate(text, audio_prompt_path=str(VOICE))

    timed("MTL EN", lambda: gen(EN, "en"), m, OUT / f"mtl_en_{TAG}.wav")
    timed("MTL FR", lambda: gen(FR, "fr"), m, OUT / f"mtl_fr_{TAG}.wav")
    del m
    if DEVICE == "cuda":
        torch.cuda.empty_cache()
except Exception as e:
    print(f"Multilingual unavailable: {e}")

print(f"\nDone. Listen to the files in: {OUT}")
