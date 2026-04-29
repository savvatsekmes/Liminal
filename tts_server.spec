# -*- mode: python ; coding: utf-8 -*-
#
# PyInstaller build spec for the Liminal TTS server.
#
# Build with:    pyinstaller tts_server.spec --noconfirm
# Output:        dist/tts_server/tts_server(.exe)
#
# Notes:
#   - torch + transformers + chatterbox-tts pull in a LOT of stuff. We use
#     `collect_all` for the heavyweights so PyInstaller picks up data files,
#     submodules, dynamic libs, and metadata in one shot.
#   - Hidden imports cover modules that PyInstaller's static analysis misses
#     because they're loaded by string lookup at runtime (uvicorn workers,
#     pydantic v2 internals, perth, etc.).
#   - The Chatterbox model weights are NOT bundled here — they're downloaded
#     into the user data dir on first launch (~1 GB). Bundling them would push
#     the installer past 2 GB; the first-run download is documented in
#     INSTALL.md instead.

from PyInstaller.utils.hooks import collect_all, collect_submodules, copy_metadata

datas = []
binaries = []
hiddenimports = []

# diffusers / transformers / huggingface_hub all do runtime version checks via
# importlib.metadata.version("..."), which fails inside a PyInstaller bundle
# unless we explicitly copy each package's .dist-info metadata. Missing any of
# these causes "No package metadata was found for ..." at startup.
for pkg in (
    'requests',
    'transformers',
    'diffusers',
    'tokenizers',
    'huggingface_hub',
    'safetensors',
    'numpy',
    'tqdm',
    'regex',
    'packaging',
    'filelock',
    'pyyaml',
    'fsspec',
    'accelerate',
    'torch',
    'torchaudio',
    'faster-whisper',
    'ctranslate2',
    'onnxruntime',
    'av',
):
    try:
        datas += copy_metadata(pkg)
    except Exception:
        pass

# Heavyweights — collect everything they ship.
for pkg in (
    'torch',
    'torchaudio',
    'transformers',
    'tokenizers',
    'chatterbox',
    'perth',
    'librosa',
    'soundfile',
    'numpy',
    'scipy',
    'safetensors',
    'huggingface_hub',
    'sentencepiece',
    'faster_whisper',
    'ctranslate2',
    'onnxruntime',
    'av',
):
    try:
        d, b, h = collect_all(pkg)
        datas += d
        binaries += b
        hiddenimports += h
    except Exception:
        # Optional packages — skip if not installed
        pass

# Uvicorn / FastAPI dynamic imports
hiddenimports += collect_submodules('uvicorn')
hiddenimports += collect_submodules('starlette')
hiddenimports += collect_submodules('fastapi')
hiddenimports += [
    'uvicorn.lifespan.on',
    'uvicorn.lifespan.off',
    'uvicorn.protocols.http.auto',
    'uvicorn.protocols.http.h11_impl',
    'uvicorn.protocols.websockets.auto',
    'uvicorn.loops.auto',
    'uvicorn.loops.asyncio',
    'pydantic.deprecated.decorator',
]

# Chatterbox model classes — tts_server.py loads these via try/except so
# PyInstaller's static analysis can miss the optional ones (Turbo,
# Multilingual) and the bundle silently falls back to Original 500M only.
# collect_all('chatterbox') above SHOULD pick these up, but listing them
# explicitly is cheap insurance against future PyInstaller versions or
# chatterbox repackagings that change the discovery surface.
hiddenimports += [
    'chatterbox.tts',
    'chatterbox.tts_turbo',
    'chatterbox.mtl_tts',
    'chatterbox.vc',
]

block_cipher = None

a = Analysis(
    ['tts_server.py'],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Trim some obvious dead weight to keep binary size sane.
        'matplotlib',
        'PIL.ImageQt',
        'tkinter',
        'PyQt5',
        'PyQt6',
        'PySide2',
        'PySide6',
        'IPython',
        'jupyter',
        'notebook',
    ],
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='tts_server',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name='tts_server',
)
