// Chat replies cite journal entries (see backend services/journalRecall.js):
//   [[entry:ID|words]]        words in the reply, shown as a link to the entry
//   [[entry:ID@YYYY-MM-DD]]   a small date chip linking to the entry
// Anything that reads aloud or saves the text keeps the words and drops chips.

const CITE_RE = /\[\[entry:(\d+)(?:\|([^\]\n]{1,120})|@(\d{4}-\d{2}-\d{2}))\]\]/g;

/** Split text into [{ type: 'text', text } | { type: 'entry', id, label } | { type: 'entryChip', id, date }]. */
export function parseEntryCitations(text) {
  const out = [];
  const s = String(text || '');
  let last = 0;
  for (const m of s.matchAll(CITE_RE)) {
    if (m.index > last) out.push({ type: 'text', text: s.slice(last, m.index) });
    out.push(m[2] != null
      ? { type: 'entry', id: Number(m[1]), label: m[2] }
      : { type: 'entryChip', id: Number(m[1]), date: m[3] });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ type: 'text', text: s.slice(last) });
  return out;
}

/** The text with citations reduced to their words (chips drop out). */
export function stripEntryCitations(text) {
  return String(text || '')
    .replace(CITE_RE, (all, id, label) => label || '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([.,;:!?)])/g, '$1');
}

/** "2026-09-12" → "12 Sep 2026" */
export function formatChipDate(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1];
  return mon ? `${d} ${mon} ${y}` : iso;
}
