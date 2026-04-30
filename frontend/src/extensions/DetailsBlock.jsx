import { Node, mergeAttributes } from '@tiptap/core';
import { Plugin, NodeSelection } from '@tiptap/pm/state';

// ── Details / Toggle block ──────────────────────────────────────────────────
// Uses a plain ProseMirror node view (dom + contentDOM) instead of React's
// NodeViewContent to avoid the nested-contentEditable cursor trap.

export const DetailsBlock = Node.create({
  name: 'detailsBlock',
  group: 'block',
  content: 'block+',
  defining: true,
  draggable: true,

  addAttributes() {
    return {
      summary: { default: '' },
      open: { default: true },
    };
  },

  parseHTML() {
    return [{
      tag: 'details[data-toggle]',
      getAttrs: (dom) => ({
        summary: dom.getAttribute('data-summary') || dom.querySelector('summary')?.textContent || '',
        open: dom.hasAttribute('open'),
      }),
    }];
  },

  renderHTML({ node }) {
    const attrs = { 'data-toggle': '', 'data-summary': node.attrs.summary };
    if (node.attrs.open) attrs.open = '';
    return ['details', mergeAttributes(attrs), ['div', { 'data-details-content': '' }, 0]];
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      // ── Outer wrapper ──
      const dom = document.createElement('div');
      dom.setAttribute('data-toggle', '');
      dom.draggable = true; // Required for plain NodeViews — React ones get this from NodeViewWrapper
      dom.style.cssText = 'margin:8px 0;display:block;position:relative;';

      // Drag handle — outside header/box so stopEvent doesn't intercept drag events.
      // Must be contentEditable='false' so ProseMirror skips it during DOM parsing.
      // Must be draggable='true' so browser fires dragstart on the handle itself
      // (not on dom), which lets atomDragGuard recognize it as a valid drag-handle drag.
      const drag = document.createElement('span');
      drag.setAttribute('data-drag-handle', '');
      drag.contentEditable = 'false';
      drag.draggable = true;
      drag.textContent = '⠿';
      drag.title = 'Drag to reorder';
      drag.style.cssText = 'position:absolute;left:12px;top:10px;z-index:2;cursor:grab;color:var(--muted);font-size:14px;padding:0 4px;display:flex;align-items:center;opacity:0.3;transition:opacity 0.15s;';
      dom.appendChild(drag);

      const box = document.createElement('div');
      box.style.cssText = 'border:var(--border-style);border-radius:14px;overflow:hidden;background:var(--near-white);position:relative;';
      dom.appendChild(box);

      // ── Header ──
      const header = document.createElement('div');
      header.style.cssText = 'display:flex;align-items:center;gap:4px;padding:10px 12px 10px 36px;user-select:none;';
      header.contentEditable = 'false';
      box.appendChild(header);

      // Arrow
      const arrow = document.createElement('span');
      arrow.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4 2L9 6L4 10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      arrow.style.cssText = 'cursor:pointer;display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;flex-shrink:0;transition:transform 0.15s;color:var(--strong);';
      header.appendChild(arrow);

      // Summary (editable)
      const summaryWrap = document.createElement('div');
      summaryWrap.style.cssText = 'flex:1;position:relative;min-width:20px;';
      header.appendChild(summaryWrap);

      const placeholder = document.createElement('span');
      placeholder.textContent = 'Toggle heading';
      placeholder.style.cssText = 'position:absolute;top:2px;left:4px;font-weight:600;font-size:14px;color:var(--muted);opacity:0.5;pointer-events:none;user-select:none;';
      summaryWrap.appendChild(placeholder);

      const summary = document.createElement('span');
      summary.contentEditable = 'true';
      summary.textContent = node.attrs.summary || '';
      summary.style.cssText = 'font-weight:600;font-size:14px;outline:none;width:100%;display:block;color:var(--strong);padding:2px 4px;border-radius:4px;cursor:text;min-height:20px;';
      summaryWrap.appendChild(summary);

      // Delete button
      const del = document.createElement('button');
      del.innerHTML = '&times;';
      del.title = 'Remove toggle';
      del.style.cssText = 'background:none;border:none;color:var(--muted);font-size:16px;cursor:pointer;padding:0 4px;line-height:1;opacity:0;transition:opacity 0.15s,color 0.15s;flex-shrink:0;';
      header.appendChild(del);

      // ── Content area — this is the ProseMirror contentDOM ──
      // Do NOT set contentEditable here — ProseMirror manages it automatically.
      // The data-details-content marker lets the right-click "Copy" path locate
      // the inner content cleanly when serialising the toggle for clipboard.
      const contentDOM = document.createElement('div');
      contentDOM.setAttribute('data-details-content', '');
      contentDOM.style.cssText = 'padding:4px 12px 12px 40px;';
      box.appendChild(contentDOM);

      // ── State ──
      let isOpen = node.attrs.open !== false;

      function updateVisuals() {
        arrow.style.transform = isOpen ? 'rotate(90deg)' : 'rotate(0deg)';
        contentDOM.style.display = isOpen ? 'block' : 'none';
        header.style.borderBottom = isOpen ? 'var(--border-style)' : 'none';
      }

      function updatePlaceholder() {
        placeholder.style.display = summary.textContent.trim() ? 'none' : '';
      }

      updateVisuals();
      updatePlaceholder();

      // ── Events ──

      // Plain click on the drag handle: select the whole toggle as a NodeSelection
      // so the user can copy it with Ctrl+C. ProseMirror's clipboard path then
      // serialises via renderHTML → which parseHTML re-parses on paste, giving a
      // clean round-trip into another entry. Without this, there's no UI affordance
      // to select the whole toggle (clicking inside enters text-edit mode, the drag
      // handle's dragstart only fires during an actual drag).
      drag.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const pos = getPos();
        if (typeof pos !== 'number') return;
        const sel = NodeSelection.create(editor.view.state.doc, pos);
        editor.view.dispatch(editor.view.state.tr.setSelection(sel));
        editor.view.focus();
      });

      // Drag: replicate Tiptap's onDragStart for plain NodeViews.
      // React NodeViews get this from NodeViewWrapper; plain ones need it manually.
      drag.addEventListener('dragstart', (e) => {
        const pos = getPos();
        if (typeof pos !== 'number') return;
        // Set drag image from the full node
        const domBox = dom.getBoundingClientRect();
        const handleBox = drag.getBoundingClientRect();
        const x = handleBox.x - domBox.x + (e.offsetX || 0);
        const y = handleBox.y - domBox.y + (e.offsetY || 0);
        const clone = dom.cloneNode(true);
        document.body.appendChild(clone);
        clone.style.position = 'absolute';
        clone.style.top = '-10000px';
        e.dataTransfer.setDragImage(clone, x, y);
        requestAnimationFrame(() => clone.remove());
        // Create NodeSelection so ProseMirror's dragstart handler serialises this node
        const sel = NodeSelection.create(editor.view.state.doc, pos);
        editor.view.dispatch(editor.view.state.tr.setSelection(sel));
      });

      arrow.addEventListener('click', (e) => {
        e.preventDefault();
        isOpen = !isOpen;
        const pos = getPos();
        if (typeof pos === 'number') {
          editor.view.dispatch(
            editor.view.state.tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              open: isOpen,
            })
          );
        }
        updateVisuals();
      });

      summary.addEventListener('input', () => {
        updatePlaceholder();
      });

      summary.addEventListener('blur', () => {
        const text = summary.textContent?.trim() || '';
        const pos = getPos();
        if (typeof pos === 'number') {
          editor.view.dispatch(
            editor.view.state.tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              summary: text,
            })
          );
        }
        updatePlaceholder();
      });

      summary.addEventListener('keydown', (e) => {
        e.stopPropagation(); // prevent Tiptap from capturing
        if (e.key === 'Enter') {
          e.preventDefault();
          summary.blur();
          if (isOpen) {
            const pos = getPos();
            if (typeof pos === 'number') editor.commands.focus(pos + 1);
          } else {
            const pos = getPos();
            if (typeof pos === 'number') editor.commands.focus(pos + node.nodeSize);
          }
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          summary.blur();
          const pos = getPos();
          if (typeof pos === 'number') editor.commands.focus(pos + node.nodeSize);
        }
      });

      summary.addEventListener('mousedown', (e) => e.stopPropagation());

      del.addEventListener('click', () => {
        const pos = getPos();
        if (typeof pos === 'number') {
          editor.view.dispatch(
            editor.view.state.tr.delete(pos, pos + node.nodeSize)
          );
        }
      });

      // Hover effects
      dom.addEventListener('mouseenter', () => {
        drag.style.opacity = '0.8';
        del.style.opacity = '0.8';
      });
      dom.addEventListener('mouseleave', () => {
        drag.style.opacity = '0.3';
        del.style.opacity = '0';
        del.style.color = 'var(--muted)';
      });
      del.addEventListener('mouseenter', () => { del.style.opacity = '1'; del.style.color = '#c44'; });
      del.addEventListener('mouseleave', () => { del.style.color = 'var(--muted)'; });

      return {
        dom,
        contentDOM,
        update(updatedNode) {
          if (updatedNode.type.name !== 'detailsBlock') return false;
          node = updatedNode;
          isOpen = updatedNode.attrs.open !== false;
          if (!summary.matches(':focus')) {
            summary.textContent = updatedNode.attrs.summary || '';
          }
          updateVisuals();
          updatePlaceholder();
          return true;
        },
        stopEvent(event) {
          // Block ProseMirror from handling header controls (they have own listeners)
          if (header.contains(event.target)) return true;
          // Drag handle: let ALL events through to ProseMirror — it needs mousedown
          // to set up mightDrag state, then dragstart to initiate the drag.
          return false;
        },
        ignoreMutation(mutation) {
          // Ignore mutations in the header and drag handle (not PM content)
          if (header.contains(mutation.target)) return true;
          if (drag.contains(mutation.target)) return true;
          return false;
        },
      };
    };
  },

  addCommands() {
    return {
      setDetailsBlock: () => ({ commands }) => {
        return commands.insertContent([
          {
            type: 'detailsBlock',
            attrs: { summary: '', open: true },
            content: [{ type: 'paragraph' }],
          },
          { type: 'paragraph' },
        ]);
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction(transactions, oldState, newState) {
          // After any transaction, ensure:
          // 1. Every detailsBlock's last child is a paragraph (so you can click after embeds inside)
          // 2. If a detailsBlock is the last child of the doc, add a paragraph after it
          // 3. If the doc's last child is an atom/non-text block, add a trailing paragraph
          const tr = newState.tr;
          let modified = false;
          const pType = newState.schema.nodes.paragraph;

          // Walk top-level nodes
          newState.doc.forEach((node, offset) => {
            if (node.type.name === 'detailsBlock') {
              // Check last child inside the toggle
              const lastChild = node.child(node.childCount - 1);
              if (lastChild.type.name !== 'paragraph') {
                const insertPos = offset + node.nodeSize - 1; // before closing of detailsBlock
                tr.insert(insertPos, pType.create());
                modified = true;
              }
            }
          });

          // Ensure doc doesn't end with a detailsBlock or atom node
          const lastTopNode = newState.doc.lastChild;
          if (lastTopNode && (lastTopNode.type.name === 'detailsBlock' || lastTopNode.isAtom || lastTopNode.isLeaf && !lastTopNode.isTextblock)) {
            tr.insert(newState.doc.content.size, pType.create());
            modified = true;
          }

          return modified ? tr : null;
        },
      }),
    ];
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-9': () => this.editor.commands.setDetailsBlock(),

      Escape: ({ editor }) => {
        const { $from } = editor.state.selection;
        for (let d = $from.depth; d > 0; d--) {
          if ($from.node(d).type.name === 'detailsBlock') {
            const after = $from.after(d);
            editor.commands.focus(after);
            return true;
          }
        }
        return false;
      },

      ArrowDown: ({ editor }) => {
        const { $from, empty } = editor.state.selection;
        if (!empty) return false;
        for (let d = $from.depth; d > 0; d--) {
          if ($from.node(d).type.name === 'detailsBlock') {
            if ($from.pos === $from.end(d)) {
              const after = $from.after(d);
              if (after >= editor.state.doc.content.size - 1) {
                editor.chain()
                  .insertContentAt(after, { type: 'paragraph' })
                  .focus(after + 1)
                  .run();
              } else {
                editor.commands.focus(after);
              }
              return true;
            }
            break;
          }
        }
        return false;
      },

      Enter: ({ editor }) => {
        const { $from, empty } = editor.state.selection;
        if (!empty) return false;
        const parentNode = $from.parent;
        if (parentNode.type.name !== 'paragraph' || parentNode.textContent !== '') return false;
        for (let d = $from.depth - 1; d > 0; d--) {
          if ($from.node(d).type.name === 'detailsBlock') {
            const detailsNode = $from.node(d);
            if (detailsNode.childCount <= 1) return false;
            const endOfDetails = $from.end(d);
            if ($from.pos >= endOfDetails - 1) {
              const after = $from.after(d);
              editor.chain()
                .deleteNode('paragraph')
                .insertContentAt(after - 2, { type: 'paragraph' })
                .focus(after - 1)
                .run();
              return true;
            }
            break;
          }
        }
        return false;
      },
    };
  },
});
