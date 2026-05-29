# -*- mode: python ; coding: utf-8 -*-
#
# PyInstaller build spec for the Liminal YubiKey helper.
#
# Build with:    pyinstaller yubikey_helper.spec --noconfirm
# Output:        dist/yubikey_helper/yubikey_helper(.exe)
#
# Notes:
#   - This is the macOS-only side of Liminal's YubiKey 2FA. Windows uses
#     browser WebAuthn (Windows Hello provides the PIN UI for free). On
#     macOS, Electron's Chromium lacks the FIDO2 PIN entry dialog, so the
#     backend shells out to this binary to do CTAP2 over USB HID directly.
#   - python-fido2 pulls cryptography + pyhidapi. Compared to tts_server,
#     this is tiny — final bundle is around 30 MB.
#   - No model weights, no HuggingFace metadata, no PyTorch — everything
#     this helper needs ships as plain Python + a couple of dylibs.

from PyInstaller.utils.hooks import collect_all, collect_submodules, copy_metadata

datas = []
binaries = []
hiddenimports = []

# fido2 + cryptography both rely on importlib.metadata at runtime to discover
# crypto backends and protocol versions. Without the .dist-info metadata
# bundled in, those lookups fail inside the PyInstaller bundle and the helper
# crashes at first device probe.
for pkg in ('fido2', 'cryptography'):
    try:
        datas += copy_metadata(pkg)
    except Exception:
        pass

# Collect the libraries' submodules + native shared objects (cryptography
# ships compiled C extensions for AES/HMAC; pyhidapi loads libhidapi.dylib
# on macOS). collect_all picks these up in one shot.
for pkg in ('fido2', 'cryptography'):
    try:
        d, b, h = collect_all(pkg)
        datas += d
        binaries += b
        hiddenimports += h
    except Exception:
        pass

# pyhidapi loads its C library at import time via ctypes. Make sure the
# bundled .dylib comes along.
try:
    d, b, h = collect_all('pyhidapi')
    datas += d
    binaries += b
    hiddenimports += h
except Exception:
    pass

block_cipher = None

a = Analysis(
    ['yubikey_helper.py'],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Trim the obvious dead weight — none of this is needed for a tiny
        # CLI that talks CTAP2 over HID.
        'tkinter',
        'matplotlib',
        'PIL',
        'numpy',
        'scipy',
        'pandas',
        'IPython',
        'jupyter',
    ],
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='yubikey_helper',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    # console=True so the Node backend can capture stdout/stderr via
    # child_process. There is no GUI to suppress.
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
    name='yubikey_helper',
)
