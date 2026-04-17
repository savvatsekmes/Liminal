import { Node, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

// ── MediaRow — stackable flex row for media embeds ─────────────────────────
// Wraps 2–4 child blocks in a CSS flexbox row. Uses plain ProseMirror
// NodeView (dom + contentDOM) to avoid nested-contentEditable cursor traps.

const ROW_ATOM_TYPES = new Set([
  'imageEmbed', 'youtubeEmbed', 'instagramEmbed', 'cardReading', 'detailsBlock',
]);

function isRowCandidate(node) {
  return ROW_ATOM_TYPES.has(node.type.name);
}

const hintKey = new PluginKey('mediaRowDropHint');

// Track the source position of a drag so we can reliably delete it
let _dragSourcePos = null;

export const MediaRow = Node.create({
  name: 'mediaRow',
  group: 'block',
  content: 'block+',
  draggable: true,

  addAttributes() {
    return {
      columns: { default: 0 },
    };
  },

  parseHTML() {
    return [{
      tag: 'div[data-media-row]',
      getAttrs: (dom) => ({
        columns: parseInt(dom.getAttribute('data-columns') || '0', 10),
      }),
    }];
  },

  renderHTML({ node }) {
    return ['div', mergeAttributes({
      'data-media-row': '',
      'data-columns': String(node.attrs.columns || 0),
    }), 0];
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement('div');
      dom.setAttribute('data-media-row', '');
      dom.setAttribute('data-columns', String(node.attrs.columns || 0));
      dom.style.cssText = 'margin:8px 0;position:relative;';

      const handle = document.createElement('span');
      handle.setAttribute('data-drag-handle', '');
      handle.textContent = '\u2807';
      handle.title = 'Drag row';
      handle.style.cssText = [
        'position:absolute;left:-20px;top:4px;cursor:grab;',
        'color:var(--muted);font-size:14px;padding:0 4px;',
        'display:flex;align-items:center;opacity:0;',
        'transition:opacity 0.15s;z-index:1;user-select:none;',
      ].join('');
      dom.appendChild(handle);

      const contentDOM = document.createElement('div');
      contentDOM.style.cssText = 'display:flex;gap:8px;align-items:flex-start;';
      dom.appendChild(contentDOM);

      dom.addEventListener('mouseenter', () => { handle.style.opacity = '0.7'; });
      dom.addEventListener('mouseleave', () => { handle.style.opacity = '0'; });

      return {
        dom,
        contentDOM,
        update(updatedNode) {
          if (updatedNode.type.name !== 'mediaRow') return false;
          node = updatedNode;
          dom.setAttribute('data-columns', String(updatedNode.attrs.columns || 0));
          return true;
        },
        stopEvent(event) {
          if (handle.contains(event.target)) return true;
          return false;
        },
        ignoreMutation(mutation) {
          if (handle.contains(mutation.target)) return true;
          return false;
        },
      };
    };
  },

  addCommands() {
    return {
      wrapInMediaRow: (posA, posB) => ({ tr, state }) => {
        const first = Math.min(posA, posB);
        const second = Math.max(posA, posB);
        const nodeA = state.doc.nodeAt(first);
        const nodeB = state.doc.nodeAt(second);
        if (!nodeA || !nodeB) return false;

        const rowNode = state.schema.nodes.mediaRow.create(
          { columns: 0 },
          [nodeA, nodeB]
        );
        tr.delete(second, second + nodeB.nodeSize);
        tr.replaceWith(first, first + nodeA.nodeSize, rowNode);
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      // ── Structural enforcement ──
      new Plugin({
        appendTransaction(transactions, oldState, newState) {
          if (!transactions.some(t => t.docChanged)) return null;

          let tr = newState.tr;
          let modified = false;
          const pType = newState.schema.nodes.paragraph;

          const fixes = [];
          newState.doc.forEach((node, offset) => {
            if (node.type.name === 'mediaRow') {
              if (node.childCount <= 1) fixes.push({ type: 'dissolve', offset, node });
              else if (node.childCount > 4) fixes.push({ type: 'truncate', offset, node });
            }
          });

          for (let i = fixes.length - 1; i >= 0; i--) {
            const { type, offset, node } = fixes[i];
            if (type === 'dissolve') {
              if (node.childCount === 1) {
                tr = tr.replaceWith(offset, offset + node.nodeSize, node.child(0));
              } else {
                tr = tr.delete(offset, offset + node.nodeSize);
              }
              modified = true;
            } else if (type === 'truncate') {
              const extras = [];
              for (let c = 4; c < node.childCount; c++) extras.push(node.child(c));
              let innerEnd = offset + 1;
              for (let c = 0; c < 4; c++) innerEnd += node.child(c).nodeSize;
              tr = tr.delete(innerEnd, offset + node.nodeSize - 1);
              for (let e = extras.length - 1; e >= 0; e--) {
                tr = tr.insert(offset + node.nodeSize, extras[e]);
              }
              modified = true;
            }
          }

          const checkDoc = modified ? tr.doc : newState.doc;
          const last = checkDoc.lastChild;
          if (last && (last.type.name === 'mediaRow' || (last.isAtom && !last.isTextblock))) {
            tr = tr.insert(checkDoc.content.size, pType.create());
            modified = true;
          }

          return modified ? tr : null;
        },
      }),

      // ── Track drag source position ──
      new Plugin({
        props: {
          handleDOMEvents: {
            dragstart(view, event) {
              // Record the position of whatever node is being dragged,
              // so handleDrop can reliably delete it even from inside rows.
              const { selection } = view.state;
              if (selection.node && isRowCandidate(selection.node)) {
                _dragSourcePos = selection.from;
              } else {
                _dragSourcePos = null;
              }
              return false;
            },
          },
        },
      }),

      // ── Drop handling ──
      new Plugin({
        props: {
          handleDrop(view, event, slice, moved) {
            if (!slice || !slice.content || slice.content.childCount !== 1) return false;

            const draggedNode = slice.content.firstChild;
            if (!draggedNode || !isRowCandidate(draggedNode)) return false;

            const { clientX, clientY } = event;
            const hit = hitTestAll(view, clientX, clientY);

            // ── Helper: delete source node reliably ──
            function deleteSource(tr) {
              if (!moved) return tr;
              // Use tracked position first (most reliable), fall back to search
              let sourcePos = null;
              if (_dragSourcePos !== null) {
                const nodeAtTracked = tr.doc.nodeAt(_dragSourcePos);
                if (nodeAtTracked && nodeAtTracked.type.name === draggedNode.type.name) {
                  sourcePos = _dragSourcePos;
                }
              }
              if (sourcePos === null) {
                sourcePos = findDragSource(tr.doc, draggedNode);
              }
              if (sourcePos !== null) {
                tr = tr.delete(sourcePos, sourcePos + draggedNode.nodeSize);
              }
              _dragSourcePos = null;
              return tr;
            }

            // No hit on a media target — if the source is inside a row, we need
            // to handle the "drag out of row" case so PM's default drop works
            // but the source gets properly removed from the row.
            if (!hit) {
              if (!moved) return false;

              // Check if the source is inside a mediaRow
              const srcPos = _dragSourcePos ?? findDragSource(view.state.doc, draggedNode);
              if (srcPos === null) return false;

              const $src = view.state.doc.resolve(srcPos);
              let insideRow = false;
              for (let d = $src.depth; d > 0; d--) {
                if ($src.node(d).type.name === 'mediaRow') {
                  insideRow = true;
                  break;
                }
              }

              if (!insideRow) return false; // Not in a row, let PM handle normally

              // Source is inside a row — we must handle this ourselves.
              // Use posAtCoords to find where PM would drop it.
              event.preventDefault();
              const coords = { left: clientX, top: clientY };
              const dropPos = view.posAtCoords(coords);
              if (!dropPos) return false;

              let tr = view.state.tr;
              // Delete source from row first
              tr = deleteSource(tr);
              // Insert at the drop position (adjusted for deletion)
              let insertAt = dropPos.pos;
              if (srcPos !== null && srcPos < insertAt) {
                insertAt -= draggedNode.nodeSize;
              }
              // Resolve to a valid block position
              const $drop = tr.doc.resolve(Math.min(insertAt, tr.doc.content.size));
              // Find the nearest top-level position
              let blockPos = $drop.before($drop.depth > 0 ? 1 : 0);
              if (blockPos < 0) blockPos = 0;
              // Insert after the block at this position
              const nodeAtBlock = tr.doc.nodeAt(blockPos);
              if (nodeAtBlock) {
                tr = tr.insert(blockPos + nodeAtBlock.nodeSize, draggedNode);
              } else {
                tr = tr.insert(tr.doc.content.size, draggedNode);
              }
              view.dispatch(tr);
              return true;
            }

            // Case 1: Drop onto a child inside an existing row
            if (hit.type === 'row-child') {
              const parentRow = hit.parentNode;
              // Check if we're dropping onto ourselves
              if (moved && hit.childPos === _dragSourcePos) return false;
              // Check capacity (allow if source is already in this row — it's a reorder)
              const sourceInSameRow = moved && _dragSourcePos !== null &&
                _dragSourcePos >= hit.parentPos &&
                _dragSourcePos < hit.parentPos + parentRow.nodeSize;
              if (!sourceInSameRow && parentRow.childCount >= 4) return false;

              event.preventDefault();
              let tr = view.state.tr;
              tr = deleteSource(tr);

              // Re-find the row after deletion
              const rowPos = findNodePos(tr.doc, 'mediaRow', hit.parentPos);
              if (rowPos === null) return false;
              const rowAfter = tr.doc.nodeAt(rowPos);
              if (!rowAfter || rowAfter.type.name !== 'mediaRow') return false;

              // Find which child we're targeting (by matching type+attrs after deletion)
              const insertSide = clientX < hit.rect.left + hit.rect.width / 2 ? 'left' : 'right';
              let childOffset = rowPos + 1;
              let inserted = false;
              for (let c = 0; c < rowAfter.childCount; c++) {
                const child = rowAfter.child(c);
                if (matchesNode(child, hit.childNode) && !inserted) {
                  if (insertSide === 'left') {
                    tr = tr.insert(childOffset, draggedNode);
                  } else {
                    tr = tr.insert(childOffset + child.nodeSize, draggedNode);
                  }
                  inserted = true;
                  break;
                }
                childOffset += child.nodeSize;
              }
              if (!inserted) {
                tr = tr.insert(rowPos + rowAfter.nodeSize - 1, draggedNode);
              }

              view.dispatch(tr);
              return true;
            }

            // Case 2: Drop into existing row gap (< 4 items)
            if (hit.type === 'row' && hit.node.childCount < 4) {
              // Check if source is already in this row
              const sourceInSameRow = moved && _dragSourcePos !== null &&
                _dragSourcePos >= hit.pos &&
                _dragSourcePos < hit.pos + hit.node.nodeSize;
              if (sourceInSameRow && hit.node.childCount <= 2) return false; // Would leave row with 1

              event.preventDefault();
              let tr = view.state.tr;
              tr = deleteSource(tr);

              const rowPos = findNodePos(tr.doc, 'mediaRow', hit.pos);
              if (rowPos === null) return false;
              const rowAfter = tr.doc.nodeAt(rowPos);
              if (rowAfter && rowAfter.type.name === 'mediaRow') {
                tr = tr.insert(rowPos + rowAfter.nodeSize - 1, draggedNode);
              }
              view.dispatch(tr);
              return true;
            }

            // Case 3: Drop onto standalone atom → create row
            if (hit.type === 'atom') {
              event.preventDefault();
              let tr = view.state.tr;
              let targetPos = hit.pos;

              if (moved) {
                // Check we're not dropping onto ourselves
                if (_dragSourcePos === targetPos) return false;
                const srcPos = _dragSourcePos ?? findDragSource(tr.doc, draggedNode);
                if (srcPos !== null) {
                  tr = tr.delete(srcPos, srcPos + draggedNode.nodeSize);
                  if (srcPos < targetPos) targetPos -= draggedNode.nodeSize;
                }
                _dragSourcePos = null;
              }

              const targetAfter = tr.doc.nodeAt(targetPos);
              if (!targetAfter || !isRowCandidate(targetAfter)) return false;

              const insertBefore = clientX < hit.rect.left + hit.rect.width / 2;
              const children = insertBefore
                ? [draggedNode, targetAfter]
                : [targetAfter, draggedNode];

              const rowNodeNew = view.state.schema.nodes.mediaRow.create(
                { columns: 0 }, children
              );
              tr = tr.replaceWith(targetPos, targetPos + targetAfter.nodeSize, rowNodeNew);
              view.dispatch(tr);
              return true;
            }

            return false;
          },
        },
      }),

      // ── Dragover visual hints ──
      new Plugin({
        key: hintKey,
        state: {
          init() { return null; },
          apply(tr, value) {
            const meta = tr.getMeta(hintKey);
            if (meta === null) return null;
            if (meta !== undefined) return meta;
            return value;
          },
        },
        props: {
          handleDOMEvents: {
            dragover(view, event) {
              const { clientX, clientY } = event;
              const hit = hitTestAll(view, clientX, clientY);

              if (!hit) { hideIndicator(); return false; }

              if (hit.type === 'atom') {
                const side = clientX < hit.rect.left + hit.rect.width / 2 ? 'left' : 'right';
                showIndicator(hit.rect, side);
              } else if (hit.type === 'row-child') {
                const side = clientX < hit.rect.left + hit.rect.width / 2 ? 'left' : 'right';
                showIndicator(hit.rect, side);
              } else if (hit.type === 'row' && hit.node.childCount < 4) {
                showIndicator(hit.rect, 'into-row');
              } else {
                hideIndicator();
              }
              return false;
            },
            dragleave(view, event) {
              const related = event.relatedTarget;
              if (!related || !view.dom.contains(related)) {
                hideIndicator();
              }
              return false;
            },
            drop() { hideIndicator(); return false; },
            dragend() { hideIndicator(); _dragSourcePos = null; return false; },
          },
        },
      }),
    ];
  },

  addKeyboardShortcuts() {
    return {
      Escape: ({ editor }) => {
        const { $from } = editor.state.selection;
        for (let d = $from.depth; d > 0; d--) {
          if ($from.node(d).type.name === 'mediaRow') {
            editor.commands.focus($from.after(d));
            return true;
          }
        }
        return false;
      },
    };
  },
});

// ── Helpers ─────────────────────────────────────────────────────────────────

// Enhanced hit-test that checks both doc-level children AND children inside mediaRows
function hitTestAll(view, clientX, clientY) {
  let result = null;

  view.state.doc.forEach((child, offset) => {
    if (result) return;

    if (child.type.name === 'mediaRow') {
      // First check children inside the row
      let childPos = offset + 1;
      for (let c = 0; c < child.childCount; c++) {
        const rowChild = child.child(c);
        const childDOM = findChildDOM(view, childPos);
        if (childDOM instanceof Element) {
          const rect = childDOM.getBoundingClientRect();
          if (clientX >= rect.left && clientX <= rect.right &&
              clientY >= rect.top && clientY <= rect.bottom) {
            result = {
              type: 'row-child',
              childNode: rowChild,
              childPos: childPos,
              parentNode: child,
              parentPos: offset,
              dom: childDOM,
              rect: rect,
            };
            return;
          }
        }
        childPos += rowChild.nodeSize;
      }

      // Then check the row itself (for gaps between children)
      const rowDOM = view.nodeDOM(offset);
      if (rowDOM instanceof Element) {
        const rowRect = rowDOM.getBoundingClientRect();
        if (clientX >= rowRect.left && clientX <= rowRect.right &&
            clientY >= rowRect.top && clientY <= rowRect.bottom) {
          result = { type: 'row', node: child, pos: offset, dom: rowDOM, rect: rowRect };
        }
      }
    } else if (isRowCandidate(child)) {
      const dom = view.nodeDOM(offset);
      if (!(dom instanceof Element)) return;
      const rect = dom.getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right &&
          clientY >= rect.top && clientY <= rect.bottom) {
        result = { type: 'atom', node: child, pos: offset, dom, rect };
      }
    }
  });

  return result;
}

