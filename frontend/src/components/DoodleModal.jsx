import { useState, useRef, useEffect, useCallback } from 'react';
import { useLanguage } from '../i18n/LanguageContext';

const CANVAS_W = 600;
const CANVAS_H = 400;

const TOOLS = ['pen', 'line', 'rect', 'ellipse', 'text', 'eraser'];
const COLORS = ['#000000', '#ffffff', '#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa', '#6d4c41', '#546e7a'];
const SIZES = [1, 2, 4, 6, 10];

const s = {
  overlay: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0,0,0,0.35)',
    zIndex: 200,
  },
  modal: {
    width: '700px',
    maxWidth: '96vw',
    maxHeight: '92vh',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--white)',
    border: 'var(--border-style)',
    borderRadius: '4px',
    boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 20px',
    borderBottom: 'var(--border-style)',
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--strong)',
  },
  closeBtn: {
    fontSize: '11px',
    color: 'var(--muted)',
    background: 'none',
    border: 'var(--border-style)',
    borderRadius: '2px',
    padding: '2px 8px',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '8px 20px',
    borderBottom: 'var(--border-style)',
    flexWrap: 'wrap',
    flexShrink: 0,
  },
  toolBtn: {
    width: '30px',
    height: '30px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '3px',
    border: 'var(--border-style)',
    background: 'var(--white)',
    cursor: 'pointer',
    fontSize: '13px',
    color: 'var(--body)',
    fontFamily: 'var(--font)',
    transition: 'background 0.1s, color 0.1s',
    padding: 0,
  },
  toolBtnActive: {
    background: 'var(--strong)',
    color: 'var(--white)',
    borderColor: 'var(--strong)',
  },
  divider: {
    width: '1px',
    height: '20px',
    background: 'var(--border)',
    margin: '0 4px',
  },
  colorBtn: {
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    border: '2px solid transparent',
    cursor: 'pointer',
    padding: 0,
    transition: 'border-color 0.1s',
  },
  sizeBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '26px',
    height: '26px',
    borderRadius: '3px',
    border: 'var(--border-style)',
    background: 'var(--white)',
    cursor: 'pointer',
    padding: 0,
  },
  canvasWrap: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px 20px',
    overflow: 'auto',
    background: 'var(--near-white)',
  },
  canvas: {
    border: 'var(--border-style)',
    borderRadius: '2px',
    cursor: 'crosshair',
    background: '#ffffff',
    maxWidth: '100%',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 20px',
    borderTop: 'var(--border-style)',
    flexShrink: 0,
    gap: '8px',
  },
  actionBtn: {
    padding: '8px 20px',
    fontSize: '12px',
    fontWeight: '500',
    background: 'var(--strong)',
    color: 'var(--white)',
    border: 'none',
    borderRadius: '20px',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    boxShadow: '0 2px 4px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.1)',
  },
  ghostBtn: {
    padding: '6px 14px',
    fontSize: '11px',
    color: 'var(--muted)',
    background: 'none',
    border: 'var(--border-style)',
    borderRadius: '20px',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
  },
};

const TOOL_ICONS = {
  pen: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12L1 13L3 12L12 3L11 2L2 11Z" /><path d="M10 3L11 4" />
    </svg>
  ),
  line: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
      <line x1="2" y1="12" x2="12" y2="2" />
    </svg>
  ),
  rect: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2">
      <rect x="2" y="3" width="10" height="8" rx="0.5" />
    </svg>
  ),
  ellipse: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2">
      <ellipse cx="7" cy="7" rx="5" ry="4" />
    </svg>
  ),
  text: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
      <line x1="3" y1="3" x2="11" y2="3" /><line x1="7" y1="3" x2="7" y2="12" /><line x1="5" y1="12" x2="9" y2="12" />
    </svg>
  ),
  eraser: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12H12" /><path d="M8.5 2.5L12 6L7 11L2 11L1.5 10.5L5.5 6.5Z" />
    </svg>
  ),
};

