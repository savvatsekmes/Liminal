/**
 * Models the built-in engine can download, and the downloader.
 *
 * A short curated list rather than a model browser: each entry is a GGUF
 * file pinned to an exact Hugging Face revision with its published SHA-256,
 * so every user gets exactly the file that was tested. All are Apache-2.0
 * and ungated (no account needed). Files land in DATA_DIR/models, where the
 * built-in engine already looks.
 *
 * Downloads run in the background (the Settings page polls), resume after
 * an interruption from the .part file, check free disk space first, and are
 * verified against the checksum before being put in place.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const fetch = require('node-fetch');
const { MODELS_DIR } = require('./builtinLlm');

// minVramGB: the smallest graphics card it runs comfortably on (model +
// 16K context). `pick` drives the "Recommended for your computer" choice.
const CATALOG = [
  {
    id: 'qwen3.5-4b',
    name: 'Qwen 3.5 4B',
    note: 'Small and quick — runs on any computer, even without a graphics card (slower there).',
    repo: 'unsloth/Qwen3.5-4B-GGUF', revision: 'e87f176479d0855a907a41277aca2f8ee7a09523',
    file: 'Qwen3.5-4B-Q4_K_M.gguf', size: 2740937888,
    sha256: '00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4',
    vision: { file: 'mmproj-F16.gguf', size: 672423616, sha256: 'cd88edcf8d031894960bb0c9c5b9b7e1fea6ebee02b9f7ce925a00d12891f864' },
    minVramGB: 0,
  },
  {
    id: 'gemma-4-e4b',
    name: 'Gemma 4 E4B',
    note: 'Light Gemma — good reflections on 6 GB graphics cards.',
    repo: 'google/gemma-4-E4B-it-qat-q4_0-gguf', revision: '4b4a2c1d584be7264f87aac328a1bc739ce81b6c',
    file: 'gemma-4-E4B_q4_0-it.gguf', size: 5154941280,
    sha256: '676c35070db6dbe52f93e9c864ee0fba4eddea94b9c875d9cb10daff453fbaee',
    vision: { file: 'gemma-4-E4B-it-mmproj.gguf', size: 991552256, sha256: '7498a37cb619e55f2fcf87eb931f56e99389ed6d432e4c5c66110694c0d65578' },
    minVramGB: 6,
  },
  {
    id: 'gemma-4-12b',
    name: 'Gemma 4 12B',
    note: 'The best balance for Liminal — warm, accurate reflections. Needs an 8 GB graphics card.',
    repo: 'google/gemma-4-12B-it-qat-q4_0-gguf', revision: '29d097773436b69ff9feafd636ab4cf873786537',
    file: 'gemma-4-12b-it-qat-q4_0.gguf', size: 6975879296,
    sha256: '93567e57a8fe10b23569b9d9ec38cd005deedf71e29477c421a4b83f418a538b',
    vision: { file: 'mmproj-gemma-4-12b-it-qat-q4_0.gguf', size: 175115616, sha256: 'cb018338a7538a9814d994bfe54644c71eb7ed54e31eae2f721e45fd3c260da7' },
    minVramGB: 8,
  },
  {
    id: 'qwen3.5-9b',
    name: 'Qwen 3.5 9B',
    note: 'Strongest if you write in a language other than English. Needs an 8 GB graphics card.',
    repo: 'unsloth/Qwen3.5-9B-GGUF', revision: '3885219b6810b007914f3a7950a8d1b469d598a5',
    file: 'Qwen3.5-9B-Q4_K_M.gguf', size: 5680522464,
    sha256: '03b74727a860a56338e042c4420bb3f04b2fec5734175f4cb9fa853daf52b7e8',
    vision: { file: 'mmproj-F16.gguf', size: 918166080, sha256: 'f70dc3509053962b0d0d3ee8a7eacebf5d60aa560cad78254ae8698516ae029f' },
    minVramGB: 8,
  },
  {
    id: 'qwen3.8-27b',
    name: 'Qwen 3.8 27B',
    note: 'The most capable — for big graphics cards (20 GB or more).',
    repo: 'ggml-org/Qwen3.8-27B-GGUF', revision: 'a316ea527fde32c12487be7574e2db5ac2ad2a7e',
    file: 'Qwen3.8-27B-Q4_K_M.gguf', size: 18973870528,
    sha256: 'c600de0300ae8a0eb3a6c0b8b5561b8b96f16bd2c863c2a66c42de29d391a747',
    vision: { file: 'mmproj-Qwen3.8-27B-Q8_0.gguf', size: 629247008, sha256: '2e968a6af97ce35d8971890b257b9b7edabf20ad91450501fa53162a19ee33eb' },
    minVramGB: 20,
  },
];

// Recommended for this computer, from the biggest graphics card's memory.
// The 27B is offered to big cards but not pushed: the 12B is the tested
// sweet spot for reflections and loads much faster.
function recommendedId(devices) {
  const vramGB = Math.max(0, ...(devices || []).map((d) => d.totalMiB / 1024));
  if (vramGB >= 8) return 'gemma-4-12b';
  if (vramGB >= 6) return 'gemma-4-e4b';
  return 'qwen3.5-4b';
}

const byId = (id) => CATALOG.find((m) => m.id === id);

// Each model is two files: the model itself and its vision add-on ("mmproj"),
// which lets it describe photos. The add-on is saved next to the model as
// <model>.mmproj.gguf — several repos name theirs just "mmproj-F16.gguf", so
// the original names would collide — and the engine looks for it there.
const visionFileFor = (modelFile) => modelFile.replace(/\.gguf$/i, '.mmproj.gguf');
function filesOf(m) {
  return [
    { label: 'model', remote: m.file, local: m.file, size: m.size, sha256: m.sha256 },
    { label: 'vision', remote: m.vision.file, local: visionFileFor(m.file), size: m.vision.size, sha256: m.vision.sha256 },
  ];
}
const localPath = (f) => path.join(MODELS_DIR, f.local);
const partOf = (f) => `${localPath(f)}.part`;
const partBytes = (f) => (fs.existsSync(partOf(f)) ? fs.statSync(partOf(f)).size : 0);
const totalSize = (m) => m.size + m.vision.size;

// id → { status: 'downloading'|'verifying'|'error', received, total, error, abort }
const jobs = new Map();

function state(m) {
  const job = jobs.get(m.id);
  if (job) return { status: job.status, received: job.received, total: job.total, error: job.error || null };
  const [model, vision] = filesOf(m);
  const visionThere = fs.existsSync(localPath(vision));
  // A model that works but has no vision add-on yet (downloaded before photo
  // descriptions came to the built-in engine) is installed; the row offers
  // to add the add-on.
  if (fs.existsSync(localPath(model))) return { status: 'installed', vision: visionThere, visionSize: vision.size };
  if (fs.existsSync(partOf(model))) {
    return { status: 'paused', received: partBytes(model) + (visionThere ? vision.size : partBytes(vision)), total: totalSize(m) };
  }
  return { status: 'none' };
}

function catalog(devices) {
  const rec = recommendedId(devices);
  const vramGB = Math.max(0, ...(devices || []).map((d) => d.totalMiB / 1024));
  return CATALOG.map((m) => ({
    id: m.id, name: m.name, note: m.note, size: totalSize(m),
    modelId: `file:${m.file}`,            // how the engine lists it once downloaded
    recommended: m.id === rec,
    fits: vramGB >= m.minVramGB || m.minVramGB === 0,
    ...state(m),
  }));
}

function hashFile(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(file).on('data', (c) => h.update(c)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });
}

// Download one file (resuming its .part), verify it, put it in place.
// `job.received` counts across all of the model's files, from `base`.
async function fetchFile(m, f, job, base) {
  const part = partOf(f);
  const have = partBytes(f);

  // One signal for both "the user cancelled" and "the connection went
  // quiet" — a stall is an error (the .part stays for resuming), a cancel isn't.
  const ctl = new AbortController();
  const onCancel = () => ctl.abort();
  job.abort.signal.addEventListener('abort', onCancel);
  let stalled = false;
  let stallTimer;
  const armStall = () => {
    clearTimeout(stallTimer);
    stallTimer = setTimeout(() => { stalled = true; ctl.abort(); }, 60000);
  };

  const url = `https://huggingface.co/${m.repo}/resolve/${m.revision}/${f.remote}`;
  try {
    armStall();
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Liminal', ...(have ? { Range: `bytes=${have}-` } : {}) },
      signal: ctl.signal,
    });
    if (!(res.status === 200 || res.status === 206)) throw new Error(`Download failed (HTTP ${res.status}).`);
    const resuming = res.status === 206;
    job.received = base + (resuming ? have : 0);

    await new Promise((resolve, reject) => {
      const out = fs.createWriteStream(part, { flags: resuming ? 'a' : 'w' });
      // On a cancel, stall or network error the file must be closed before
      // we settle — an open handle keeps the .part from being deleted.
      let failed = null;
      const fail = (err) => {
        if (failed) return;
        failed = err;
        res.body.unpipe(out);
        out.destroy();
      };
      res.body.on('data', (chunk) => { job.received += chunk.length; armStall(); });
      res.body.on('error', fail);
      out.on('error', fail);
      out.on('close', () => (failed ? reject(failed) : resolve()));
      res.body.pipe(out);
    });
  } catch (err) {
    if (stalled) throw new Error('The download stopped (no data for a minute). Try again to resume.');
    throw err;
  } finally {
    clearTimeout(stallTimer);
    job.abort.signal.removeEventListener('abort', onCancel);
  }

  job.status = 'verifying';
  const sha = await hashFile(part);
  if (sha !== f.sha256) {
    fs.rmSync(part, { force: true });
    throw new Error('The download was corrupted (checksum mismatch). Please try again.');
  }
  fs.renameSync(part, localPath(f));
  job.status = 'downloading';
}

async function run(m, job) {
  fs.mkdirSync(MODELS_DIR, { recursive: true });
  const missing = filesOf(m).filter((f) => !fs.existsSync(localPath(f)));
  job.total = missing.reduce((n, f) => n + f.size, 0);

  // Room for what's left, plus a little headroom.
  const { bavail, bsize } = fs.statfsSync(MODELS_DIR);
  const need = missing.reduce((n, f) => n + f.size - partBytes(f), 0) + 200 * 1024 * 1024;
  if (bavail * bsize < need) {
    throw new Error(`Not enough disk space: ${(need / 1073741824).toFixed(1)} GB needed in ${MODELS_DIR}.`);
  }

  let base = 0;
  for (const f of missing) {
    await fetchFile(m, f, job, base);
    base += f.size;
    job.received = base;
  }
}

function startDownload(id) {
  const m = byId(id);
  if (!m) throw new Error('Unknown model.');
  if (jobs.get(id)?.status === 'error') jobs.delete(id); // retry → resumes from .part
  if (jobs.has(id)) return;                       // already running
  if (filesOf(m).every((f) => fs.existsSync(localPath(f)))) return; // already complete
  const job = { status: 'downloading', received: 0, total: totalSize(m), error: null, abort: new AbortController() };
  jobs.set(id, job);
  console.log(`[models] downloading ${m.name}`);
  run(m, job)
    .then(() => { jobs.delete(id); console.log(`[models] ${m.name} ready`); })
    .catch((err) => {
      if (job.abort.signal.aborted) {
        // Cancelled: the download has fully stopped and closed the file, so
        // the partials can go now (deleting sooner fails on Windows).
        if (jobs.get(id) === job) jobs.delete(id);
        for (const f of filesOf(m)) fs.rmSync(partOf(f), { force: true, maxRetries: 10, retryDelay: 200 });
        return;
      }
      // Keep the .part so the next attempt resumes; show the error until then.
      job.status = 'error';
      job.error = err.message;
      console.warn(`[models] ${m.name} failed: ${err.message}`);
    });
}

// Cancel discards what was downloaded (the user chose to stop). A running
// download removes its partial files once it has stopped (see startDownload);
// a paused or failed one is removed straight away.
function cancelDownload(id) {
  const m = byId(id);
  const job = jobs.get(id);
  jobs.delete(id);
  if (job && job.status === 'downloading') { job.abort.abort(); return; }
  if (m) for (const f of filesOf(m)) fs.rmSync(partOf(f), { force: true, maxRetries: 10, retryDelay: 200 });
}

// Only files in Liminal's own models folder — never Ollama's.
function deleteModel(id) {
  const m = byId(id);
  if (!m) throw new Error('Unknown model.');
  cancelDownload(id);
  // The engine may take a moment to let go of the files after being stopped.
  for (const f of filesOf(m)) fs.rmSync(localPath(f), { force: true, maxRetries: 10, retryDelay: 300 });
  return `file:${m.file}`;
}

// Friendly names for downloaded files in the engine's model list.
function nameForFile(file) {
  return CATALOG.find((m) => m.file === file)?.name || null;
}

module.exports = { CATALOG, catalog, recommendedId, startDownload, cancelDownload, deleteModel, nameForFile, visionFileFor };
