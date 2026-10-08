/**
 * A thin vertical drag handle between two panels.
 *
 * Between plain panels it is the sole visual border (a 1px centre line) —
 * remove borderRight/borderLeft from adjacent panels.
 * Between rounded cards (`hideLine`) the gap already separates them: the
 * handle is the whole 16px gap (cards keep no margin on that side) with a
 * grip pill centred in it, darker on hover.
 *
 * Props:
 *   onMouseDown  — startDrag from useResizable
 *   inverted     — true for right-side panels (drag left = wider)
 *   hideLine     — card mode: grip pill instead of a full-height line
 */
export default function ResizeDivider({ onMouseDown, inverted = false, hideLine = false }) {
  const rest = hideLine ? 'var(--border)' : 'var(--border-color, rgba(0,0,0,0.1))';
  const hover = hideLine ? 'var(--muted)' : 'rgba(0,0,0,0.18)';
  return (
    <div
      onMouseDown={(e) => onMouseDown(e, inverted)}
      style={{
        width: hideLine ? '16px' : '9px',
        flexShrink: 0,
        cursor: 'col-resize',
        position: 'relative',
        zIndex: 10,
        display: 'flex',
        alignItems: hideLine ? 'center' : 'stretch',
        justifyContent: 'center',
      }}
      onMouseEnter={(e) => { e.currentTarget.querySelector('.rd-line').style.background = hover; }}
      onMouseLeave={(e) => { e.currentTarget.querySelector('.rd-line').style.background = rest; }}
    >
      <div
        className="rd-line"
        style={{
          width: hideLine ? '6px' : '1px',
          height: hideLine ? '48px' : undefined,
          borderRadius: hideLine ? '3px' : undefined,
          background: rest,
          transition: 'background 0.15s',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
