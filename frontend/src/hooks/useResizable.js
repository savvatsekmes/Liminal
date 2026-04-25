import { useRef, useState, useCallback } from 'react';

/**
 * Drag-to-resize hook.
 * @param {number} defaultWidth  Initial width in px
 * @param {{ min?: number, max?: number }} opts
 * @returns {[number, function]} [width, startDrag]
 *
 * startDrag(e, inverted?)
 *   inverted=false → right-edge handle, drag right = wider  (left panels)
 *   inverted=true  → left-edge handle,  drag left  = wider  (right panels)
 */
export function useResizable(defaultWidth, { min = 120, max = 800 } = {}) {
  const [width, setWidth] = useState(defaultWidth);
  const widthRef = useRef(defaultWidth);

  const startDrag = useCallback(
    (e, inverted = false) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = widthRef.current;

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      function onMove(evt) {
        const delta = inverted ? startX - evt.clientX : evt.clientX - startX;
        const next = Math.max(min, Math.min(max, startW + delta));
        widthRef.current = next;
        setWidth(next);
      }

      function onUp() {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      }

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [min, max],
  );

  // Imperative setter — used to sync the initial width to the actual measured
  // container width (window.innerWidth often differs from page width by the
  // sidebar/strip, throwing a 50/50 default off by N pixels).
  const setExplicit = useCallback((n) => {
    widthRef.current = n;
    setWidth(n);
  }, []);

  return [width, startDrag, setExplicit];
}