export default function DoodleModal({ onClose, onInsert }) {
  const { t } = useLanguage();
  const canvasRef = useRef(null);
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('#000000');
  const [lineWidth, setLineWidth] = useState(2);
  const [drawing, setDrawing] = useState(false);
  const [startPos, setStartPos] = useState(null);
  const [history, setHistory] = useState([]);
  const [textInput, setTextInput] = useState(null); // { x, y } when placing text

  // Save canvas snapshot for undo
  const saveSnapshot = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const data = canvas.toDataURL();
    setHistory(prev => [...prev.slice(-30), data]); // keep last 30
  }, []);

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    saveSnapshot();
  }, [saveSnapshot]);

  function getPos(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function handleMouseDown(e) {
    if (textInput) return; // text mode has its own flow
    const pos = getPos(e);
    setDrawing(true);
    setStartPos(pos);

    if (tool === 'text') {
      setTextInput(pos);
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (tool === 'pen' || tool === 'eraser') {
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
      ctx.lineWidth = tool === 'eraser' ? lineWidth * 4 : lineWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }
  }

  function handleMouseMove(e) {
    if (!drawing || textInput) return;
    const pos = getPos(e);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (tool === 'pen' || tool === 'eraser') {
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    } else if (startPos && (tool === 'line' || tool === 'rect' || tool === 'ellipse')) {
      // Redraw from last snapshot for shape preview
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.drawImage(img, 0, 0);
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = 'round';
        drawShape(ctx, startPos, pos);
      };
      if (history.length > 0) {
        img.src = history[history.length - 1];
      }
    }
  }

  function drawShape(ctx, from, to) {
    ctx.beginPath();
    if (tool === 'line') {
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    } else if (tool === 'rect') {
      ctx.strokeRect(from.x, from.y, to.x - from.x, to.y - from.y);
    } else if (tool === 'ellipse') {
      const cx = (from.x + to.x) / 2;
      const cy = (from.y + to.y) / 2;
      const rx = Math.abs(to.x - from.x) / 2;
      const ry = Math.abs(to.y - from.y) / 2;
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function handleMouseUp() {
    if (!drawing) return;
    setDrawing(false);
    setStartPos(null);
    saveSnapshot();
  }

  function handleTextSubmit(text) {
    if (!text || !textInput) { setTextInput(null); return; }
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.font = `${Math.max(14, lineWidth * 5)}px var(--font), sans-serif`;
    ctx.fillStyle = color;
    ctx.textBaseline = 'top';
    ctx.fillText(text, textInput.x, textInput.y);
    setTextInput(null);
    saveSnapshot();
  }

  function handleUndo() {
    if (history.length <= 1) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const prev = history[history.length - 2];
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.drawImage(img, 0, 0);
    };
    img.src = prev;
    setHistory(h => h.slice(0, -1));
  }

  function handleClear() {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    saveSnapshot();
  }

  function handleInsert() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    onInsert(dataUrl);
  }

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={s.header}>
          <span style={s.headerTitle}>{t('doodle.title')}</span>
          <button style={s.closeBtn} onClick={onClose}>{t('cards.close')}</button>
        </div>

        {/* Toolbar */}
        <div style={s.toolbar}>
          {/* Tool buttons */}
          {TOOLS.map(t => (
            <button
              key={t}
              style={{ ...s.toolBtn, ...(tool === t ? s.toolBtnActive : {}) }}
              onClick={() => { setTool(t); setTextInput(null); }}
              title={t.charAt(0).toUpperCase() + t.slice(1)}
            >
              {TOOL_ICONS[t]}
            </button>
          ))}

          <div style={s.divider} />

          {/* Colors */}
          {COLORS.map(c => (
            <button
              key={c}
              style={{
                ...s.colorBtn,
                background: c,
                borderColor: color === c ? 'var(--strong)' : (c === '#ffffff' ? 'var(--border)' : 'transparent'),
              }}
              onClick={() => setColor(c)}
              title={c}
            />
          ))}

          <div style={s.divider} />

          {/* Sizes */}
          {SIZES.map(sz => (
            <button
              key={sz}
              style={{
                ...s.sizeBtn,
                ...(lineWidth === sz ? { borderColor: 'var(--strong)', background: 'var(--near-white)' } : {}),
              }}
              onClick={() => setLineWidth(sz)}
              title={`${sz}px`}
            >
              <span style={{
                display: 'block',
                width: Math.min(sz * 2 + 2, 16),
                height: Math.min(sz * 2 + 2, 16),
                borderRadius: '50%',
                background: 'var(--strong)',
              }} />
            </button>
          ))}
        </div>

        {/* Canvas */}
        <div style={s.canvasWrap}>
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <canvas
              ref={canvasRef}
              width={CANVAS_W}
              height={CANVAS_H}
              style={s.canvas}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            />
            {/* Text input overlay */}
            {textInput && (
              <TextInputOverlay
                x={textInput.x}
                y={textInput.y}
                canvasRef={canvasRef}
                onSubmit={handleTextSubmit}
                onCancel={() => setTextInput(null)}
                color={color}
                fontSize={Math.max(14, lineWidth * 5)}
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={s.footer}>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button style={s.ghostBtn} onClick={handleUndo}>{t('doodle.undo')}</button>
            <button style={s.ghostBtn} onClick={handleClear}>{t('doodle.clear')}</button>
          </div>
          <button style={s.actionBtn} onClick={handleInsert}>{t('doodle.insert')}</button>
        </div>
      </div>
    </div>
  );
}

// ── Text Input Overlay ───────────────────────────────────────────────────────

function TextInputOverlay({ x, y, canvasRef, onSubmit, onCancel, color, fontSize }) {
  const inputRef = useRef(null);
  const [value, setValue] = useState('');

  // Position the input relative to the canvas's displayed size
  const canvas = canvasRef.current;
  const rect = canvas?.getBoundingClientRect();
  const scaleX = rect ? rect.width / CANVAS_W : 1;
  const scaleY = rect ? rect.height / CANVAS_H : 1;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      onSubmit(value);
    } else if (e.key === 'Escape') {
      onCancel();
    }
  }

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={e => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={() => onSubmit(value)}
      style={{
        position: 'absolute',
        left: x * scaleX,
        top: y * scaleY,
        fontSize: fontSize * scaleX,
        fontFamily: 'var(--font), sans-serif',
        color,
        background: 'transparent',
        border: '1px dashed var(--muted)',
        borderRadius: '2px',
        outline: 'none',
        padding: '2px 4px',
        minWidth: '60px',
        zIndex: 10,
      }}
      placeholder="Type..."
    />
  );
}
