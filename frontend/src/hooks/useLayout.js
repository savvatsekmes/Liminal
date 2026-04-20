import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../utils/api';

// Widget registry
export const WIDGETS = {
  QUOTE:      'quote',
  MOON:       'moon',
  TAROT:      'tarot',
  PULSE:      'pulse',
  STATS:      'stats',
  PORTRAIT:   'portrait',
  INSIGHT:    'insight',
  THEMES:     'themes',
  RHYTHM:     'rhythm',
  GOALS:      'goals',
  WEATHER:      'weather',
  SKY:          'sky',
  GRATITUDE:    'gratitude',
  DREAMS:       'dreams',
  READING:      'reading',
  BUCKET:       'bucket',
  AFFIRMATIONS: 'affirmations',
  QUESTIONS:    'questions',
  LOOKBACK:     'lookback',
  THREADS:      'threads',
};

export const ALL_WIDGET_IDS = Object.values(WIDGETS);

export const WIDGET_LABELS = {
  quote:      'Daily Quote',
  moon:       'Moon Phase',
  tarot:      'Daily Card',
  pulse:      'Pulse',
  stats:      'Journal / Notes / Conversations',
  portrait:   'Your Portrait',
  insight:    'Insight',
  themes:     'Recurring Themes',
  rhythm:     'Your Rhythm',
  goals:      'Top Goals',
  weather:      'Weather',
  sky:          "Today's Sky",
  gratitude:    'Gratitude',
  dreams:       'Dreams',
  reading:      'Reading List',
  bucket:       'Bucket List',
  affirmations: 'Affirmations',
  questions:    'Open Questions',
  lookback:     'Look Back',
  threads:      'Threads',
};

// Width options as percentages (mapped to grid column spans out of 10)
export const WIDTH_OPTIONS = [20, 30, 40, 50, 60, 70, 80, 100];

// Widget default widths (percentage)
export const WIDGET_WIDTHS = {
  quote:    { default: 100 },
  moon:     { default: 50 },
  tarot:    { default: 50 },
  pulse:    { default: 100 },
  stats:    { default: 100 },
  portrait: { default: 100 },
  insight:  { default: 100 },
  themes:   { default: 50 },
  rhythm:   { default: 50 },
  goals:    { default: 50 },
  weather:      { default: 30 },
  sky:          { default: 50 },
  gratitude:    { default: 50 },
  dreams:       { default: 50 },
  reading:      { default: 50 },
  bucket:       { default: 50 },
  affirmations: { default: 50 },
  questions:    { default: 50 },
  lookback:     { default: 50 },
  threads:      { default: 50 },
};

// Default Liminal layout — hardcoded, never stored in DB
export const LIMINAL_LAYOUT = [
  { id: 'quote', width: 100 },
  { id: 'moon', width: 40 },
  { id: 'tarot', width: 60 },
  { id: 'pulse', width: 100 },
  { id: 'stats', width: 60 },
  { id: 'portrait', width: 40 },
  { id: 'insight', width: 100 },
  { id: 'themes', width: 40 },
  { id: 'rhythm', width: 60 },
];

// Mobile uses a single layout persisted locally — separate from the
// backend-synced desktop layouts so the two can be tuned independently.
const MOBILE_STORAGE_KEY = 'liminal_mobile_layout';
const MOBILE_DEFAULT = [
  { id: 'quote', width: 100 },
  { id: 'moon', width: 100 },
  { id: 'tarot', width: 100 },
  { id: 'pulse', width: 100 },
  { id: 'stats', width: 100 },
  { id: 'portrait', width: 100 },
  { id: 'insight', width: 100 },
];

function loadMobileLayout() {
  try {
    const raw = localStorage.getItem(MOBILE_STORAGE_KEY);
    if (!raw) return MOBILE_DEFAULT;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return MOBILE_DEFAULT;
    return parsed.map(item => {
      if (typeof item === 'string') return { id: item, width: 100 };
      return { id: item.id, width: 100 };
    });
  } catch {
    return MOBILE_DEFAULT;
  }
}