// Find the DOM element for a node at a given position
function findChildDOM(view, pos) {
  try {
    const domInfo = view.domAtPos(pos);
    if (!domInfo) return null;
    let dom = domInfo.node;
    if (dom.nodeType === 3) dom = dom.parentElement;
    while (dom && dom !== view.dom) {
      if (dom.hasAttribute && (dom.hasAttribute('data-node-view-wrapper') || dom.hasAttribute('data-toggle'))) {
        return dom;
      }
      if (dom.parentElement && dom.parentElement.style && dom.parentElement.style.display === 'flex') {
        return dom;
      }
      dom = dom.parentElement;
    }
    return null;
  } catch {
    return null;
  }
}

// Re-find a node's position after document mutations by searching nearest match
function findNodePos(doc, typeName, originalPos) {
  // Try original position first
  const nodeAtPos = doc.nodeAt(originalPos);
  if (nodeAtPos && nodeAtPos.type.name === typeName) return originalPos;

  // Search nearby — positions shift by the size of the deleted node
  let closest = null;
  let closestDist = Infinity;
  doc.forEach((node, offset) => {
    if (node.type.name === typeName) {
      const dist = Math.abs(offset - originalPos);
      if (dist < closestDist) {
        closestDist = dist;
        closest = offset;
      }
    }
  });
  return closest;
}

