import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import { useRef, useCallback, useState, useEffect } from 'react';
import { Plugin, NodeSelection } from '@tiptap/pm/state';
import { apiFetch } from '../utils/api';

// ── Helper: send image to vision model for analysis ─────────────────────────

function analyzeImage(src) {
  return apiFetch('/api/images/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageData: src }),
  }).then((r) => r.json());
}

// ── TipTap Node ──────────────────────────────────────────────────────────────

export const ImageEmbed = Node.create({
  name: 'imageEmbed',
  group: 'block',
  atom: true,
  selectable: false, // prevents accidental NodeSelection + delete on adjacent edits
  isolating: true,
  draggable: true,   // gated to only fire from [data-drag-handle] via editor-level dragstart guard

  addAttributes() {
    return {
      src:       { default: null },
      alt:       { default: '' },
      width:     { default: '100%' },
      analyzed:  { default: false },
      imageHash: { default: null },
    };
  },

  parseHTML() {
    return [{
      tag: 'div[data-image-embed]',
      getAttrs: (dom) => ({
        src:       dom.getAttribute('data-src') || null,
        alt:       dom.getAttribute('data-alt') || '',
        width:     dom.getAttribute('data-width') || '100%',
        analyzed:  dom.getAttribute('data-analyzed') === 'true',
        imageHash: dom.getAttribute('data-image-hash') || null,
      }),
    }];
  },

  renderHTML({ node }) {
    return ['div', mergeAttributes({
      'data-image-embed': '',
      'data-src':        node.attrs.src || '',
      'data-alt':        node.attrs.alt || '',
      'data-width':      node.attrs.width || '100%',
      'data-analyzed':   node.attrs.analyzed ? 'true' : 'false',
      'data-image-hash': node.attrs.imageHash || '',
    })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageEmbedView);
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handlePaste(view, event) {
            const items = Array.from(event.clipboardData?.items || []);
            const imageItem = items.find((i) => i.type.startsWith('image/'));
            if (!imageItem) return false;

            event.preventDefault();
            const file = imageItem.getAsFile();
            if (!file) return false;

            const reader = new FileReader();
            reader.onload = (e) => {
              const src = e.target.result;
              const node = view.state.schema.nodes.imageEmbed.create({
                src,
                alt: file.name || '',
                width: '100%',
                analyzed: false,
              });
              const tr = view.state.tr.replaceSelectionWith(node);
              view.dispatch(tr);
            };
            reader.readAsDataURL(file);
            return true;
          },

          handleDOMEvents: {
            dragover(view, event) {
              const hasImage = Array.from(event.dataTransfer?.items || [])
                .some((i) => i.kind === 'file' && i.type.startsWith('image/'));
              if (hasImage) {
                event.preventDefault();
              }
              return false;
            },

            drop(view, event) {
              const files = Array.from(event.dataTransfer?.files || []);
              const imageFile = files.find((f) => f.type.startsWith('image/'));
              if (!imageFile) return false;

              event.preventDefault();
              event.stopPropagation();

              const coords = { left: event.clientX, top: event.clientY };
              const posData = view.posAtCoords(coords);
              const pos = posData?.pos ?? view.state.selection.anchor;

              const reader = new FileReader();
              reader.onload = (e) => {
                const src = e.target.result;
                const node = view.state.schema.nodes.imageEmbed.create({
                  src,
                  alt: imageFile.name || '',
                  width: '100%',
                  analyzed: false,
                });
                const tr = view.state.tr.insert(pos, node);
                view.dispatch(tr);
              };
              reader.readAsDataURL(imageFile);
              return true;
            },
          },
        },
      }),
    ];
  },
});

// ── React NodeView ───────────────────────────────────────────────────────────

