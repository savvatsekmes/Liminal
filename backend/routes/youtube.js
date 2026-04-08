const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const { requireAuth } = require('../middleware/auth');
const db = require('../database');

router.use(requireAuth);

// ── Transcript fetcher ─────────────────────────────────────────────────────
// Calls YouTube's InnerTube API directly with the ANDROID client. This is the
// only approach that consistently works in 2025 — the web `timedtext` endpoint
// requires session-bound auth and returns empty bodies otherwise, and the
// `youtube-transcript` npm package is broken (its package.json declares
// "type":"module" but ships CJS, so require() returns an empty object).
const ANDROID_CLIENT = {
  context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38' } },
};
const ANDROID_UA = 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)';

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
}

function parseTimedtextXml(xml) {
  // YouTube serves two XML formats depending on track + client:
  //   1. New: <p t="ms" d="ms">text<s>...</s></p>     (most common today)
  //   2. Old: <text start="s" dur="s">text</text>     (legacy)
  const parts = [];
  const pRegex = /<p\b[^>]*>([\s\S]*?)<\/p>/g;
  let m;
  while ((m = pRegex.exec(xml)) !== null) {
    let inner = m[1];
    // Strip any nested <s> tags but keep their text content
    inner = inner.replace(/<s\b[^>]*>([^<]*)<\/s>/g, '$1').replace(/<[^>]+>/g, '');
    const text = decodeEntities(inner).trim();
    if (text) parts.push(text);
  }
  if (parts.length === 0) {
    const tRegex = /<text\b[^>]*>([\s\S]*?)<\/text>/g;
    while ((m = tRegex.exec(xml)) !== null) {
      const text = decodeEntities(m[1].replace(/<[^>]+>/g, '')).trim();
      if (text) parts.push(text);
    }
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

async function fetchYoutubeTranscript(videoId) {
  // ── Title (always try to get this, even if captions fail) ───────────────
  let title = '';
  try {
    const oembedRes = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
    );
    if (oembedRes.ok) {
      const oembed = await oembedRes.json();
      title = oembed.title || '';
    }
  } catch {}

  // ── InnerTube ANDROID call → captionTracks ──────────────────────────────
  try {
    const playerRes = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': ANDROID_UA },
      body: JSON.stringify({ ...ANDROID_CLIENT, videoId }),
    });
    if (!playerRes.ok) throw new Error(`InnerTube ${playerRes.status}`);
    const player = await playerRes.json();

    if (!title) {
      title = player?.videoDetails?.title || '';
    }

    const tracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!Array.isArray(tracks) || tracks.length === 0) {
      return { title, transcript: '', hadCaptions: false };
    }

    // Prefer manual English → ASR English → first available
    const track =
      tracks.find((t) => t.languageCode === 'en' && t.kind !== 'asr') ||
      tracks.find((t) => t.languageCode === 'en') ||
      tracks[0];

    if (!track?.baseUrl) return { title, transcript: '', hadCaptions: false };

    const xmlRes = await fetch(track.baseUrl, { headers: { 'User-Agent': ANDROID_UA } });
    if (!xmlRes.ok) return { title, transcript: '', hadCaptions: false };
    const xml = await xmlRes.text();
    const transcript = parseTimedtextXml(xml);

    return { title, transcript, hadCaptions: !!transcript };
  } catch (err) {
    console.error('[youtube] InnerTube fetch failed:', err.message);
    return { title, transcript: '', hadCaptions: false };
  }
}

// ── POST /api/youtube/embed ────────────────────────────────────────────────
// Called by the frontend when a YouTube URL is pasted into the editor.
// Fetches + caches the transcript and returns { videoId, title, hadCaptions }.
router.post('/embed', async (req, res) => {
  const { videoId } = req.body;
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return res.status(400).json({ error: 'Invalid videoId' });
  }

  // Return cached transcript only if it actually has content
  // (empty cache = previous failed attempt — retry now that package may be installed)
  const cached = db
    .prepare('SELECT title, transcript FROM youtube_transcripts WHERE video_id = ? AND user_id = ?')
    .get(videoId, req.userId);

  if (cached?.transcript) {
    return res.json({ videoId, title: cached.title, hadCaptions: true });
  }

  try {
    const { title, transcript, hadCaptions } = await fetchYoutubeTranscript(videoId);

    db.prepare(`
      INSERT OR REPLACE INTO youtube_transcripts (user_id, video_id, title, transcript)
      VALUES (?, ?, ?, ?)
    `).run(req.userId, videoId, title, transcript);

    res.json({ videoId, title, hadCaptions });
  } catch (err) {
    console.error('[youtube]', err.message);
    // Store empty entry so we don't retry repeatedly
    try {
      db.prepare(`
        INSERT OR IGNORE INTO youtube_transcripts (user_id, video_id, title, transcript)
        VALUES (?, ?, '', '')
      `).run(req.userId, videoId);
    } catch {}
    res.json({ videoId, title: '', hadCaptions: false });
  }
});

// ── Shared helper ──────────────────────────────────────────────────────────
// Extract transcript context from HTML content containing youtube embeds.
// Used by reflect + notes reflect endpoints.
function buildYoutubeContext(userId, htmlContent) {
  if (!htmlContent) return '';

  const matches = [...htmlContent.matchAll(/data-video-id="([a-zA-Z0-9_-]{11})"/g)];
  const videoIds = [...new Set(matches.map((m) => m[1]))];
  if (!videoIds.length) return '';

  const rows = videoIds
    .map((id) => db.prepare('SELECT title, transcript FROM youtube_transcripts WHERE video_id = ? AND user_id = ?').get(id, userId))
    .filter((r) => r?.transcript);

  if (!rows.length) return '';

  return rows
    .map((r) => `VIDEO: "${r.title}"\nTRANSCRIPT (excerpt):\n${r.transcript.slice(0, 4000)}`)
    .join('\n\n---\n\n');
}

module.exports = router;
module.exports.buildYoutubeContext = buildYoutubeContext;
