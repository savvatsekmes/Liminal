import { useState, useMemo } from 'react';
import { useLanguage } from '../i18n/LanguageContext';

function ConfirmModal({ message, onConfirm, onCancel }) {
  const { t } = useLanguage();
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.18)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 300,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: 'var(--white)',
          border: 'var(--border-style)',
          borderRadius: '4px',
          padding: '28px 32px',
          width: '320px',
          maxWidth: '90vw',
          boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: '13px', color: 'var(--body)', lineHeight: '1.6', marginBottom: '24px' }}>
          {message}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '7px 16px', fontSize: '12px', border: 'var(--border-style)',
              borderRadius: '2px', background: 'var(--white)', color: 'var(--body)',
              cursor: 'pointer', fontFamily: 'var(--font)',
            }}
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: '7px 16px', fontSize: '12px', border: '1px solid #cc0000',
              borderRadius: '2px', background: '#cc0000', color: '#fff',
              cursor: 'pointer', fontFamily: 'var(--font)',
            }}
          >
            {t('common.delete')}
          </button>
        </div>
      </div>
    </div>
  );
}

const s = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 12px',
    height: '40px',
    borderBottom: 'var(--border-style)',
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: '11px',
    fontWeight: '600',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--muted)',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  newBtn: {
    fontSize: '18px',
    color: 'var(--muted)',
    lineHeight: 1,
    padding: '2px 4px',
    borderRadius: '2px',
    transition: 'color 0.15s',
  },
  calToggle: {
    fontSize: '11px',
    color: 'var(--muted)',
    padding: '2px 5px',
    borderRadius: '2px',
    border: 'var(--border-style)',
    lineHeight: 1.4,
    transition: 'color 0.15s, background 0.15s',
    cursor: 'pointer',
  },
  search: {
    margin: '8px 10px',
    padding: '5px 8px',
    fontSize: '12px',
    border: 'var(--border-style)',
    borderRadius: '2px',
    background: 'var(--white)',
    width: 'calc(100% - 20px)',
    color: 'var(--strong)',
    outline: 'none',
    flexShrink: 0,
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    padding: '4px 0',
  },
  item: {
    padding: '8px 12px',
    cursor: 'pointer',
    borderRadius: '2px',
    margin: '1px 6px',
    transition: 'background 0.1s',
  },
  itemActive: {
    background: 'var(--panel-bg)',
  },
  itemDate: {
    fontSize: '10px',
    fontWeight: '600',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'var(--muted)',
    marginBottom: '2px',
  },
  itemDateActive: {},
  itemTitle: {
    fontSize: '12px',
    color: 'var(--strong)',
    lineHeight: '1.4',
    overflow: 'hidden',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
  },
  itemTitleActive: {},
  empty: {
    padding: '24px 12px',
    fontSize: '12px',
    color: 'var(--muted)',
    textAlign: 'center',
    lineHeight: '1.6',
  },
  // Calendar
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

