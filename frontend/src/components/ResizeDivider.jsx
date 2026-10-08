/**
 * Thin vertical drag handle between two panels.
 *
 * Props:
 *   onMouseDown  — startDrag from useResizable
 *   inverted     — true for right-side panels (drag left = wider)
 */
/**
 * A thin vertical drag handle between two panels.
 * It acts as the sole visual border — remove borderRight/borderLeft from adjacent panels.
 *
 * Props:
 *   onMouseDown  — startDrag from useResizable
 *   inverted     — true for right-side panels (drag left = wider)
 */
// hideLine: between rounded cards the gap itself separates the panels, so the
// 1px line only appears while hovering (to show it can be dragged).
export default function ResizeDivider({ onMouseDown, inverted = false, hideLine = false }) {
  const restColor = hideLine ? 'transparent' : 'var(--border-color, rgba(0,0,0,0.1))';
  return (
    <div
      onMouseDown={(e) => onMouseDown(e, inverted)}
      style={{
        width: '9px',
        flexShrink: 0,
        cursor: 'col-resize',
        position: 'relative',
        zIndex: 10,
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'center',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.querySelector('.rd-line').style.background = 'rgba(0,0,0,0.18)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.querySelector('.rd-line').style.background = restColor;
      }}
    >
      {/* Visible 1px centre line */}
      <div
        className="rd-line"
        style={{
          width: '1px',
          background: restColor,
          transition: 'background 0.15s',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
