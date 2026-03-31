# Liminal

A journal for the in-between.

---

## Prerequisites

1. **Node.js** — Install from https://nodejs.org (LTS version, 20.x or higher)
   - During install, check "Add to PATH"
   - Restart any open terminals after installing

2. **An LLM provider** — pick one:
   - **Ollama** (free, local) — Install from https://ollama.com, then `ollama pull llama3.1`
   - **Anthropic** — Get an API key at https://console.anthropic.com
   - **OpenAI** — Get an API key at https://platform.openai.com

---

## First-time setup

Open two terminals in this folder.

**Terminal 1 — Backend:**
```
cd backend
npm install
npm run dev
```
Backend runs on http://localhost:3001

**Terminal 2 — Frontend:**
```
cd frontend
npm install
npm run dev
```
Frontend runs on http://localhost:5173

Then open http://localhost:5173 in your browser.

---

## Configuration

Edit `backend/.env`:

```env
LLM_PROVIDER=ollama          # ollama | claude | openai
OLLAMA_MODEL=llama3.1        # if using Ollama (default)
ANTHROPIC_API_KEY=sk-...     # if using Claude
OPENAI_API_KEY=              # if using OpenAI
```

Ollama is the default provider — free, local, no API key required.
For cloud providers, add your API key and set `LLM_PROVIDER` accordingly.

---

## First launch

1. You'll be prompted to set a password — this protects the app locally
2. Start writing, or go to ⊕ Import to bring in your Notion journal
3. Hit **Reflect** to get your first Mirror response

---

## Chatterbox TTS (voice readback)

Liminal uses Chatterbox TTS for voice readback of Mirror reflections.
- Download and run: https://github.com/devnen/Chatterbox-TTS-Server
- It runs on http://localhost:8004 — no API key needed
- If it's not running, Liminal falls back to the browser's built-in Web Speech API

---

## Memory system

After each Reflect:
1. Your entry is embedded into a local vector index (Vectra, in `backend/data/vectra/`)
2. A rolling summary of your full journal history is updated
3. Future reflections are informed by your whole story

On first run, the embedding model downloads (~80MB). This happens once and is cached locally.

---

## Notion import

Export your Notion journal: Settings → Export → Markdown & CSV → Download ZIP
Then go to ⊕ Import in Liminal and drop the ZIP.

---

## Project structure

```
backend/
  routes/       API endpoints
  services/     LLM, memory, embedding, Notion import
  data/         SQLite DB + Vectra index (created on first run)
  server.js     Express server
  .env          Your config

frontend/
  src/
    components/ Layout, EntryList, WritingCanvas, MirrorPanel, etc.
    pages/      PortraitPage, ImportPage
    hooks/      useEntries, useReflect
    styles/     global.css
```
