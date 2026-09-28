// Guarantees personal-only code never ships in a distributed build.
//
// backend/personal/ holds the "Claude / ChatGPT (my subscription)" providers.
// Using your own subscription is fine for yourself, but vendors don't allow an
// app to offer their consumer login to its users — so that folder, and the
// SDKs/CLIs it depends on, must never be inside anything we distribute.
//
// Used two ways:
//   - electron-builder `afterPack` hook (full builds, e.g. Mac): fails the
//     build if the packed app contains any of it. The extraResources filter
//     ("!personal/**") should already have kept it out; this is the check.
//   - scripts/dist-win.js, on the finished Windows archive (Windows releases
//     use --prepackaged, which skips extraResources filters entirely).

const fs = require('fs');
const path = require('path');

// Path fragments that must never appear in a shipped build. Normalised to
// forward slashes and lower case before matching.
const FORBIDDEN = [
  'resources/backend/personal/',
  'resources/backend/personal',
  '/@anthropic-ai/claude-agent-sdk',
  '/@openai/codex',
  'codex-code-mode-host',
];

function forbiddenIn(relPath) {
  const p = `/${relPath.replace(/\\/g, '/').toLowerCase()}`;
  return FORBIDDEN.find((f) => p.includes(f) || p.endsWith(f.replace(/\/$/, '')));
}

// Walk a directory tree, returning offending paths (relative to root).
function scanDir(root) {
  const hits = [];
  const walk = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      const rel = path.relative(root, full);
      if (forbiddenIn(rel)) { hits.push(rel); continue; } // don't descend into it
      if (e.isDirectory() && !e.isSymbolicLink()) walk(full);
    }
  };
  walk(root);
  return hits;
}

// Offending entries in a list of archive paths.
function scanPaths(paths) {
  return paths.filter((p) => forbiddenIn(p));
}

// electron-builder afterPack hook.
async function afterPack(context) {
  const hits = scanDir(context.appOutDir);
  if (hits.length) {
    throw new Error(
      `Personal-only files found in the packed app — refusing to build a distributable.\n  ${hits.slice(0, 10).join('\n  ')}`,
    );
  }
}

module.exports = afterPack;
module.exports.default = afterPack;
module.exports.scanDir = scanDir;
module.exports.scanPaths = scanPaths;
