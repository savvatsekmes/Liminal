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
