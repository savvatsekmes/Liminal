// Protect embedded media from the polish pass.
//
// Polish sends the entry's HTML to the LLM and asks it to preserve markup. In
// practice models mangle or silently drop the custom atom nodes we use for
// YouTube embeds, images, tarot readings and toggle blocks — so a polished
// entry came back with its video and images missing.
//
// Instead of trusting the model, we swap every atom for a short text token
// before sending, then splice the original HTML back in afterwards. The model
// only ever sees prose, and the media round-trips byte-for-byte.
//
// Tokens are plain ASCII inside a paragraph rather than HTML comments: comments
// are routinely stripped by models, whereas ordinary text survives.

const ATOM_SELECTOR = '[data-youtube-embed], [data-image-embed], [data-card-reading], [data-toggle]';
const token = (i) => `LIMINALMEDIA${i}`;

// Returns { html, atoms } — html has media replaced by tokens, atoms holds the
// original markup indexed to match.
export function stripMedia(html) {
  if (!html) return { html: '', atoms: [] };
  let root;
  try {
    const doc = new DOMParser().parseFromString(`<div id="liminal-root">${html}</div>`, 'text/html');
    root = doc.getElementById('liminal-root');
  } catch {
    return { html, atoms: [] };
  }
  if (!root) return { html, atoms: [] };

  const atoms = [];
  root.querySelectorAll(ATOM_SELECTOR).forEach((el) => {
    // Skip anything already pulled out with an ancestor atom (e.g. an image
    // nested inside a toggle block — the toggle's outerHTML already carries it).
    if (!root.contains(el)) return;
    if (el.parentElement?.closest(ATOM_SELECTOR)) return;

    const p = el.ownerDocument.createElement('p');
    p.textContent = token(atoms.length);
    atoms.push(el.outerHTML);
    el.replaceWith(p);
  });

  return { html: root.innerHTML, atoms };
}

// Put the media back. Handles both the paragraph shape we inserted and a bare
// token, in case the model unwrapped or moved it.
export function restoreMedia(html, atoms) {
  if (!html || !atoms?.length) return html;
  let out = html;
  atoms.forEach((atom, i) => {
    const tok = token(i);
    out = out.replace(new RegExp(`<p>\\s*${tok}\\s*</p>`, 'gi'), atom);
    if (out.includes(tok)) out = out.split(tok).join(atom);
  });
  return out;
}

// ── Structure-preserving polish ─────────────────────────────────────────────
//
// Models — especially small local ones — reliably flatten a multi-paragraph
// HTML document into one blob when asked to "preserve the tags". So we never
// let them own the structure: we hand over the text of each block element
// separately and rebuild the document ourselves from the originals.
//
// Leaf blocks only (the <p> inside a <blockquote>, each <li> rather than the
// whole <ul>), so list and quote markup survives untouched.
const LEAF_BLOCK_SELECTOR = 'p, h1, h2, h3, h4, h5, h6, li, blockquote';
const MEDIA_TOKEN_ONLY = /^LIMINALMEDIA\d+$/;

// Returns null when there's nothing worth segmenting (caller falls back to the
// whole-text path). Otherwise { segments, rebuild(polishedSegments) -> html }.
export function splitBlocks(html) {
  if (!html) return null;
  let root;
  try {
    const doc = new DOMParser().parseFromString(`<div id="liminal-root">${html}</div>`, 'text/html');
    root = doc.getElementById('liminal-root');
  } catch {
    return null;
  }
  if (!root) return null;

  const leaves = Array.from(root.querySelectorAll(LEAF_BLOCK_SELECTOR))
    .filter((el) => !el.querySelector(LEAF_BLOCK_SELECTOR));

  // Skip empties and the placeholder paragraphs standing in for media, so the
  // model never sees a token it could mangle.
  const sendable = leaves.filter((el) => {
    const text = (el.textContent || '').trim();
    return text && !MEDIA_TOKEN_ONLY.test(text);
  });
  if (!sendable.length) return null;

  return {
    segments: sendable.map((el) => el.innerHTML),
    rebuild(polished) {
      sendable.forEach((el, i) => {
        const v = polished?.[i];
        if (typeof v === 'string' && v.trim()) el.innerHTML = v;
      });
      return root.innerHTML;
    },
  };
}
