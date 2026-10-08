import { useState, useMemo } from 'react';

const s = {
  cal: {
    flexShrink: 0,
    borderBottom: 'var(--border-style)',
    padding: '10px 12px 12px',
  },
  calHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '10px',
  },
  calTitle: {
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--strong)',
    letterSpacing: '0.02em',
  },
  // Collapsible calendars: the month label is the fold/unfold control.
  calTitleBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    font: 'inherit',
  },
  calChevron: {
    width: '10px',
    height: '10px',
    color: 'var(--muted)',
    transition: 'transform 0.15s',
    flexShrink: 0,
  },
  calNav: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  calNavBtn: {
    fontSize: '13px',
    color: 'var(--muted)',
    padding: '1px 5px',
    borderRadius: '2px',
    lineHeight: 1.4,
    cursor: 'pointer',
    transition: 'color 0.12s',
  },
  calGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: '2px',
  },
  calDow: {
    textAlign: 'center',
    fontSize: '10px',
    fontWeight: '600',
    color: 'var(--muted)',
    letterSpacing: '0.04em',
    paddingBottom: '4px',
  },
  calDay: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    aspectRatio: '1',
    borderRadius: '50%',
    fontSize: '11px',
    cursor: 'default',
    color: 'var(--muted)',
    transition: 'background 0.1s, color 0.1s',
  },
  calDayHasEntry: {
    color: 'var(--strong)',
    fontWeight: '600',
    cursor: 'pointer',
    background: 'var(--panel-bg)',
  },
  calDayToday: {
    background: 'var(--strong)',
    color: 'var(--white)',
    fontWeight: '600',
  },
  calDaySelected: {
    background: 'var(--body)',
    color: 'var(--white)',
    fontWeight: '600',
  },
};

const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function toLocalYMD(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Reusable calendar component.
 *
 * @param {Object[]} items - Array of items with a date field (date, created_at, or updated_at)
 * @param {number|string|null} activeId - Currently selected item ID
 * @param {(item: Object) => void} onSelect - Callback when a day with items is clicked
 * @param {string} [dateField] - Which field to use for dates. Defaults to 'date' then 'created_at'.
 * @param {string} [titleField] - Which field to use for hover title. Defaults to 'title'.
 * @param {string} [collapsibleKey] - Makes the calendar foldable: clicking the
 *   month label folds the grid away. Open/closed is remembered under this key.
 */
export default function Calendar({ items, activeId, onSelect, dateField, titleField = 'title', collapsibleKey }) {
  const today = new Date();
  const todayYMD = toLocalYMD(today);

  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const storageKey = collapsibleKey ? `liminal.calendarCollapsed.${collapsibleKey}` : null;
  const [collapsed, setCollapsed] = useState(() => {
    if (!storageKey) return false;
    try { return localStorage.getItem(storageKey) === '1'; } catch { return false; }
  });
  function toggleCollapsed() {
    setCollapsed((c) => {
      try { localStorage.setItem(storageKey, c ? '0' : '1'); } catch { /* per-device nicety only */ }
      return !c;
    });
  }

  const extractDate = (item) => {
    if (dateField) return (item[dateField] || '').slice(0, 10);
    return (item.date || item.created_at || '').slice(0, 10);
  };

  // Map of dates (YYYY-MM-DD) to first item on that day
  const itemMap = useMemo(() => {
    const map = {};
    for (const item of items) {
      const d = extractDate(item);
      if (d && !map[d]) map[d] = item;
    }
    return map;
  }, [items]);

  const activeDate = useMemo(() => {
    const active = items.find(item => item.id === activeId);
    return active ? extractDate(active) : null;
  }, [items, activeId]);

  function prevMonth() {
    setCursor(c => {
      const d = new Date(c.year, c.month - 1, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }
  function nextMonth() {
    setCursor(c => {
      const d = new Date(c.year, c.month + 1, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  const monthLabel = new Date(cursor.year, cursor.month, 1)
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Build grid: Monday-first
  const firstDay = new Date(cursor.year, cursor.month, 1);
  const lastDay = new Date(cursor.year, cursor.month + 1, 0);
  const startDow = (firstDay.getDay() + 6) % 7;
  const days = [];
  for (let i = 0; i < startDow; i++) days.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) days.push(d);

  return (
    <div style={s.cal}>
      <div style={{ ...s.calHeader, ...(collapsed ? { marginBottom: 0 } : {}) }}>
        {storageKey ? (
          <button style={s.calTitleBtn} onClick={toggleCollapsed} aria-expanded={!collapsed} title={collapsed ? 'Show calendar' : 'Hide calendar'}>
            <span style={s.calTitle}>{monthLabel}</span>
            <svg viewBox="0 0 10 10" style={{ ...s.calChevron, transform: collapsed ? 'rotate(-90deg)' : 'none' }} aria-hidden="true">
              <path d="M2 3.5 L5 6.5 L8 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : (
          <span style={s.calTitle}>{monthLabel}</span>
        )}
        {!collapsed && (
          <div style={s.calNav}>
            <button style={s.calNavBtn} onClick={prevMonth} title="Previous month">‹</button>
            <button style={s.calNavBtn} onClick={nextMonth} title="Next month">›</button>
          </div>
        )}
      </div>
      {!collapsed && <div style={s.calGrid}>
        {DOW.map((d, i) => <div key={i} style={s.calDow}>{d}</div>)}
        {days.map((day, i) => {
          if (!day) return <div key={`blank-${i}`} />;
          const ymd = `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isToday = ymd === todayYMD;
          const isSelected = ymd === activeDate;
          const item = itemMap[ymd];

          let style = { ...s.calDay };
          if (isSelected) style = { ...style, ...s.calDaySelected };
          else if (isToday) style = { ...style, ...s.calDayToday };
          else if (item) style = { ...style, ...s.calDayHasEntry };

          return (
            <div
              key={ymd}
              style={style}
              onClick={() => item && onSelect(item)}
              title={item ? item[titleField] || '' : undefined}
            >
              {day}
            </div>
          );
        })}
      </div>}
    </div>
  );
}
