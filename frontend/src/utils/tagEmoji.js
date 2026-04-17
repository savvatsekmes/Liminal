// Tag → emoji mapping. Used across journal, notes, and conversations.
// User-created tags can include their own emoji — this map covers known tags.
const TAG_EMOJI = {
  // Special signals (from Notion import)
  breakthrough:   '\u{1FAE0}',  // 🫠 melty face
  fights:         '\u{1F525}',  // 🔥 fire

  // Core notes tags
  idea:           '\u{1F4A1}',  // 💡
  quote:          '\u{1F4AC}',  // 💬
  goal:           '\u{1F3AF}',  // 🎯
  reflection:     '\u{1F52E}',  // 🔮
  none:           '\u{2796}',   // ➖

  // Predefined LLM suggestion categories
  identity:       '\u{1F9E9}',  // 🧩
  career:         '\u{1F4BC}',  // 💼
  spirituality:   '\u{1F54A}\uFE0F',  // 🕊️
  relationships:  '\u{1F91D}',  // 🤝
  'self-work':    '\u{1F331}',  // 🌱
  creativity:     '\u{1F3A8}',  // 🎨
  health:         '\u{1F49A}',  // 💚
  ideas:          '\u{1F4A1}',  // 💡
  grief:          '\u{1F54A}\uFE0F',  // 🕊️
  body:           '\u{1F9D8}',  // 🧘
  fear:           '\u{1F32A}\uFE0F',  // 🌪️
  joy:            '\u{2728}',   // ✨
  transition:     '\u{1F30A}',  // 🌊
  work:           '\u{2699}\uFE0F',  // ⚙️
  family:         '\u{1F3E0}',  // 🏠
  nature:         '\u{1F33F}',  // 🌿
  dreams:         '\u{1F319}',  // 🌙
  money:          '\u{1F4B0}',  // 💰

  // Common user-created tags
  love:           '\u{2764}\uFE0F',  // ❤️
  anxiety:        '\u{1F4AD}',  // 💭
  growth:         '\u{1F33B}',  // 🌻
  anger:          '\u{1F4A2}',  // 💢
  gratitude:      '\u{1F64F}',  // 🙏
  travel:         '\u{2708}\uFE0F',  // ✈️
  friendship:     '\u{1F496}',  // 💖
  loss:           '\u{1F49C}',  // 💜
  success:        '\u{1F3C6}',  // 🏆
  failure:        '\u{1F50D}',  // 🔍
  conflict:       '\u{26A1}',   // ⚡
  healing:        '\u{1FA79}',  // 🩹
  motivation:     '\u{1F680}',  // 🚀
  stress:         '\u{1F4A8}',  // 💨
  peace:          '\u{1F54A}\uFE0F',  // 🕊️
  change:         '\u{1F300}',  // 🌀
  music:          '\u{1F3B5}',  // 🎵
  art:            '\u{1F58C}\uFE0F',  // 🖌️
  food:           '\u{1F372}',  // 🍲
  fitness:        '\u{1F4AA}',  // 💪
  sleep:          '\u{1F634}',  // 😴
  therapy:        '\u{1FA7A}',  // 🩺
  daily:          '\u{2615}',   // ☕
  dream:          '\u{1F319}',  // 🌙
  sex:            '\u{1F48B}',  // 💋
  nostalgia:      '\u{1F4F8}',  // 📸
  loneliness:     '\u{1F30C}',  // 🌌
  confidence:     '\u{1F451}',  // 👑
  vulnerability:  '\u{1F4A7}',  // 💧
};

/**
 * Returns the emoji prefix for a tag, or empty string if none.
 * Also detects if the tag already starts with an emoji (user-added).
 */
export function tagEmoji(tag) {
  if (!tag) return '';
  // If the tag already starts with an emoji (non-ASCII leading char), don't double up
  const first = tag.codePointAt(0);
  if (first > 0x2600) return '';
  return TAG_EMOJI[tag.toLowerCase()] || '';
}

/**
 * Tags whose emoji should be rendered as an <img> (Twemoji) because the
 * Unicode codepoint isn't reliably available on all platforms.
 */
export const IMG_EMOJI = {
  breakthrough: '/emoji-melting.png',
};

/**
 * Returns a display string: "emoji tag" or just "tag" if no emoji found.
 */
export function tagLabel(tag) {
  const emoji = tagEmoji(tag);
  return emoji ? `${emoji} ${tag}` : tag;
}

/**
 * Extract emoji glyphs for a list of tags, preserving order and deduping.
 * Falls back to the first codepoint if the tag itself begins with an emoji.
 * Used by the right-side tag strip on journal / notes / conversations list items.
 */
export function tagEmojisFromTags(tags) {
  const out = [];
  const seen = new Set();
  for (const raw of tags || []) {
    if (!raw) continue;
    const tag = String(raw).trim();
    let glyph = '';
    const first = tag.codePointAt(0);
    if (first > 0x2600) {
      // Tag already starts with a user-chosen emoji — pull it off the front
      glyph = String.fromCodePoint(first);
      // Include the variation selector if present (e.g. ✈️)
      const next = tag.codePointAt(glyph.length);
      if (next === 0xfe0f) glyph += '\uFE0F';
    } else {
      glyph = TAG_EMOJI[tag.toLowerCase()] || '';
    }
    if (glyph && !seen.has(glyph)) {
      seen.add(glyph);
      out.push({ tag, glyph, img: IMG_EMOJI[tag.toLowerCase()] || null });
    }
  }
  return out;
}
