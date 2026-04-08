# Installing Liminal

A turnkey installer for Windows, macOS (Apple Silicon), and Linux. After install,
launch Liminal from your Applications / Start Menu / app launcher — no terminals,
no Node, no Python required.

> Looking to **develop** Liminal instead of just running it? See the
> "Developer setup" section in [README.md](README.md).

---

## System requirements

| OS | Minimum | Notes |
|---|---|---|
| **Windows** | 10 (1809+) or 11, x64 | NVIDIA GPU with recent driver recommended for fast TTS |
| **macOS** | 12 Monterey or newer, **Apple Silicon** (M1/M2/M3/M4) | Intel Macs run but TTS falls back to CPU and is slow |
| **Linux** | Ubuntu 22.04+ / Fedora 38+ / Debian 12+, x64 | NVIDIA GPU + recent CUDA-capable driver recommended |

Disk: ~2 GB for the app + ~1 GB on first launch when the TTS model downloads.

---

## Prerequisite: install Ollama

Liminal uses [Ollama](https://ollama.com) to run a local LLM. It is **not bundled** —
install it once and Liminal will detect it automatically.

1. Download Ollama for your OS from [ollama.com/download](https://ollama.com/download)
2. After install, pull a model from a terminal:
   ```
   ollama pull qwen3:4b
   ```
   (or any model you prefer — see [ollama.com/library](https://ollama.com/library))
3. Ollama runs on `http://localhost:11434` and starts automatically on boot.

You can also use cloud providers (Anthropic / OpenAI) instead — add your API key
in Liminal's Settings after install.

---

## Download & install

Grab the latest installer for your OS from the
[Liminal releases page](https://github.com/savvatsekmes/liminal/releases) (link
will work once the first release is published).

### Windows

1. Download `Liminal-Setup-X.Y.Z.exe`
2. Double-click. Windows SmartScreen may warn that the publisher is unknown
   (the build is currently unsigned). Click **More info → Run anyway**.
3. Pick an install location and finish the wizard. Desktop and Start Menu
   shortcuts are created automatically.

### macOS (Apple Silicon)

1. Download `Liminal-X.Y.Z-arm64.dmg`
2. Open the `.dmg` and drag **Liminal** into the **Applications** folder.
3. First launch: right-click the app → **Open** → confirm. (The build is
   currently unnotarized; this bypass is only needed once.)

### Linux

- **AppImage:** download `Liminal-X.Y.Z.AppImage`, run `chmod +x` on it,
  then double-click or run from a terminal.
- **Debian/Ubuntu:** download `liminal_X.Y.Z_amd64.deb`, then
  `sudo dpkg -i liminal_*.deb`.

---

## First launch

1. Liminal spawns three local services in the background — the Node backend
   (port 3001), the Python TTS server (port 8100), and the renderer.
2. The TTS server downloads ~1 GB of model weights on first launch. Expect
   30–90 seconds before the home screen becomes responsive. This happens once.
3. You'll be prompted to create a username and password — these protect the
   app locally. There is no cloud account, no telemetry.

---

## GPU notes

Liminal's TTS engine (Chatterbox) runs much faster on a GPU than on CPU.
Detection is automatic and platform-specific:

### Windows / Linux (NVIDIA)

- The app calls `nvidia-smi` to enumerate CUDA GPUs and lists them in
  **Settings → Voice → GPU**.
- Modern cards (RTX 30/40/50-series, Ampere or newer, compute capability ≥ 8.0)
  use the fast `flash`/`mem-efficient` SDPA kernels.
- **Older cards** (RTX 20-series Turing, GTX 10-series Pascal — compute < 8.0)
  automatically run in **compatibility mode**: math-only attention, no bf16.
  TTS still works but is slower. A yellow notice appears in Settings explaining
  why.
- AMD GPUs are not currently supported (no ROCm path).

### macOS (Apple Silicon)

- **Apple Silicon Macs** (M1/M2/M3/M4) use PyTorch's
  [Metal Performance Shaders (MPS)](https://developer.apple.com/metal/pytorch/)
  backend automatically. The app does **not** call `nvidia-smi` on macOS — Mac
  detection goes through the TTS server's `/device` endpoint, which knows
  about MPS.
- The dropdown shows a single **Apple Silicon GPU (Metal)** option.
- **Intel Macs** have no MPS backend and fall back to CPU. TTS will work but
  generation is noticeably slower; consider using a cloud TTS provider.

### CPU fallback

Any system without a supported GPU runs TTS on CPU. Quality is identical, but
generation takes ~5–10× longer.

---

## Where Liminal stores your data

Everything stays on your machine — no cloud, no sync.

| OS | Path |
|---|---|
| Windows | `%APPDATA%\Liminal\` (e.g. `C:\Users\You\AppData\Roaming\Liminal\`) |
| macOS | `~/Library/Application Support/Liminal/` |
| Linux | `~/.config/Liminal/` |

This directory contains:

- `liminal.db` — SQLite database (entries, notes, reflections, settings)
- `vectra/` — local vector index for semantic search
- `voices/` — TTS voice samples
- `avatars/` — your profile picture
- `models/` — cached embedding model
- `backend.log`, `tts_server.log` — diagnostic logs (read these if something
  goes wrong)

---

## Troubleshooting

### "Ollama not reachable" warning

- Confirm Ollama is running: open a terminal and run `ollama list`.
- Confirm it's bound to `localhost:11434`. On Windows, **Hyper-V** can
  occasionally claim port 11434. The repo includes a `setup-ports.ps1` script
  that excludes the port from Hyper-V's dynamic range — see
  [README.md](README.md) for usage.

### TTS button does nothing / "Test Voice" fails

- Check `tts_server.log` in your data directory.
- The first launch downloads ~1 GB of model weights — give it 30–90 seconds.
- If you have an older NVIDIA GPU and see `cutlassF: no kernel found`, the
  compat-mode warning in Settings should already be on; if not, switch the
  GPU dropdown to "CPU" as a workaround and file an issue.

### App won't start at all

- Look at `backend.log` and `tts_server.log` in your data directory.
- Make sure ports 3001 and 8100 aren't already in use.
- On Windows, antivirus software occasionally quarantines the bundled
  PyInstaller binary on first launch — whitelist the install directory.

---

## Uninstalling

| OS | How |
|---|---|
| Windows | Settings → Apps → Liminal → Uninstall (or use the Start Menu shortcut's "Uninstall") |
| macOS | Drag **Liminal** from Applications to the Trash |
| Linux (AppImage) | Delete the `.AppImage` file |
| Linux (deb) | `sudo apt remove liminal` |

Uninstalling does **not** delete your data. To remove everything, also delete
the data directory listed in the table above.
