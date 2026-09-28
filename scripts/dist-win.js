#!/usr/bin/env node
// Windows release build — `npm run dist`.
//
// Windows releases are built with `--prepackaged dist-installers/win-unpacked`,
// which wraps that folder as-is: electron-builder's extraResources filters
// (including "!personal/**") do NOT apply. And win-unpacked is also the app
// used day to day, so it may contain backend/personal/ — the personal-only
// "my subscription" providers that must never be distributed.
//
// So this wrapper:
//   1. moves resources/backend/personal out of win-unpacked,
//   2. runs the normal electron-builder command,
//   3. lists the finished .7z and FAILS (deleting the artifacts) if anything
//      personal made it in anyway,
//   4. always moves the folder back, so the personal app keeps working.
// If a previous run was interrupted, the held folder is restored first.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { createRequire } = require('module');
const { scanPaths, scanDir } = require('./assert-no-personal');

function log(msg) { console.log(`[dist-win] ${msg}`); }

function layout(root) {
  const dist = path.join(root, 'dist-installers');
  return {
    unpacked: path.join(dist, 'win-unpacked'),
    personal: path.join(dist, 'win-unpacked', 'resources', 'backend', 'personal'),
    hold: path.join(dist, '.personal-hold'),
    out: path.join(dist, 'nsis-web'),
  };
}

function restore(L) {
  if (fs.existsSync(L.hold) && !fs.existsSync(L.personal)) {
    fs.renameSync(L.hold, L.personal);
    log('restored backend/personal into win-unpacked');
  }
}

function listArchive(archive, sevenZip) {
  const r = spawnSync(sevenZip, ['l', '-slt', '-ba', archive], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`7za failed listing ${archive}: ${r.stderr || r.stdout}`);
  return r.stdout.split(/\r?\n/).filter((l) => l.startsWith('Path = ')).map((l) => l.slice(7));
}

function runElectronBuilder(root) {
  const cli = createRequire(path.join(root, 'package.json')).resolve('electron-builder/cli.js');
  const r = spawnSync(process.execPath, [cli, '--prepackaged', 'dist-installers/win-unpacked', '--win', 'nsis-web'],
    { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`electron-builder exited with code ${r.status}`);
}

// `runBuilder` / `sevenZip` are injectable so the guard logic can be tested
// without a real 20-minute build.
function build({ root = path.resolve(__dirname, '..'), runBuilder = runElectronBuilder, sevenZip } = {}) {
  const L = layout(root);
  if (!fs.existsSync(L.unpacked)) throw new Error(`No prepackaged app at ${L.unpacked}`);
  sevenZip ||= createRequire(path.join(root, 'package.json'))('7zip-bin').path7za;
  restore(L); // recover from an interrupted earlier run before touching anything

  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  let moved = false;
  try {
    if (fs.existsSync(L.personal)) {
      fs.renameSync(L.personal, L.hold);
      moved = true;
      log('moved backend/personal out of win-unpacked for the build');
    }

    // Nothing personal may remain anywhere in the tree we're about to wrap.
    const leftovers = scanDir(L.unpacked);
    if (leftovers.length) throw new Error(`Personal-only files still in win-unpacked:\n  ${leftovers.slice(0, 10).join('\n  ')}`);

    runBuilder(root);

    // Verify what will actually be uploaded.
    const archive = path.join(L.out, `liminal-${version}-x64.nsis.7z`);
    if (!fs.existsSync(archive)) throw new Error(`Expected archive not found: ${archive}`);
    const entries = listArchive(archive, sevenZip);
    if (!entries.length) throw new Error(`Couldn't read any entries from ${archive}`);
    const hits = scanPaths(entries);
    if (hits.length) {
      for (const f of fs.readdirSync(L.out)) {
        if (f.includes(version) || f === 'latest.yml') fs.rmSync(path.join(L.out, f), { force: true });
      }
      throw new Error(`Personal-only files found INSIDE the release archive — artifacts deleted:\n  ${hits.slice(0, 10).join('\n  ')}`);
    }
    log(`verified ${entries.length} archive entries — no personal-only files`);
    return { entries: entries.length };
  } finally {
    if (moved) restore(L);
  }
}

module.exports = { build, listArchive };

if (require.main === module) {
  try {
    build();
  } catch (err) {
    console.error(`\n[dist-win] BUILD FAILED: ${err.message}\n`);
    process.exit(1);
  }
}
