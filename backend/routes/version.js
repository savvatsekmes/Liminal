const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const db = require('../database');

// Version source of truth:
//  - In production: Electron passes app.getVersion() via LIMINAL_APP_VERSION env var (root package.json)
//  - In dev: fall back to the backend's own package.json (kept in sync manually)
let pkgVersion = process.env.LIMINAL_APP_VERSION;
if (!pkgVersion) {
  try { pkgVersion = require('../package.json').version; } catch { pkgVersion = '0.0.0'; }
}
const pkg = { version: pkgVersion };

router.use(requireAuth);

// Change this when the GitHub repo name is finalised.
const REPO = 'savvatsekmes/Liminal';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

// Tiny semver compare — returns 1 if a > b, -1 if a < b, 0 if equal.
// Strips leading 'v' and any pre-release suffix.
function compareSemver(a, b) {
  const norm = v => String(v || '').replace(/^v/, '').split('-')[0].split('.').map(n => parseInt(n, 10) || 0);
  const pa = norm(a);
  const pb = norm(b);
  for (let i = 0; i < 3; i++) {
    const ai = pa[i] || 0;
    const bi = pb[i] || 0;
    if (ai > bi) return 1;
    if (ai < bi) return -1;
  }
  return 0;
}

// ── GET /api/version — current bundled version, no network ──────────────────
router.get('/', (req, res) => {
  res.json({ current: pkg.version });
});

// ── GET /api/version/check — compare against latest GitHub release ──────────
router.get('/check', async (req, res) => {
  const current = pkg.version;

  // Cached?
  if (!req.query.refresh) {
    const cached = db.prepare(
      "SELECT data FROM home_cache WHERE user_id = ? AND cache_key = 'version_check'"
    ).get(req.userId);
    if (cached) {
      try {
        const parsed = JSON.parse(cached.data);
        if (parsed.checkedAt && Date.now() - new Date(parsed.checkedAt).getTime() < CACHE_TTL_MS) {
          return res.json(parsed);
        }
      } catch {}
    }
  }

  try {
    // Liminal's repo is public — anonymous calls work and stay well under
    // GitHub's 60 req/hr per-IP rate limit (this endpoint caches for 6h).
    const ghHeaders = { 'Accept': 'application/vnd.github+json', 'User-Agent': 'Liminal-App' };
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: ghHeaders,
    });
    if (!r.ok) throw new Error(`GitHub API ${r.status}`);
    const data = await r.json();

    const latest = (data.tag_name || '').replace(/^v/, '');
    // Direct download URL for the Windows stub installer, so the in-app
    // banner can hand the user a single-click download instead of bouncing
    // them through the GitHub release page. Looked up by extension so the
    // version-bearing filename (Liminal.Web.Setup.<v>.exe) doesn't matter.
    const installerAsset = (data.assets || []).find(a => a.name?.endsWith('.exe'));
    const result = {
      current,
      latest: latest || null,
      hasUpdate: latest ? compareSemver(latest, current) > 0 : false,
      releaseUrl: data.html_url || null,
      installerUrl: installerAsset?.browser_download_url || null,
      releaseName: data.name || data.tag_name || null,
      publishedAt: data.published_at || null,
      checkedAt: new Date().toISOString(),
    };

    db.prepare(
      "INSERT OR REPLACE INTO home_cache (user_id, cache_key, data, entry_hash) VALUES (?, 'version_check', ?, '')"
    ).run(req.userId, JSON.stringify(result));

    res.json(result);
  } catch (err) {
    console.error('[version/check] failed:', err.message);
    res.json({
      current,
      latest: null,
      hasUpdate: false,
      error: 'offline',
      checkedAt: new Date().toISOString(),
    });
  }
});

module.exports = router;
