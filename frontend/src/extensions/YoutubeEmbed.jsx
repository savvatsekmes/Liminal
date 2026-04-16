import { Node, mergeAttributes, nodePasteRule } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { apiFetch } from '../utils/api';

// ── Video ID extraction ──────────────────────────────────────────────────────

export function extractYoutubeId(url) {
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  return match ? match[1] : null;
}

const YOUTUBE_URL_REGEX =
  /https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})[^\s]*/g;

// ── TipTap Node ──────────────────────────────────────────────────────────────

export const YoutubeEmbed = Node.create({
  name: 'youtubeEmbed',
  group: 'block',
  atom: true,
  selectable: false,
  isolating: true,
  draggable: true,

  addAttributes() {
    return {
      videoId: { default: null },
      title:   { default: '' },
      width:   { default: '100%' },
    };
  },

  parseHTML() {
    return [{
      tag: 'div[data-youtube-embed]',
      getAttrs: (dom) => ({
        videoId: dom.getAttribute('data-video-id') || null,
        title:   dom.getAttribute('data-title') || '',
        width:   dom.getAttribute('data-width') || '100%',
      }),
    }];
  },

  renderHTML({ node }) {
    return ['div', mergeAttributes({
      'data-youtube-embed': '',
      'data-video-id': node.attrs.videoId || '',
      'data-title':    node.attrs.title || '',
      'data-width':    node.attrs.width || '100%',
    })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(YoutubeEmbedView);
  },

  addPasteRules() {
    return [
      nodePasteRule({
        find: YOUTUBE_URL_REGEX,
        type: this.type,
        getAttributes: (match) => ({
          videoId: extractYoutubeId(match[0]),
          title: '',
          width: '100%',
        }),
      }),
    ];
  },
});

// ── React NodeView ───────────────────────────────────────────────────────────

function YoutubeEmbedView({ node, updateAttributes, deleteNode }) {
  const { videoId, title, width } = node.attrs;
  const [status, setStatus] = useState('idle'); // idle | loading | done | no-captions | error
  const outerRef = useRef(null);

  const fetchTranscript = () => {
    if (!videoId || status === 'loading') return;
    setStatus('loading');
    apiFetch('/api/youtube/embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.title) updateAttributes({ title: data.title });
        setStatus(data.hadCaptions ? 'done' : 'no-captions');
      })
      .catch(() => setStatus('error'));
  };

  useEffect(() => { fetchTranscript(); }, [videoId]);

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

  const statusLabel = {
    loading:       'Fetching transcript…',
    done:          '✓ Transcript saved',
    'no-captions': 'No captions',
    error:         '',
  }[status] || '';

  return (
    <NodeViewWrapper
      data-youtube-embed=""
      data-video-id={videoId || ''}
      data-title={title || ''}
      data-width={width || '100%'}
      style={{ display: 'block' }}
    >
      <div
        ref={outerRef}
        contentEditable={false}
        style={{
          width: width || '100%',
          maxWidth: '100%',
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
            {/* Drag handle */}
            <span
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

            {/* Title */}
            <span style={{
              flex: 1,
              fontWeight: 500,
              color: 'var(--body)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {title || `youtube.com/watch?v=${videoId}`}
            </span>

            {/* Transcript status */}
            {statusLabel && (
              <span
                style={{
                  flexShrink: 0,
                  color: status === 'done' ? 'var(--body)' : 'var(--muted)',
                  cursor: status === 'no-captions' ? 'pointer' : 'default',
                }}
                title={status === 'no-captions' ? 'Click to retry' : undefined}
                onClick={status === 'no-captions' ? fetchTranscript : undefined}
              >
                {statusLabel}
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

          {/* 16:9 iframe */}
          <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0 }}>
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${videoId}`}
              title={title || 'YouTube video'}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>

        {/* Resize handle — bottom-right corner */}
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
