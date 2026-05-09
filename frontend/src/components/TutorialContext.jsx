// Guided-tour overlay. A single React provider mounts once near the top of
// the authed app tree, exposes useTutorial() for any descendant to call
// startTour(id), and renders a soft-spotlight + tooltip pair when active.
//
// The spotlight effect is pure CSS, a fixed-position div sized to the
// target's bounding rect with a giant outset box-shadow that paints the
// surrounding area with a translucent black backdrop.
//
// Tour content lives in frontend/src/data/tutorials.js.
// Server state (which tours have been completed) lives on
// users.tutorials_seen, fetched/written via /api/auth/me +
// /api/auth/tutorial-seen + /api/auth/tutorial-reset.

import { createContext, useContext, useEffect, useLayoutEffect, useState, useCallback, useRef } from 'react';
import { apiFetch } from '../utils/api';
import { TOURS, TOUR_HOST } from '../data/tutorials';
import { useLanguage } from '../i18n/LanguageContext';

const TutorialContext = createContext(null);

export function useTutorial() {
  const ctx = useContext(TutorialContext);
  if (!ctx) throw new Error('useTutorial must be used inside <TutorialProvider>');
  return ctx;
}

// First-visit auto-trigger. Page components call this with their tour id;
// it fires startTour(id) only AFTER the seen list has been hydrated from
// /api/auth/me, so we don't false-fire during the brief window where the
// page mounts before the auth round-trip completes. Also skips if a tour
// is already active (no stacking).
export function useFirstTourTrigger(id) {
  const { seen, hydrated, startTour, isActive } = useTutorial();
  useEffect(() => {
    if (!id) return;
    if (!hydrated) return;
    if (seen.includes(id)) return;
    if (isActive) return;
    const t = setTimeout(() => startTour(id), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, hydrated, seen]);
}

export function TutorialProvider({ initialSeen = [], hydrated = false, children }) {
  const [seen, setSeen] = useState(initialSeen);
  const [tourId, setTourId] = useState(null);
  const [step, setStep] = useState(0);
  // Track current page via the global view-change event dispatched from
  // App.jsx whenever the user navigates. Used below to auto-close a tour
  // when the user leaves its host page.
  const currentPageRef = useRef(null);
  useEffect(() => { setSeen(initialSeen); }, [initialSeen]);

  useEffect(() => {
    function onViewChanged(e) {
      const next = e.detail;
      currentPageRef.current = next;
      // If a tour is running and the user navigated away from its host
      // page, dismiss the overlay (do NOT mark seen — they can come back).
      if (!tourId) return;
      const expectedHost = TOUR_HOST[tourId];
      if (!expectedHost) return;
      if (next !== expectedHost) {
        window.dispatchEvent(new CustomEvent('liminal:tutorial-closed', { detail: tourId }));
        setTourId(null);
        setStep(0);
      }
    }
    window.addEventListener('liminal:view-changed', onViewChanged);
    return () => window.removeEventListener('liminal:view-changed', onViewChanged);
  }, [tourId]);

  const persistSeen = useCallback((id) => {
    setSeen((prev) => (prev.includes(id) ? prev : [...prev, id]));
    apiFetch('/api/auth/tutorial-seen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  }, []);

  const resetTour = useCallback((id) => {
    setSeen((prev) => (id === 'all' ? [] : prev.filter((x) => x !== id)));
    apiFetch('/api/auth/tutorial-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  }, []);

  const startTour = useCallback((id) => {
    if (!TOURS[id] || !TOURS[id].length) return;
    setTourId(id);
    setStep(0);
  }, []);

  const closeTour = useCallback(({ markSeen = true } = {}) => {
    if (markSeen && tourId) persistSeen(tourId);
    window.dispatchEvent(new CustomEvent('liminal:tutorial-closed', { detail: tourId }));
    setTourId(null);
    setStep(0);
  }, [tourId, persistSeen]);

  const nextStep = useCallback(() => {
    if (!tourId) return;
    const tour = TOURS[tourId] || [];
    if (step + 1 >= tour.length) {
      closeTour({ markSeen: true });
    } else {
      setStep((s) => s + 1);
    }
  }, [tourId, step, closeTour]);

  const prevStep = useCallback(() => {
    setStep((s) => Math.max(0, s - 1));
  }, []);

  const value = {
    isActive: !!tourId,
    tourId,
    step,
    seen,
    hydrated,
    startTour,
    closeTour,
    nextStep,
    prevStep,
    resetTour,
  };

  return (
    <TutorialContext.Provider value={value}>
      {children}
      {tourId && <TutorialOverlay tourId={tourId} step={step} onNext={nextStep} onPrev={prevStep} onClose={() => closeTour({ markSeen: true })} />}
    </TutorialContext.Provider>
  );
}

const SPOTLIGHT_PADDING_DEFAULT = 8;

function findVisibleTarget(targetId) {
  if (!targetId) return null;
  const candidates = document.querySelectorAll(`[data-tour-id="${targetId}"]`);
  for (const el of candidates) {
    if (el.offsetParent !== null) return el;
  }
  return candidates[0] || null;
}

function TutorialOverlay({ tourId, step, onNext, onPrev, onClose }) {
  const { t } = useLanguage();
  const tour = TOURS[tourId] || [];
  const stepData = tour[step];
  const [rect, setRect] = useState(null);
  // Measured tooltip height — long bodies (especially after i18n into more
  // verbose languages) overflow the hardcoded 180 default, so steps with
  // long copy got cut off near the bottom of the viewport. Default 180 for
  // the very first paint, then useLayoutEffect below replaces it with the
  // real height before the browser commits the frame.
  const [tooltipH, setTooltipH] = useState(180);
  const tooltipRef = useRef(null);

  useEffect(() => {
    if (!stepData) return;
    let raf = 0;
    if (stepData.before && stepData.before.event) {
      window.dispatchEvent(new CustomEvent(stepData.before.event, { detail: stepData.before.detail }));
    }
    function update() {
      const el = findVisibleTarget(stepData.targetId);
      if (!el) {
        console.warn(`[tutorial] target not found: ${stepData.targetId}`);
        setRect(null);
        const t = setTimeout(onNext, 100);
        return () => clearTimeout(t);
      }
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    }
    function schedule() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    }
    const initial = stepData.before ? setTimeout(update, 60) : (update(), null);
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    return () => {
      if (initial) clearTimeout(initial);
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
    };
  }, [stepData, onNext]);

  useLayoutEffect(() => {
    if (!tooltipRef.current) return;
    const h = tooltipRef.current.offsetHeight;
    if (h && Math.abs(h - tooltipH) > 2) setTooltipH(h);
  });

  if (!stepData || !rect) return null;

  const padding = stepData.padding ?? SPOTLIGHT_PADDING_DEFAULT;
  const spot = {
    top: rect.top - padding,
    left: rect.left - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
  const tooltip = computeTooltipPosition(spot, stepData.placement || 'auto', tooltipH);
  const isLast = step >= tour.length - 1;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 5000, pointerEvents: 'none' }}>
      <div
        style={{
          position: 'fixed',
          top: spot.top,
          left: spot.left,
          width: spot.width,
          height: spot.height,
          borderRadius: '12px',
          boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
          transition: 'top 0.25s ease, left 0.25s ease, width 0.25s ease, height 0.25s ease',
          pointerEvents: 'none',
        }}
      />
      <div
        ref={tooltipRef}
        style={{
          position: 'fixed',
          top: tooltip.top,
          left: tooltip.left,
          maxWidth: '340px',
          background: 'var(--white)',
          color: 'var(--body)',
          border: 'var(--border-style)',
          borderRadius: '14px',
          padding: '18px 20px',
          boxShadow: '0 8px 28px rgba(0,0,0,0.22)',
          fontFamily: 'var(--font)',
          pointerEvents: 'auto',
          zIndex: 5001,
        }}
      >
        <div style={{ fontSize: '11px', color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '6px' }}>
          {step + 1} / {tour.length}
        </div>
        <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--strong)', marginBottom: '8px', lineHeight: 1.3 }}>
          {t(stepData.titleKey)}
        </div>
        <div style={{ fontSize: '13px', lineHeight: 1.6, marginBottom: '16px' }}>
          {t(stepData.bodyKey)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={onClose}
            style={{
              fontSize: '11px',
              color: 'var(--muted)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '6px 8px',
              fontFamily: 'var(--font)',
            }}
          >
            {t('tutorials.skip')}
          </button>
          <div style={{ flex: 1 }} />
          {step > 0 && (
            <button
              onClick={onPrev}
              style={{
                fontSize: '12px',
                color: 'var(--strong)',
                background: 'transparent',
                border: 'var(--border-style)',
                borderRadius: '999px',
                cursor: 'pointer',
                padding: '6px 14px',
                fontFamily: 'var(--font)',
              }}
            >
              {t('tutorials.back')}
            </button>
          )}
          <button
            onClick={onNext}
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--white)',
              background: 'var(--strong)',
              border: 'none',
              borderRadius: '999px',
              cursor: 'pointer',
              padding: '7px 16px',
              fontFamily: 'var(--font)',
            }}
          >
            {isLast ? t('tutorials.finish') : t('tutorials.next')}
          </button>
        </div>
      </div>
    </div>
  );
}

function computeTooltipPosition(spot, placement, tooltipH = 180) {
  const TOOLTIP_W = 340;
  const TOOLTIP_H = tooltipH;
  const GAP = 14;
  const VW = window.innerWidth;
  const VH = window.innerHeight;

  function place(side) {
    if (side === 'top') {
      return {
        top: Math.max(12, spot.top - TOOLTIP_H - GAP),
        left: clamp(spot.left + spot.width / 2 - TOOLTIP_W / 2, 12, VW - TOOLTIP_W - 12),
      };
    }
    if (side === 'bottom') {
      return {
        top: Math.min(VH - TOOLTIP_H - 12, spot.top + spot.height + GAP),
        left: clamp(spot.left + spot.width / 2 - TOOLTIP_W / 2, 12, VW - TOOLTIP_W - 12),
      };
    }
    if (side === 'left') {
      return {
        top: clamp(spot.top + spot.height / 2 - TOOLTIP_H / 2, 12, VH - TOOLTIP_H - 12),
        left: Math.max(12, spot.left - TOOLTIP_W - GAP),
      };
    }
    return {
      top: clamp(spot.top + spot.height / 2 - TOOLTIP_H / 2, 12, VH - TOOLTIP_H - 12),
      left: Math.min(VW - TOOLTIP_W - 12, spot.left + spot.width + GAP),
    };
  }

  if (placement && placement !== 'auto') return place(placement);

  const room = {
    top: spot.top,
    bottom: VH - (spot.top + spot.height),
    left: spot.left,
    right: VW - (spot.left + spot.width),
  };
  const best = Object.entries(room).sort((a, b) => b[1] - a[1])[0][0];
  return place(best);
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
