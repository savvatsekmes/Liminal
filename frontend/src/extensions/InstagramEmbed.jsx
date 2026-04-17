import { Node, mergeAttributes, nodePasteRule } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import { useRef, useState, useCallback, useEffect } from 'react';
import { NodeSelection } from '@tiptap/pm/state';

// ── URL extraction ──────────────────────────────────────────────────────────

export function extractInstagramUrl(url) {
  const match = url.match(
    /https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/
  );
  return match ? match[0].split('?')[0] : null;
}

const INSTAGRAM_URL_REGEX =
  /https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel|tv)\/[A-Za-z0-9_-]+[^\s]*/g;

// ── TipTap Node ─────────────────────────────────────────────────────────────

export const InstagramEmbed = Node.create({
  name: 'instagramEmbed',
  group: 'block',
  atom: true,
  selectable: false,
  isolating: true,
  draggable: true,

  addAttributes() {
    return {
      url:   { default: null },
      width: { default: '100%' },
    };
  },

  parseHTML() {
    return [{
      tag: 'div[data-instagram-embed]',
      getAttrs: (dom) => ({
        url:   dom.getAttribute('data-url') || null,
        width: dom.getAttribute('data-width') || '100%',
      }),
    }];
  },

  renderHTML({ node }) {
    return ['div', mergeAttributes({
      'data-instagram-embed': '',
      'data-url':   node.attrs.url || '',
      'data-width': node.attrs.width || '100%',
    })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(InstagramEmbedView);
  },

  addPasteRules() {
    return [
      nodePasteRule({
        find: INSTAGRAM_URL_REGEX,
        type: this.type,
        getAttributes: (match) => ({
          url: extractInstagramUrl(match[0]) || match[0],
          width: '100%',
        }),
      }),
    ];
  },
});

// ── React NodeView ──────────────────────────────────────────────────────────

function parseInstagramUrl(url) {
  if (!url) return { type: 'post', shortcode: '' };
  const m = url.match(/instagram\.com\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
  return m ? { type: m[1] === 'p' ? 'post' : m[1], shortcode: m[2] } : { type: 'post', shortcode: '' };
}

function InstagramEmbedView({ node, updateAttributes, deleteNode, editor, getPos }) {
  const { url, width } = node.attrs;
  const outerRef = useRef(null);
  const dragRef = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

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
  const { type, shortcode } = parseInstagramUrl(url);

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
      const newPx = Math.max(220, Math.min(parentWidth, startWidth + delta));
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

  const openExternal = () => {
    if (!url) return;
    window.open(url, '_blank', 'noopener');
  };

  const typeLabel = type === 'reel' ? 'Reel' : type === 'tv' ? 'IGTV' : 'Post';
  const embedSrc = url ? `${url.replace(/\/$/, '')}/embed/captioned/` : '';

  return (
    <NodeViewWrapper
      data-instagram-embed=""
      data-url={url || ''}
      data-width={width || '100%'}
      style={{ display: 'block' }}
    >
      <div
        ref={outerRef}
        contentEditable={false}
        style={{
          width: width || '100%',
          maxWidth: '540px',
          margin: '16px 0',
          position: 'relative',
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

            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
              <rect x="2" y="2" width="20" height="20" rx="5" stroke="currentColor" strokeWidth="2"/>
              <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="2"/>
              <circle cx="17.5" cy="6.5" r="1.5" fill="currentColor"/>
            </svg>

            <span style={{
              flex: 1,
              fontWeight: 500,
              color: 'var(--body)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              cursor: 'pointer',
            }} onClick={openExternal} title="Open in Instagram">
              Instagram {typeLabel}
            </span>

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

          {/* Iframe embed — Instagram allows framing from any origin */}
          {!errored ? (
            <div style={{ position: 'relative', minHeight: loaded ? 0 : '480px' }}>
              {!loaded && (
                <div style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--muted)', fontSize: '12px',
                }}>
                  Loading Instagram {typeLabel.toLowerCase()}…
                </div>
              )}
              <iframe
                src={embedSrc}
                title={`Instagram ${typeLabel}`}
                onLoad={() => setLoaded(true)}
                onError={() => setErrored(true)}
                style={{
                  width: '100%',
                  minHeight: '480px',
                  border: 'none',
                  display: 'block',
                  opacity: loaded ? 1 : 0,
                  transition: 'opacity 0.2s',
                }}
                referrerPolicy="no-referrer"
                allow="encrypted-media"
                allowFullScreen
              />
            </div>
          ) : (
            /* Fallback link card if iframe fails */
            <div
              onClick={openExternal}
              style={{
                padding: '20px 16px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
                <defs>
                  <linearGradient id="ig-grad" x1="0" y1="24" x2="24" y2="0">
                    <stop offset="0%" stopColor="#FFDC80"/>
                    <stop offset="25%" stopColor="#F77737"/>
                    <stop offset="50%" stopColor="#E1306C"/>
                    <stop offset="75%" stopColor="#C13584"/>
                    <stop offset="100%" stopColor="#833AB4"/>
                  </linearGradient>
                </defs>
                <rect x="2" y="2" width="20" height="20" rx="5" stroke="url(#ig-grad)" strokeWidth="2"/>
                <circle cx="12" cy="12" r="5" stroke="url(#ig-grad)" strokeWidth="2"/>
                <circle cx="17.5" cy="6.5" r="1.5" fill="url(#ig-grad)"/>
              </svg>
              <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                Open in Instagram
              </span>
            </div>
          )}
        </div>

        {/* Resize handle */}
        <div
          onMouseDown={handleResizeStart}
          title="Drag to resize"
          style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: '14px',
            height: '14px',
            cursor: 'nwse-resize',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'flex-end',
            padding: '2px',
          }}
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <path d="M7 1L1 7M7 4L4 7" stroke="var(--muted)" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
        </div>
      </div>
    </NodeViewWrapper>
  );
}
