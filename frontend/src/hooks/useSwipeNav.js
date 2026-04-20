import { useRef } from 'react';

// Detects a short, mostly-horizontal swipe and fires onLeft / onRight.
// Thresholds: ≥60px horizontal, horizontal > vertical, completed in <500ms.
export function useSwipeNav({ enabled = true, onLeft, onRight } = {}) {
  const startRef = useRef(null);

  function onTouchStart(e) {
    if (!enabled) return;
    const t = e.touches[0];
    startRef.current = { x: t.clientX, y: t.clientY, time: Date.now() };
  }

  function onTouchEnd(e) {
    if (!enabled || !startRef.current) return;
    const start = startRef.current;
    startRef.current = null;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const dt = Date.now() - start.time;
    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) || dt > 500) return;
    if (dx < 0) onLeft?.();
    else onRight?.();
  }

  return { onTouchStart, onTouchEnd };
}
