/**
 * Editor-level dragstart guard for atom NodeViews (CardReading, ImageEmbed).
 *
 * Problem: Tiptap's `draggable: true` makes the entire NodeView root a browser
 * drag source. Even with a `data-drag-handle` element, a tiny mouse movement
 * during a click anywhere inside the node fires `dragstart`, and the resulting
 * drop (often back onto the same editor at a slightly different position) can
 * cause ProseMirror's drag-move logic to delete the source node — the user sees
 * the embed silently disappear when they click on it.
 *
 * Fix: this guard intercepts `dragstart` at the EditorView level. If the drag
 * originates from inside one of our atom wrappers but NOT from a `[data-drag-handle]`
 * descendant, we cancel the drag entirely. Drags initiated from the explicit ⠿
 * handle still work as before; clicks-with-tiny-movement on the body do nothing.
 *
 * Pure text drags (selection drag-and-drop within prose) are unaffected because
 * their dragstart target is not inside an atom wrapper.
 *
 * Wire this into useEditor via:
 *   editorProps: { handleDOMEvents: { dragstart: atomDragGuard } }
 */

const ATOM_SELECTOR = '[data-card-reading], [data-image-embed], [data-youtube-embed]';

export function atomDragGuard(_view, event) {
  const target = event.target;
  if (!(target instanceof Element)) return false;

  const atom = target.closest(ATOM_SELECTOR);
  if (!atom) return false; // not our atom — let it through (text drag etc.)

  // Inside an atom: only allow drag from the explicit handle.
  const handle = target.closest('[data-drag-handle]');
  if (handle && atom.contains(handle)) return false; // legitimate handle drag

  // Click-with-tiny-movement on the atom body — kill the drag before it can
  // turn into an accidental delete.
  event.preventDefault();
  event.stopPropagation();
  return true; // signal handled
}