export function useLayout(isMobile = false) {
  const [savedLayouts, setSavedLayouts] = useState([]);
  const [activeLayoutId, setActiveLayoutId] = useState(null); // null = Liminal default
  const [desktopLayout, setDesktopLayout] = useState(LIMINAL_LAYOUT);
  const [mobileLayout, setMobileLayout] = useState(() => loadMobileLayout());
  const [editMode, setEditModeRaw] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // When on mobile, current layout is the locally-stored mobile layout.
  const currentLayout = isMobile ? mobileLayout : desktopLayout;
  const setCurrentLayout = isMobile
    ? (updater) => setMobileLayout(prev => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        try { localStorage.setItem(MOBILE_STORAGE_KEY, JSON.stringify(next)); } catch {}
        return next;
      })
    : setDesktopLayout;

  // Entering edit mode on Liminal default clones into custom (unsaved)
  const setEditMode = useCallback((on) => {
    if (on && !isMobile && activeLayoutId === null && !dirty) {
      // Clone Liminal default into custom unsaved (desktop only)
      setDirty(true);
      apiFetch('/api/layouts/deactivate', { method: 'PUT' }).catch(() => {});
    }
    setEditModeRaw(on);
  }, [activeLayoutId, dirty, isMobile]);

  // Load saved layouts from API — desktop only. Mobile uses localStorage.
  useEffect(() => {
    if (isMobile) { setLoaded(true); return; }
    apiFetch('/api/layouts').then(r => r.json()).then(layouts => {
      setSavedLayouts(layouts);
      const active = layouts.find(l => l.is_active);
      if (active) {
        setActiveLayoutId(active.id);
        setDesktopLayout(normalizeWidgetOrder(active.widget_order));
      }
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [isMobile]);

  // Normalize widget_order: ensure each item is { id, width }
  function normalizeWidgetOrder(order) {
    if (!Array.isArray(order)) return LIMINAL_LAYOUT;
    return order.map(item => {
      if (typeof item === 'string') return { id: item, width: WIDGET_WIDTHS[item]?.default || 100 };
      // Migrate old 1/2 column widths to percentages
      if (item.width === 1) return { ...item, width: 50 };
      if (item.width === 2) return { ...item, width: 100 };
      return item;
    });
  }

  // Switch to a saved layout
  const selectLayout = useCallback((layoutId) => {
    if (layoutId === null) {
      // Liminal default
      setActiveLayoutId(null);
      setCurrentLayout(LIMINAL_LAYOUT);
      setDirty(false);
      apiFetch('/api/layouts/deactivate', { method: 'PUT' }).catch(() => {});
    } else if (layoutId === 'custom') {
      // Switch to custom unsaved mode, keep current layout
      setActiveLayoutId(null);
      setDirty(true);
      apiFetch('/api/layouts/deactivate', { method: 'PUT' }).catch(() => {});
    } else {
      const layout = savedLayouts.find(l => l.id === layoutId);
      if (layout) {
        setActiveLayoutId(layoutId);
        setCurrentLayout(normalizeWidgetOrder(layout.widget_order));
        setDirty(false);
        apiFetch(`/api/layouts/${layoutId}/activate`, { method: 'PUT' }).catch(() => {});
      }
    }
  }, [savedLayouts]);

  // Reorder widgets
  const reorderWidgets = useCallback((newOrder) => {
    setCurrentLayout(newOrder);
    setDirty(true);
  }, []);

  // Remove a widget
  const removeWidget = useCallback((widgetId) => {
    setCurrentLayout(prev => prev.filter(w => w.id !== widgetId));
    setDirty(true);
  }, []);

  // Add a widget
  const addWidget = useCallback((widgetId) => {
    setCurrentLayout(prev => {
      if (prev.some(w => w.id === widgetId)) return prev;
      const width = WIDGET_WIDTHS[widgetId]?.default || 100;
      return [...prev, { id: widgetId, width }];
    });
    setDirty(true);
  }, []);

  // Shrink widget width to next smaller option
  const shrinkWidget = useCallback((widgetId) => {
    setCurrentLayout(prev => prev.map(w => {
      if (w.id !== widgetId) return w;
      const current = w.width || WIDGET_WIDTHS[widgetId]?.default || 100;
      const idx = WIDTH_OPTIONS.indexOf(current);
      if (idx <= 0) return w;
      return { ...w, width: WIDTH_OPTIONS[idx - 1] };
    }));
    setDirty(true);
  }, []);

  // Grow widget width to next larger option
  const growWidget = useCallback((widgetId) => {
    setCurrentLayout(prev => prev.map(w => {
      if (w.id !== widgetId) return w;
      const current = w.width || WIDGET_WIDTHS[widgetId]?.default || 100;
      const idx = WIDTH_OPTIONS.indexOf(current);
      if (idx === -1 || idx >= WIDTH_OPTIONS.length - 1) return w;
      return { ...w, width: WIDTH_OPTIONS[idx + 1] };
    }));
    setDirty(true);
  }, []);

  // Save current layout as new or update existing
  const saveLayout = useCallback(async (name) => {
    if (activeLayoutId && savedLayouts.find(l => l.id === activeLayoutId)) {
      // Update existing
      const res = await apiFetch(`/api/layouts/${activeLayoutId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, widget_order: currentLayout }),
      });
      const updated = await res.json();
      setSavedLayouts(prev => prev.map(l => l.id === updated.id ? updated : l));
      setDirty(false);
      return updated;
    } else {
      // Create new
      const res = await apiFetch('/api/layouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, widget_order: currentLayout }),
      });
      const created = await res.json();
      setSavedLayouts(prev => [...prev, created]);
      setActiveLayoutId(created.id);
      // Activate it
      await apiFetch(`/api/layouts/${created.id}/activate`, { method: 'PUT' });
      setDirty(false);
      return created;
    }
  }, [activeLayoutId, currentLayout, savedLayouts]);

  // Delete a layout
  const deleteLayout = useCallback(async (layoutId) => {
    await apiFetch(`/api/layouts/${layoutId}`, { method: 'DELETE' });
    setSavedLayouts(prev => prev.filter(l => l.id !== layoutId));
    if (activeLayoutId === layoutId) {
      setActiveLayoutId(null);
      setCurrentLayout(LIMINAL_LAYOUT);
    }
  }, [activeLayoutId]);

  // Discard unsaved changes
  const discardChanges = useCallback(() => {
    if (activeLayoutId) {
      const layout = savedLayouts.find(l => l.id === activeLayoutId);
      if (layout) setCurrentLayout(normalizeWidgetOrder(layout.widget_order));
    } else {
      setCurrentLayout(LIMINAL_LAYOUT);
    }
    setDirty(false);
  }, [activeLayoutId, savedLayouts]);

  // Which widgets are available to add
  const availableWidgets = ALL_WIDGET_IDS.filter(id => !currentLayout.some(w => w.id === id));

  // Is the current layout the locked Liminal default?
  const isLiminalDefault = activeLayoutId === null && !dirty;

  return {
    currentLayout,
    savedLayouts,
    activeLayoutId,
    editMode,
    setEditMode,
    dirty,
    loaded,
    isLiminalDefault,
    availableWidgets,
    selectLayout,
    reorderWidgets,
    removeWidget,
    addWidget,
    shrinkWidget,
    growWidget,
    saveLayout,
    deleteLayout,
    discardChanges,
    WIDGET_LABELS,
    WIDGET_WIDTHS,
  };
}
