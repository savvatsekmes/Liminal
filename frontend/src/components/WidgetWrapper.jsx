import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { WIDGET_LABELS, WIDTH_OPTIONS } from '../hooks/useLayout';

const s = {
  wrapper: {
    position: 'relative',
    transition: 'transform 200ms ease',
    minWidth: 0,
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
  },
  wrapperEdit: {
    border: '1.5px dashed var(--border)',
    borderRadius: '18px',
    padding: '4px',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '4px',
    padding: '2px 6px',
  },
  dragHandle: {
    cursor: 'grab',
    color: 'var(--muted)',
    fontSize: '14px',
    padding: '2px 4px',
    userSelect: 'none',
    lineHeight: 1,
    display: 'flex',
    alignItems: 'center',
    touchAction: 'none',
  },
  widgetName: {
    fontSize: '10px',
    fontWeight: '600',
    color: 'var(--muted)',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    flex: 1,
  },
  sizeBtn: {
    fontSize: '11px',
    fontWeight: '700',
    color: 'var(--strong)',
    background: 'var(--near-white)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    width: '22px',
    height: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    lineHeight: 1,
    padding: 0,
  },
  sizeBtnDisabled: {
    opacity: 0.3,
    cursor: 'default',
  },
  sizeLabel: {
    fontSize: '10px',
    fontWeight: '600',
    color: 'var(--muted)',
    minWidth: '28px',
    textAlign: 'center',
  },
  removeBtn: {
    fontSize: '14px',
    color: 'var(--muted)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '2px 6px',
    lineHeight: 1,
  },
};

export default function WidgetWrapper({ id, editMode, isLiminalDefault, width, onRemove, onShrink, onGrow, children }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: !editMode || isLiminalDefault });

  // Strip scale from dnd-kit transform to prevent widgets from resizing during drag
  const cleanTransform = transform ? { ...transform, scaleX: 1, scaleY: 1 } : transform;

  const currentWidth = width || 100;
  // Parent is a 10-column CSS grid, so widths map directly to column spans:
  // 20%→2, 30%→3, 40%→4, 50%→5, 60%→6, 70%→7, 80%→8, 100%→10. Grid `gap`
  // is built into the track sizing, so any combination of widths summing to
  // 100% (e.g. 30+40+30) lays out cleanly without overflow.
  const colSpan = Math.max(1, Math.round(currentWidth / 10));

  const isMin = currentWidth <= WIDTH_OPTIONS[0];
  const isMax = currentWidth >= WIDTH_OPTIONS[WIDTH_OPTIONS.length - 1];

  const style = {
    ...s.wrapper,
    ...(editMode ? s.wrapperEdit : {}),
    transform: CSS.Transform.toString(cleanTransform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 'auto',
    gridColumn: `span ${colSpan}`,
  };

  if (!editMode) {
    return <div style={{ gridColumn: `span ${colSpan}`, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>{children}</div>;
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <div style={s.controls}>
        {!isLiminalDefault && (
          <span style={s.dragHandle} {...listeners} title="Drag to reorder">⠿</span>
        )}
        <span style={s.widgetName}>{WIDGET_LABELS[id] || id}</span>
        {!isLiminalDefault && (
          <>
            <button
              style={{ ...s.sizeBtn, ...(isMin ? s.sizeBtnDisabled : {}) }}
              onClick={() => !isMin && onShrink(id)}
              title="Smaller"
              disabled={isMin}
            >‹</button>
            <span style={s.sizeLabel}>{currentWidth}%</span>
            <button
              style={{ ...s.sizeBtn, ...(isMax ? s.sizeBtnDisabled : {}) }}
              onClick={() => !isMax && onGrow(id)}
              title="Larger"
              disabled={isMax}
            >›</button>
          </>
        )}
        {!isLiminalDefault && (
          <button style={s.removeBtn} onClick={() => onRemove(id)} title="Remove section">✕</button>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>{children}</div>
    </div>
  );
}