function ImageEmbedView({ node, updateAttributes, deleteNode, editor, getPos }) {
  const { src, alt, width, analyzed } = node.attrs;
  const outerRef = useRef(null);
  const dragRef = useRef(null);
  const analyzedRef = useRef(analyzed);
  const [hovered, setHovered] = useState(false);
  const [status, setStatus] = useState(analyzed ? 'done' : 'idle');

  // Manual dragstart — same pattern as DetailsBlock for reliable drag from rows
  useEffect(() => {
    const handle = dragRef.current;
    if (!handle) return;
    function onDragStart(e) {
      const pos = getPos();
      if (typeof pos !== 'number') return;
      const wrapper = outerRef.current;
      if (wrapper) {
        const wrapRect = wrapper.getBoundingClientRect();
        const handleRect = handle.getBoundingClientRect();
        e.dataTransfer.setDragImage(wrapper,
          handleRect.x - wrapRect.x + (e.offsetX || 0),
          handleRect.y - wrapRect.y + (e.offsetY || 0));
      }
      const sel = NodeSelection.create(editor.view.state.doc, pos);
      editor.view.dispatch(editor.view.state.tr.setSelection(sel));
    }
    handle.draggable = true;
    handle.addEventListener('dragstart', onDragStart);
    return () => handle.removeEventListener('dragstart', onDragStart);
  }, [editor, getPos]);

  // Auto-analyze once when first inserted — use ref to avoid re-triggering on attr updates
  useEffect(() => {
    if (!src || analyzedRef.current || status === 'analyzing' || status === 'done') return;
    analyzedRef.current = true;
    setStatus('analyzing');
    analyzeImage(src)
      .then((data) => {
        if (data.description) {
          updateAttributes({ analyzed: true, imageHash: data.hash || null });
          setStatus('done');
        } else if (data.error) {
          setStatus('error');
          analyzedRef.current = false;
        }
      })
      .catch(() => { setStatus('error'); analyzedRef.current = false; });
  }, [src]);

  function handleRetry() {
    if (!src || status === 'analyzing') return;
    analyzedRef.current = true;
    setStatus('analyzing');
    analyzeImage(src)
      .then((data) => {
        if (data.description) {
          updateAttributes({ analyzed: true, imageHash: data.hash || null });
          setStatus('done');
        } else if (data.error) {
          setStatus('error');
          analyzedRef.current = false;
        }
      })
      .catch(() => { setStatus('error'); analyzedRef.current = false; });
  }

  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const el = outerRef.current;
    if (!el) return;
    const startWidth = el.getBoundingClientRect().width;
    const parentWidth = el.parentElement?.getBoundingClientRect().width || startWidth;

    const onMove = (moveE) => {
      const delta = moveE.clientX - startX;
      const newPx = Math.max(80, Math.min(parentWidth, startWidth + delta));
      const pct = Math.round((newPx / parentWidth) * 100);
      updateAttributes({ width: `${pct}%` });
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [updateAttributes]);

  if (!src) return null;

  const isDoodle = alt === 'Doodle';
  const label = isDoodle ? 'Drawing' : (alt && alt !== 'image' ? alt : 'Image');

  return (
    <NodeViewWrapper
      data-image-embed=""
      data-src={src || ''}
      data-alt={alt || ''}
      data-width={width || '100%'}
      data-analyzed={analyzed ? 'true' : 'false'}
      data-image-hash={node.attrs.imageHash || ''}
      style={{ display: 'block' }}
    >
      <div
        ref={outerRef}
        contentEditable={false}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: width || '100%',
          maxWidth: '100%',
          margin: '16px 0',
          display: 'inline-block',
          verticalAlign: 'top',
        }}
      >
        <div style={{
          borderRadius: '14px',
          border: 'var(--border-style)',
          overflow: 'hidden',
          background: 'var(--near-white)',
        }}>
          {/* Caption bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            padding: '6px 10px',
            borderBottom: 'var(--border-style)',
            fontSize: '11px',
            color: 'var(--muted)',
            gap: '8px',
          }}>
            {/* Drag handle */}
            <span
              ref={dragRef}
              data-drag-handle
              style={{
                cursor: 'grab',
                color: 'var(--muted)',
                opacity: 0.5,
                flexShrink: 0,
                fontSize: '13px',
                lineHeight: 1,
                userSelect: 'none',
                paddingRight: '2px',
              }}
              title="Drag to reorder"
            >
              ⠿
            </span>

            {/* Label */}
            <span style={{
              flex: 1,
              fontWeight: 500,
              color: 'var(--body)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {label}
            </span>

            {/* Vision status */}
            {status === 'analyzing' && (
              <span style={{ flexShrink: 0, fontSize: '10px' }}>Analyzing…</span>
            )}
            {status === 'done' && (
              <span style={{ flexShrink: 0, fontSize: '10px', color: 'var(--body)' }}>✓ Analyzed</span>
            )}
            {status === 'error' && (
              <span
                onClick={handleRetry}
                style={{ flexShrink: 0, fontSize: '10px', cursor: 'pointer', color: '#c44' }}
              >
                ✕ Retry
              </span>
            )}

            {/* Delete button */}
            <button
              onClick={() => deleteNode()}
              title="Remove"
              style={{
                flexShrink: 0,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '0 2px',
                fontSize: '14px',
                lineHeight: 1,
                color: 'var(--muted)',
                opacity: 0.6,
                display: 'flex',
                alignItems: 'center',
              }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
              onMouseLeave={(e) => e.currentTarget.style.opacity = '0.6'}
            >
              ×
            </button>
          </div>

          {/* Image */}
          <div style={{ position: 'relative' }}>
            <img
              src={src}
              alt={alt || ''}
              draggable={false}
              style={{
                display: 'block', width: '100%', height: 'auto',
              }}
            />

            {/* Resize handle */}
            <div
              onMouseDown={handleResizeStart}
              title="Drag to resize"
              style={{
                position: 'absolute', bottom: 0, right: 0,
                width: '18px', height: '18px', cursor: 'nwse-resize',
                display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end',
                padding: '3px', opacity: hovered ? 1 : 0, transition: 'opacity 0.15s',
              }}
            >
              <svg width="9" height="9" viewBox="0 0 8 8" fill="none">
                <path d="M7 1L1 7M7 4L4 7" stroke="rgba(0,0,0,0.5)" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
          </div>
        </div>
      </div>
    </NodeViewWrapper>
  );
}
