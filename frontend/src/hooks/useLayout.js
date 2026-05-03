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

// Values are i18n keys — callers should wrap with t(...) to resolve.
// The key string is itself a valid fallback if translations aren't loaded.
export const WIDGET_LABELS = {
  quote:        'widgets.quote',
  moon:         'widgets.moon',
  tarot:        'widgets.tarot',
  pulse:        'widgets.pulse',
  stats:        'widgets.stats',
  portrait:     'widgets.portrait',
  insight:      'widgets.insight',
  themes:       'widgets.themes',
  rhythm:       'widgets.rhythm',
  goals:        'widgets.goals',
  weather:      'widgets.weather',
  sky:          'widgets.sky',
  gratitude:    'widgets.gratitude',
  dreams:       'widgets.dreams',
  reading:      'widgets.reading',
  bucket:       'widgets.bucket',
  affirmations: 'widgets.affirmations',
  questions:    'widgets.questions',
  lookback:     'widgets.lookback',
  threads:      'widgets.threads',
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
  { id: 'stats', width: 50 },
  { id: 'portrait', width: 50 },
  { id: 'insight', width: 100 },
  { id: 'themes', width: 40 },
  { id: 'rhythm', width: 60 },
];

// Onboarding-quiz preset layouts. Selected via the "preset:<name>" token in
// selectLayout, or auto-applied at boot from users.layout_preference. Live
// in code (never stored in home_layouts) so they stay editable across
// versions without DB migrations.
export const WITNESS_LAYOUT = [
  // Psychology / self-inquiry — clean, no astrology or tarot.
  { id: 'quote',   width: 100 },
  { id: 'stats',   width: 50 },
  { id: 'threads', width: 50 },
  { id: 'pulse',   width: 100 },
  { id: 'goals',   width: 50 },
  { id: 'rhythm',  width: 50 },
  { id: 'insight', width: 100 },
  { id: 'themes',  width: 50 },
  { id: 'lookback', width: 50 },
];
export const SEEKER_LAYOUT = [
  // Spiritual / contemplative — tarot stays, portrait isn't here. The home
  // portrait widget would render in personality-only mode for Seeker if it
  // ever appears (driven by users.layout_preference).
  { id: 'quote',   width: 100 },
  { id: 'stats',   width: 50 },
  { id: 'threads', width: 50 },
  { id: 'pulse',   width: 100 },
  { id: 'tarot',   width: 60 },
  { id: 'goals',   width: 40 },
  { id: 'insight', width: 100 },
  { id: 'themes',  width: 40 },
  { id: 'rhythm',  width: 60 },
];
export const ATTUNED_LAYOUT = [
  // Full cosmic — pulled from the user's saved "The Attuned" iteration so the
  // default attuned layout matches what they tuned by hand.
  { id: 'quote',    width: 100 },
  { id: 'moon',     width: 40 },
  { id: 'tarot',    width: 60 },
  { id: 'pulse',    width: 100 },
  { id: 'stats',    width: 50 },
  { id: 'portrait', width: 50 },
  { id: 'insight',  width: 100 },
  { id: 'goals',    width: 20 },
  { id: 'themes',   width: 30 },
  { id: 'rhythm',   width: 50 },
];

const PRESET_LAYOUTS = {
  witness: WITNESS_LAYOUT,
  seeker:  SEEKER_LAYOUT,
  attuned: ATTUNED_LAYOUT,
  liminal: LIMINAL_LAYOUT,
};
// Display labels for the layout-editor dropdown.
export const PRESET_LABELS = {
  witness: 'The Witness',
  seeker:  'The Seeker',
  attuned: 'The Attuned',
};
export const PRESET_KEYS = ['witness', 'seeker', 'attuned'];

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

export function useLayout(isMobile = false, layoutPreference = 'liminal') {
  const [savedLayouts, setSavedLayouts] = useState([]);
  const [activeLayoutId, setActiveLayoutId] = useState(null); // null = preset/default
  // When no saved layout is active, the desktop falls back to whichever
  // preset matches `layoutPreference` (set by the onboarding quiz). The
  // legacy 'liminal' value resolves to LIMINAL_LAYOUT, so existing users
  // see no change.
  const initialPreset = PRESET_LAYOUTS[layoutPreference] || LIMINAL_LAYOUT;
  const [desktopLayout, setDesktopLayout] = useState(initialPreset);
  const [activePresetKey, setActivePresetKey] = useState(layoutPreference || 'liminal');
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

  // React to a mid-session change in layoutPreference (e.g. user re-takes
  // the quiz from settings). Only swap if no saved layout is active and
  // the user isn't mid-edit — otherwise we'd nuke their in-progress work.
  useEffect(() => {
    if (isMobile) return;
    if (activeLayoutId !== null) return;
    if (dirty) return;
    const preset = PRESET_LAYOUTS[layoutPreference];
    if (!preset) return;
    setActivePresetKey(layoutPreference);
    setDesktopLayout(preset);
  }, [layoutPreference, activeLayoutId, dirty, isMobile]);

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

  // Switch to a saved layout (numeric id), the Liminal default (null), the
  // custom-unsaved mode ('custom'), or one of the quiz presets via a
  // 'preset:witness' | 'preset:seeker' | 'preset:attuned' | 'preset:liminal' token.
  const selectLayout = useCallback((layoutId) => {
    if (layoutId === null) {
      // Liminal default — alias for the 'liminal' preset.
      setActiveLayoutId(null);
      setActivePresetKey('liminal');
      setCurrentLayout(LIMINAL_LAYOUT);
      setDirty(false);
      apiFetch('/api/layouts/deactivate', { method: 'PUT' }).catch(() => {});
    } else if (typeof layoutId === 'string' && layoutId.startsWith('preset:')) {
      const key = layoutId.slice('preset:'.length);
      const preset = PRESET_LAYOUTS[key];
      if (!preset) return;
      setActiveLayoutId(null);
      setActivePresetKey(key);
      setCurrentLayout(preset);
      setDirty(false);
      // Persist as the user's preference + clear any active saved layout.
      apiFetch('/api/layouts/deactivate', { method: 'PUT' }).catch(() => {});
      apiFetch('/api/auth/quiz-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layout: key }),
      }).catch(() => {});
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

  // Is the current layout the locked Liminal default? The 3 quiz presets
  // (witness/seeker/attuned) deliberately don't count — users can edit them
  // and save as a new custom layout.
  const isLiminalDefault = activeLayoutId === null && !dirty && activePresetKey === 'liminal';

  return {
    currentLayout,
    savedLayouts,
    activeLayoutId,
    activePresetKey, // which preset is in effect when no saved layout is active
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