function Calendar({ entries, activeId, onSelect }) {
  const today = new Date();
  const todayYMD = toLocalYMD(today);

  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() });

  // Set of dates (YYYY-MM-DD) that have entries, mapped to first entry on that day
  const entryMap = useMemo(() => {
    const map = {};
    for (const e of entries) {
      const d = (e.date || e.created_at || '').slice(0, 10);
      if (d && !map[d]) map[d] = e;
    }
    return map;
  }, [entries]);

  const activeDate = useMemo(() => {
    const active = entries.find(e => e.id === activeId);
    return active ? (active.date || active.created_at || '').slice(0, 10) : null;
  }, [entries, activeId]);

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
  // day of week 0=Sun..6=Sat → shift to Mon-first: Mon=0..Sun=6
  const startDow = (firstDay.getDay() + 6) % 7; // blanks before day 1
  const days = [];
  for (let i = 0; i < startDow; i++) days.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) days.push(d);

  return (
    <div style={s.cal}>
      <div style={s.calHeader}>
        <span style={s.calTitle}>{monthLabel}</span>
        <div style={s.calNav}>
          <button style={s.calNavBtn} onClick={prevMonth} title="Previous month">‹</button>
          <button style={s.calNavBtn} onClick={nextMonth} title="Next month">›</button>
        </div>
      </div>
      <div style={s.calGrid}>
        {DOW.map((d, i) => <div key={i} style={s.calDow}>{d}</div>)}
        {days.map((day, i) => {
          if (!day) return <div key={`blank-${i}`} />;
          const ymd = `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isToday = ymd === todayYMD;
          const isSelected = ymd === activeDate;
          const entry = entryMap[ymd];

          let style = { ...s.calDay };
          if (isSelected) style = { ...style, ...s.calDaySelected };
          else if (isToday) style = { ...style, ...s.calDayToday };
          else if (entry) style = { ...style, ...s.calDayHasEntry };

          return (
            <div
              key={ymd}
              style={style}
              onClick={() => entry && onSelect(entry)}
              title={entry ? entry.title || 'Entry' : undefined}
            >
              {day}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatEntryDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toUpperCase();
  } catch {
    return dateStr;
  }
}

export default function EntryList({ entries, activeId, onSelect, onNew, onDelete }) {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [showCal, setShowCal] = useState(true);
  const [hoverNew, setHoverNew] = useState(false);
  const [confirmModal, setConfirmModal] = useState(null); // { message, onConfirm }

  function confirmDelete(id, title) {
    setConfirmModal({
      message: t('journal.deleteConfirm', { title: title || 'Untitled' }),
      onConfirm: () => { onDelete(id); setConfirmModal(null); },
    });
  }

  const filtered = search
    ? entries.filter(
        (e) =>
          e.title.toLowerCase().includes(search.toLowerCase()) ||
          (e.body_text || '').toLowerCase().includes(search.toLowerCase())
      )
    : entries;

  return (
    <div style={s.root}>
      <div style={s.header}>
        <span style={s.headerTitle}>{t('nav.journal')}</span>
        <div style={s.headerRight}>
          <button
            style={{ ...s.calToggle, ...(showCal ? { color: 'var(--strong)', background: 'var(--panel-bg)' } : {}) }}
            onClick={() => setShowCal(v => !v)}
            title={t('journal.calendar')}
          >
            {t('journal.calendar')}
          </button>
          <button
            style={{ ...s.newBtn, ...(hoverNew ? { color: 'var(--strong)' } : {}) }}
            onMouseEnter={() => setHoverNew(true)}
            onMouseLeave={() => setHoverNew(false)}
            onClick={onNew}
            title={t('journal.newEntry')}
            aria-label={t('journal.newEntry')}
          >
            +
          </button>
        </div>
      </div>

      {showCal && (
        <Calendar entries={entries} activeId={activeId} onSelect={onSelect} />
      )}

      <input
        style={s.search}
        placeholder={t('common.search')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        aria-label={t('common.search')}
      />

      <div style={s.list}>
        {filtered.length === 0 && (
          <div style={s.empty}>
            {search ? t('journal.noMatch') : t('journal.noEntries')}
          </div>
        )}
        {filtered.map((entry) => (
          <EntryItem
            key={entry.id}
            entry={entry}
            active={entry.id === activeId}
            onClick={() => onSelect(entry)}
            onDelete={onDelete ? () => confirmDelete(entry.id, entry.title) : null}
          />
        ))}
      </div>

      {confirmModal && (
        <ConfirmModal
          message={confirmModal.message}
          onConfirm={confirmModal.onConfirm}
          onCancel={() => setConfirmModal(null)}
        />
      )}
    </div>
  );
}

function EntryItem({ entry, active, onClick, onDelete }) {
  const [hover, setHover] = useState(false);

  return (
    <div
      style={{
        ...s.item,
        position: 'relative',
        ...(active ? s.itemActive : hover ? { background: 'var(--panel-bg)' } : {}),
      }}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
    >
      <div style={{ ...s.itemDate, ...(active ? s.itemDateActive : {}) }}>
        {formatEntryDate(entry.date || entry.created_at)}
      </div>
      <div style={{ ...s.itemTitle, ...(active ? s.itemTitleActive : {}), paddingRight: hover ? '18px' : '0' }}>
        {entry.title || 'Untitled'}
      </div>
      {hover && onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          title="Delete entry"
          style={{
            position: 'absolute',
            top: '50%',
            right: '8px',
            transform: 'translateY(-50%)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '14px',
            color: 'var(--muted)',
            lineHeight: 1,
            padding: '2px',
            opacity: 0.6,
          }}
          onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
          onMouseLeave={(e) => e.currentTarget.style.opacity = '0.6'}
        >
          ×
        </button>
      )}
    </div>
  );
}