// Check if two nodes match (by type and attrs)
function matchesNode(a, b) {
  return a.type.name === b.type.name && JSON.stringify(a.attrs) === JSON.stringify(b.attrs);
}

// Find source node position by deep-comparing type + JSON attrs
function findDragSource(doc, draggedNode) {
  const targetType = draggedNode.type.name;
  const targetAttrs = JSON.stringify(draggedNode.attrs);
  let found = null;
  doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.type.name === targetType && JSON.stringify(node.attrs) === targetAttrs) {
      found = pos;
      return false;
    }
  });
  return found;
}

// ── Drop indicator (DOM element) ────────────────────────────────────────────

let _indicator = null;

function getIndicator() {
  if (_indicator) return _indicator;
  _indicator = document.createElement('div');
  _indicator.style.cssText = [
    'position:fixed;pointer-events:none;z-index:9999;',
    'background:#4a9eff;border-radius:2px;',
    'box-shadow:0 0 8px rgba(74,158,255,0.5);',
    'transition:top 0.08s,left 0.08s,width 0.08s,height 0.08s;',
  ].join('');
  _indicator.style.display = 'none';
  document.body.appendChild(_indicator);
  return _indicator;
}

function showIndicator(rect, side) {
  const el = getIndicator();
  el.style.display = 'block';

  if (side === 'left') {
    el.style.left = (rect.left - 3) + 'px';
    el.style.top = (rect.top - 2) + 'px';
    el.style.width = '3px';
    el.style.height = (rect.height + 4) + 'px';
    el.style.background = '#4a9eff';
    el.style.boxShadow = '0 0 8px rgba(74,158,255,0.5)';
    el.style.borderRadius = '2px';
  } else if (side === 'right') {
    el.style.left = (rect.right) + 'px';
    el.style.top = (rect.top - 2) + 'px';
    el.style.width = '3px';
    el.style.height = (rect.height + 4) + 'px';
    el.style.background = '#4a9eff';
    el.style.boxShadow = '0 0 8px rgba(74,158,255,0.5)';
    el.style.borderRadius = '2px';
  } else if (side === 'into-row') {
    el.style.left = (rect.left - 2) + 'px';
    el.style.top = (rect.top - 2) + 'px';
    el.style.width = (rect.width + 4) + 'px';
    el.style.height = (rect.height + 4) + 'px';
    el.style.background = 'transparent';
    el.style.boxShadow = 'inset 0 0 0 2px rgba(74,158,255,0.5)';
    el.style.borderRadius = '14px';
  }
}

function hideIndicator() {
  if (_indicator) {
    _indicator.style.display = 'none';
    _indicator.style.background = '#4a9eff';
    _indicator.style.boxShadow = '0 0 8px rgba(74,158,255,0.5)';
    _indicator.style.borderRadius = '2px';
  }
}
