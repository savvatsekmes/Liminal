#!/usr/bin/env node
// Fetch the built-in AI engine (llama.cpp's llama-server) into
// dist/llama_server — `node scripts/fetch-llama-server.js`.
//
// The build is pinned and checked against the SHA-256 GitHub publishes for
// it, so every release ships the same engine. To update: change BUILD and
// SHA256 (gh api repos/ggml-org/llama.cpp/releases/tags/<build> shows the
// asset's digest), re-run, and test the built-in provider before releasing.
//
// Windows: the Vulkan build — one binary for NVIDIA, AMD and Intel GPUs, no
// CUDA version to match. Only llama-server and its libraries are kept.
// macOS (Metal) isn't wired up yet.

const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const BUILD = 'b11750';
const ASSETS = {
  win32: {
    file: `llama-${BUILD}-bin-win-vulkan-x64.zip`,
    sha256: 'e59d478097631474361df58c5b5b81a31c5d91d81401ee20a4cbda0a0c4faaf0',
    keep: (f) => f === 'llama-server.exe' || f === 'llama-server-impl.dll' || (f.endsWith('.dll') && !f.endsWith('-impl.dll')) || f.startsWith('LICENSE'),
  },
};
const LICENSE_URL = `https://raw.githubusercontent.com/ggml-org/llama.cpp/${BUILD}/LICENSE`;

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'dist', 'llama_server');

function download(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'liminal-build' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(download(res.headers.location, dest));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`${url} → HTTP ${res.statusCode}`)); }
      const out = fs.createWriteStream(dest);
      res.pipe(out);
      out.on('finish', () => out.close(resolve));
      out.on('error', reject);
    }).on('error', reject);
  });
}

async function main() {
  const asset = ASSETS[process.platform];
  if (!asset) throw new Error(`No pinned llama-server build for ${process.platform} yet.`);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'llama-server-'));
  const zip = path.join(tmp, asset.file);
  console.log(`[llama] downloading ${asset.file}`);
  await download(`https://github.com/ggml-org/llama.cpp/releases/download/${BUILD}/${asset.file}`, zip);

  const sha = crypto.createHash('sha256').update(fs.readFileSync(zip)).digest('hex');
  if (sha !== asset.sha256) throw new Error(`checksum mismatch for ${asset.file}: got ${sha}`);
  console.log('[llama] checksum OK');

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  // Windows' own bsdtar (System32) reads zips and drive-letter paths; a GNU tar
  // earlier on PATH (Git Bash) takes "C:" for a remote host.
  const winTar = process.env.SystemRoot && path.join(process.env.SystemRoot, 'System32', 'tar.exe');
  const tar = winTar && fs.existsSync(winTar) ? winTar : 'tar';
  execFileSync(tar, ['-xf', zip, '-C', outDir], { stdio: 'inherit' });
  for (const f of fs.readdirSync(outDir)) {
    if (!asset.keep(f)) fs.rmSync(path.join(outDir, f), { recursive: true, force: true });
  }
  // llama.cpp is MIT-licensed; its licence travels with the binaries.
  await download(LICENSE_URL, path.join(outDir, 'LICENSE-llama.cpp'));
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`[llama] ready in ${path.relative(root, outDir)} (${fs.readdirSync(outDir).length} files, build ${BUILD})`);
}

main().catch((err) => { console.error(`[llama] ${err.message}`); process.exit(1); });
