#!/usr/bin/env node
// Generate THIRD_PARTY_LICENSES.txt by walking the production dependency
// tree of backend/ and frontend/ and concatenating each dependency's
// declared license + any bundled LICENSE / NOTICE / COPYING file.
//
// Output is written to frontend/public/THIRD_PARTY_LICENSES.txt so that
// Vite copies it into frontend/dist/, and the packaged Electron build
// ships it inside resources/frontend/dist/. The Terms of Service link to
// it as the canonical attributions document.
//
// LICENSE and NOTICE are scanned and emitted separately. Apache 2.0 §4(d)
// requires the NOTICE file (when present in the source) to be propagated
// in any redistribution; mixing them into a single search list would drop
// NOTICE whenever a LICENSE file was found first.
//
// Nested node_modules (npm dedupe collisions) are walked recursively so
// transitive dependencies hoisted into nested module dirs are still
// recorded.
//
// This is intentionally dependency-free (uses only node:fs / node:path).
// It is not a substitute for license-checker — it doesn't reconcile
// version-pinned duplicates the way that tool does — but it satisfies
// the attribution requirement of the permissive open-source licenses we
// bundle (MIT, BSD, Apache-2.0, ISC, OFL).

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const OUT  = path.join(ROOT, 'frontend', 'public', 'THIRD_PARTY_LICENSES.txt');

const NODE_MODULE_ROOTS = [
  path.join(ROOT, 'frontend', 'node_modules'),
  path.join(ROOT, 'backend',  'node_modules'),
  path.join(ROOT, 'node_modules'),
];

const LICENSE_FILE_NAMES = [
  'LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENCE', 'LICENCE.md', 'LICENCE.txt',
  'COPYING', 'COPYING.md', 'COPYING.txt',
  'license', 'license.md', 'license.txt',
];

const NOTICE_FILE_NAMES = [
  'NOTICE', 'NOTICE.md', 'NOTICE.txt', 'NOTICE.markdown',
  'notice', 'notice.md', 'notice.txt',
];

function findFirstFile(pkgDir, candidates) {
  for (const name of candidates) {
    const candidate = path.join(pkgDir, name);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      try { return fs.readFileSync(candidate, 'utf8'); } catch { /* */ }
    }
  }
  return null;
}

function walkPackages(modulesDir, out) {
  if (!fs.existsSync(modulesDir)) return;
  let entries;
  try { entries = fs.readdirSync(modulesDir); } catch { return; }
  for (const entry of entries) {
    if (entry.startsWith('.')) continue;
    const full = path.join(modulesDir, entry);
    let stat;
    try { stat = fs.statSync(full); } catch { continue; }
    if (!stat.isDirectory()) continue;
    if (entry.startsWith('@')) {
      let subEntries;
      try { subEntries = fs.readdirSync(full); } catch { continue; }
      for (const sub of subEntries) {
        const subDir = path.join(full, sub);
        try {
          if (fs.statSync(subDir).isDirectory()) {
            recordPackage(subDir, out);
            walkPackages(path.join(subDir, 'node_modules'), out);
          }
        } catch { /* */ }
      }
    } else {
      recordPackage(full, out);
      walkPackages(path.join(full, 'node_modules'), out);
    }
  }
}

function recordPackage(pkgDir, out) {
  const pkgJsonPath = path.join(pkgDir, 'package.json');
  if (!fs.existsSync(pkgJsonPath)) return;
  let pkg;
  try { pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8')); } catch { return; }
  if (!pkg.name) return;
  const key = `${pkg.name}@${pkg.version || '0.0.0'}`;
  if (out.seen.has(key)) return;
  out.seen.add(key);

  const license = (typeof pkg.license === 'string')
    ? pkg.license
    : (pkg.license && pkg.license.type) || (Array.isArray(pkg.licenses) ? pkg.licenses.map(l => l.type).join(' OR ') : 'UNKNOWN');

  out.entries.push({
    name: pkg.name,
    version: pkg.version || '',
    license,
    homepage: pkg.homepage || (pkg.repository && (pkg.repository.url || pkg.repository)) || '',
    licenseText: findFirstFile(pkgDir, LICENSE_FILE_NAMES),
    noticeText: findFirstFile(pkgDir, NOTICE_FILE_NAMES),
  });
}

const out = { entries: [], seen: new Set() };
for (const root of NODE_MODULE_ROOTS) walkPackages(root, out);
out.entries.sort((a, b) => a.name.localeCompare(b.name));

const lines = [];
lines.push('Liminal — Third-Party Software Notices and Attributions');
lines.push('=========================================================');
lines.push('');
lines.push('Liminal incorporates the following open-source software components.');
lines.push('Each is listed below with its declared license identifier and any');
lines.push('bundled LICENSE / NOTICE text. Where no LICENSE file was present');
lines.push('in the published package, only the SPDX identifier from package.json');
lines.push('is reproduced; the canonical text of common licenses (MIT, ISC,');
lines.push('BSD-2-Clause, BSD-3-Clause, Apache-2.0) is incorporated by reference.');
lines.push('');
lines.push('Apache 2.0 NOTICE files (where present in the upstream source) are');
lines.push('reproduced verbatim under the "NOTICE:" heading for each affected');
lines.push('package, as required by section 4(d) of the Apache License 2.0.');
lines.push('');
lines.push('Electron / Chromium:');
lines.push('  Liminal is built on Electron, which embeds the Chromium open-source');
lines.push('  project (BSD 3-Clause) along with V8 and a large set of additional');
lines.push('  third-party components. The full Chromium credits and license');
lines.push('  inventory are published at chrome://credits inside any Chromium-');
lines.push('  based browser, and at https://chromium.googlesource.com/chromium/src/+/refs/heads/main/components/about_ui/resources/about_credits.html');
lines.push('  Electron itself is MIT-licensed; the Electron NOTICE is reproduced');
lines.push('  in the entries below.');
lines.push('');
lines.push('Fonts:');
lines.push('  Cormorant Garamond — SIL Open Font License 1.1.');
lines.push('    See frontend/public/fonts/OFL.txt (also packaged at /fonts/OFL.txt).');
lines.push('');
lines.push('Voices:');
lines.push('  Default voice references are derived from the CSTR VCTK Corpus.');
lines.push('  Contains information from CSTR VCTK Corpus, which is made');
lines.push('  available under the ODC Attribution License (ODC-BY 1.0).');
lines.push('  Original recordings (c) 2019 The Centre for Speech Technology');
lines.push('  Research (CSTR), University of Edinburgh.');
lines.push('  ODC-BY 1.0: https://opendatacommons.org/licenses/by/1-0/');
lines.push('');
lines.push(`Generated ${new Date().toISOString()} from ${out.entries.length} npm packages.`);
lines.push('');
lines.push('=========================================================');
lines.push('');

for (const e of out.entries) {
  lines.push(`---`);
  lines.push(`${e.name}@${e.version}`);
  lines.push(`License: ${e.license}`);
  if (e.homepage) lines.push(`Homepage: ${e.homepage}`);
  lines.push('');
  if (e.licenseText) {
    lines.push(e.licenseText.trim());
    lines.push('');
  }
  if (e.noticeText) {
    lines.push('NOTICE:');
    lines.push(e.noticeText.trim());
    lines.push('');
  }
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, lines.join('\n'), 'utf8');
console.log(`[generate-licenses] Wrote ${out.entries.length} entries to ${OUT}`);
