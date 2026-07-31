// Action-item extraction.
//
// After a reflection is generated, we run a SECOND, focused LLM pass over the
// same source text to scrape out concrete, file-able items in the categories
// that feed the home-screen widgets: goals, gratitudes, dreams, books to read,
// and affirmations. The frontend renders these as a final "captured" section
// under the reflection; each item the user accepts becomes a tagged note (or,
// for gratitude/dream, surfaces in those widgets too).
//
// Design intent: HIGH PRECISION over recall. A forced/hallucinated goal is
// worse than a missed one — empty categories are normal and fine. We only want
// items the user actually expressed, lightly cleaned into first-person.

const llm = require('./llmService');

// category key (in the JSON the model returns) → note tag the item is filed under
const CATEGORY_TAGS = {
  goals: 'goal',
  gratitudes: 'gratitude',
  dreams: 'dream',
  books: 'reading',
  affirmations: 'affirmation',
  quotes: 'quote',
};

const CATEGORIES = Object.keys(CATEGORY_TAGS);

function buildPrompt(lang) {
  return `You extract concrete, file-able items from a personal journal entry or note. You do NOT interpret, reflect, or add anything — you only pull out things the writer actually expressed, lightly tidied.

Return ONLY a JSON object with exactly these six keys, each an array of short strings (max ~12 words each, except quotes which may run longer):
{
  "goals": [],         // things the writer wants to do, learn, achieve, change. e.g. "Learn to astral travel", "Finish the Seraph build"
  "gratitudes": [],    // things the writer is thankful for or appreciates. e.g. "My mum's tzatziki", "A hard but good week at kung fu"
  "dreams": [],        // aspirations or actual sleeping dreams described. e.g. "Become a kung fu grandmaster"
  "books": [],         // specific books, authors, or things to read mentioned as wanting to read
  "affirmations": [],  // self-statements, mantras, or beliefs the writer affirms. e.g. "I don't need to suffer because someone else is"
  "quotes": []         // quotable lines: something the writer quoted from someone else, OR a strikingly well-put line of their own worth keeping. Include the attribution inline if they named a source, e.g. "There is no spoon — The Matrix". Verbatim, don't paraphrase.
}

Rules:
- HIGH PRECISION. Only include an item if the writer clearly expressed it. If a category has nothing, return an empty array. Empty is the correct, common answer — never invent items to fill a category.
- Write each item in clean first-person or imperative, as a short standalone phrase. Strip filler ("I think maybe I should...") down to the core ("...").
- Do NOT duplicate the same item across categories. Pick the single best fit.
- Do NOT include vague feelings, observations, or reflections — only the six concrete categories above.
- Books means actual books/reading, not metaphors.
- Output ONLY the JSON object. No preamble, no markdown fences, no commentary.${lang && lang !== 'en' ? `\n- Write the item strings in the same language as the entry (${lang}).` : ''}`;
}

// Forgiving JSON extraction: find the first balanced {...} and parse it.
function parseJson(raw) {
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  const text = fenced ? fenced[1] : raw;
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) {
      try { return JSON.parse(text.slice(start, i + 1)); } catch { return null; }
    } }
  }
  return null;
}

function cleanItems(arr, maxLen = 140) {
  if (!Array.isArray(arr)) return [];
  const seen = new Set();
  const out = [];
  for (const v of arr) {
    if (typeof v !== 'string') continue;
    const s = v.trim().replace(/\s+/g, ' ').replace(/^["'`]+|["'`]+$/g, '').trim();
    if (s.length < 2 || s.length > maxLen) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= 6) break; // cap per category
  }
  return out;
}

// Returns { goals:[], gratitudes:[], dreams:[], books:[], affirmations:[] }.
// Never throws — returns all-empty on any failure so it can't break a reflection.
async function extractActionItems(text, lang = 'en') {
  const empty = Object.fromEntries(CATEGORIES.map(c => [c, []]));
  if (!text || text.trim().length < 40) return empty;
  try {
    const raw = await llm.call(buildPrompt(lang), text, { maxTokens: 500, numCtx: 8192 });
    const parsed = parseJson(raw);
    if (!parsed) return empty;
    const result = {};
    let total = 0;
    for (const c of CATEGORIES) {
      // Quotes are allowed to run longer than the one-line action items.
      result[c] = cleanItems(parsed[c], c === 'quotes' ? 300 : 140);
      total += result[c].length;
    }
    console.log(`[extract] ${total} item(s): ` + CATEGORIES.map(c => `${c}=${result[c].length}`).join(' '));
    return result;
  } catch (e) {
    console.warn('[extract] failed:', e.message);
    return empty;
  }
}

module.exports = { extractActionItems, CATEGORY_TAGS, CATEGORIES };
