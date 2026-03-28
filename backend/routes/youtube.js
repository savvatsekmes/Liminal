const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const { requireAuth } = require('../middleware/auth');
const db = require('../database');

router.use(requireAuth);

// ── Transcript fetcher ─────────────────────────────────────────────────────
// Uses the youtube-transcript package (InnerTube API) — much more reliable
// than HTML scraping. Falls back to direct XML approach if unavailable.
async function fetchYoutubeTranscript(videoId) {
  // ── Title (always try to get this) ──────────────────────────────────────
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

  // ── Transcript via youtube-transcript package ────────────────────────────
  try {
    const { YoutubeTranscript } = require('youtube-transcript');
    const items = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'en' });
    const transcript = items.map((i) => i.text).join(' ').replace(/\s+/g, ' ').trim();
    return { title, transcript, hadCaptions: !!transcript };
  } catch (pkgErr) {
    // Package not installed or video has no captions in English —
    // try any available language before giving up
    try {
      const { YoutubeTranscript } = require('youtube-transcript');
      const items = await YoutubeTranscript.fetchTranscript(videoId);
      const transcript = items.map((i) => i.text).join(' ').replace(/\s+/g, ' ').trim();
      return { title, transcript, hadCaptions: !!transcript };
    } catch {}

    // ── Fallback: scrape captionTracks from the page HTML ─────────────────
    try {
      const html = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cookie': 'CONSENT=YES+cb; YSC=dummy; VISITOR_INFO1_LIVE=dummy',
        },
      }).then((r) => r.text());

      if (!title) {
        const tm = html.match(/<title>([^<]+)<\/title>/);
        if (tm) title = tm[1].replace(' - YouTube', '').trim();
      }

      const markerIdx = html.indexOf('"captionTracks":');
      if (markerIdx === -1) return { title, transcript: '', hadCaptions: false };

      const start = markerIdx + '"captionTracks":'.length;
      let depth = 0, end = start;
      while (end < html.length) {
        if (html[end] === '[') depth++;
        if (html[end] === ']') { depth--; if (depth === 0) { end++; break; } }
        end++;
      }

      const tracks = JSON.parse(html.slice(start, end));
      const track =
        tracks.find((t) => t.languageCode === 'en' && !t.kind) ||
        tracks.find((t) => t.languageCode === 'en') ||
        tracks[0];

      if (!track?.baseUrl) return { title, transcript: '', hadCaptions: false };

      const xml = await fetch(track.baseUrl.replace(/&amp;/g, '&')).then((r) => r.text());
      const transcript = xml
        .replace(/<text[^>]*>/g, '').replace(/<\/text>/g, ' ').replace(/<[^>]+>/g, '')
        .replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();

      return { title, transcript, hadCaptions: !!transcript };
    } catch {}

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
