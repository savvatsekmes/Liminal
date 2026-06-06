// Per-user emoji assignments for tags.
//
// Three layers, resolution priority high → low at the frontend:
//   1. user overrides   — explicit right-click choices (persisted)
//   2. hardcoded map    — TAG_EMOJI in frontend/src/utils/tagEmoji.js (instant)
//   3. LLM cache        — emojis we asked an LLM for once and remembered
//
// Layers 1 and 3 live here, in the existing per-user `settings` table under
// two namespaced keys:
//   tag_emoji_overrides::<userId>  → { "<tag>": "<emoji>" }
//   tag_emoji_cache::<userId>      → { "<tag>": "<emoji>" }
//
// Both are plain JSON blobs. Tag keys are lowercased. Emoji values are the
// raw glyph string (may include variation selectors).
//
// The LLM lookup uses the same llmService as tag suggestion — small one-shot
// call with a tight prompt that asks for a single emoji glyph. Output is
// validated; junk responses are stored as empty string so we don't re-call
// for the same tag.

const settingsService = require('./settingsService');
const llm = require('./llmService');

const KEY_OVERRIDES = 'tag_emoji_overrides';
const KEY_CACHE = 'tag_emoji_cache';

function readMap(key) {
  try {
    const raw = settingsService.get(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(key, map) {
  settingsService.set(key, JSON.stringify(map || {}));
}

function getOverrides() { return readMap(KEY_OVERRIDES); }
function getCache()     { return readMap(KEY_CACHE); }

function setOverride(tag, emoji) {
  const t = String(tag || '').trim().toLowerCase();
  const e = String(emoji || '').trim();
  if (!t) throw new Error('tag required');
  const map = getOverrides();
  if (!e) {
    delete map[t];
  } else {
    map[t] = e;
  }
  writeMap(KEY_OVERRIDES, map);
  return { tag: t, emoji: e || null };
}

function clearOverride(tag) {
  const t = String(tag || '').trim().toLowerCase();
  const map = getOverrides();
  delete map[t];
  writeMap(KEY_OVERRIDES, map);
  return { tag: t };
}

function setCache(tag, emoji) {
  const t = String(tag || '').trim().toLowerCase();
  if (!t) return;
  const map = getCache();
  map[t] = String(emoji || '');
  writeMap(KEY_CACHE, map);
}

function getMergedMap() {
  // Frontend resolves with priority: override > hardcoded > cache.
  // We return both layers separately so the renderer can decide.
  return { overrides: getOverrides(), cache: getCache() };
}

// ── LLM emoji lookup ────────────────────────────────────────────────────────
//
// Single grapheme cluster — typically one codepoint, optionally followed by
// a variation selector (️) or ZWJ-joined modifier. We accept up to ~16
// chars of UTF-16 to cover compound emojis (family, flags) but reject any
// response that contains ASCII letters / punctuation — LLMs sometimes wrap
// the glyph in quotes or text and we don't want to store "💡 idea" as the
// cached emoji.

const EMOJI_RANGE_RE = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}]/u;
const ASCII_LETTER_RE = /[a-zA-Z0-9]/;

function validateEmoji(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Common LLM mistakes: wraps in quotes, prefixes with explanation,
  // appends the tag name. Pull the first emoji-range codepoint we see and
  // keep up to a few code points after it (for variation selectors / ZWJ).
  if (ASCII_LETTER_RE.test(trimmed)) {
    // Try to salvage: find the first non-ASCII emoji-range char and slice
    // forward to capture variation selectors but stop at the next ASCII.
    const match = trimmed.match(/[\p{Extended_Pictographic}][‍️\p{Extended_Pictographic}]{0,4}/u);
    if (match) return match[0];
    return null;
  }
  if (!EMOJI_RANGE_RE.test(trimmed)) {
    // Fallback for emojis in the BMP that fall outside the explicit range
    // (heart, etc.). Allow any single non-ASCII grapheme.
    const m = trimmed.match(/^[\p{Extended_Pictographic}][‍️\p{Extended_Pictographic}]{0,4}/u);
    return m ? m[0] : null;
  }
  // Grab the first emoji grapheme cluster.
  const m = trimmed.match(/^[\p{Extended_Pictographic}][‍️\p{Extended_Pictographic}]{0,4}/u);
  return m ? m[0] : null;
}

async function suggestEmojiForTag(tag) {
  const t = String(tag || '').trim().toLowerCase();
  if (!t) return null;

  // Cache hit short-circuit — caller can also check the cache first to
  // avoid even invoking this function, but be defensive here.
  const cached = getCache()[t];
  if (cached !== undefined) {
    return cached || null;
  }

  const systemPrompt = `You are an emoji selector for a personal journaling app. Given a single tag word, reply with EXACTLY ONE Unicode emoji glyph that best represents the tag's meaning.

Strict rules:
- Output ONLY the emoji glyph, nothing else.
- No text, no quotes, no markdown, no explanation, no period.
- A single emoji character. Use variation selectors if they belong (e.g. ❤️ not ❤).
- If the tag is profane, dark, or unrenderable, pick the closest neutral metaphor (no skulls, no weapons).`;

  try {
    const raw = await llm.call(systemPrompt, t, { maxTokens: 16, language: false });
    const validated = validateEmoji(raw);
    // Cache result (including empty string when the LLM produced junk) so
    // we don't retry on every render.
    setCache(t, validated || '');
    return validated;
  } catch (err) {
    console.warn(`[tagEmoji] LLM lookup failed for "${t}":`, err.message);
    return null;
  }
}

module.exports = {
  getOverrides,
  getCache,
  getMergedMap,
  setOverride,
  clearOverride,
  setCache,
  suggestEmojiForTag,
  validateEmoji,
};
