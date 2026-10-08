import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../i18n/LanguageContext';
import { tagLabel, IMG_EMOJI, tagEmojisFromTags } from '../utils/tagEmoji';
import { useTagEmojis } from '../hooks/useTagEmojis';
import EmojiPicker from './EmojiPicker';
import Calendar from './Calendar';
import PageHero from './PageHero';
import TagContextMenu from './TagContextMenu';
import { useLockedTags } from '../hooks/useLockedTags';
import { useCoreTags } from '../hooks/useCoreTags';
import { useListArrowNav } from '../hooks/useListArrowNav';

const ALL_TAG = '__all__';

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
          borderRadius: '16px',
          padding: '28px 32px',
          width: '320px',
          maxWidth: '90vw',
          boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: '13px', color: 'var(--body)', lineHeight: '1.6', marginBottom: '24px', whiteSpace: 'pre-line' }}>
          {message}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '7px 16px', fontSize: '12px', border: 'var(--border-style)',
              borderRadius: '10px', background: 'var(--white)', color: 'var(--body)',
              cursor: 'pointer', fontFamily: 'var(--font)',
            }}
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: '7px 16px', fontSize: '12px', border: '1px solid #cc0000',
              borderRadius: '10px', background: '#cc0000', color: '#fff',
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
    flexDirection: 'row',
    height: '100%',
    width: '100%',
    overflow: 'hidden',
  },
  listCol: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    minWidth: 0,
  },
  // Card holding the calendar, search and entries — a Home-style bevelled
  // square under the page icon and title (which stay on the white page).
  listCard: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    margin: '0 0 16px 16px',
    background: 'var(--near-white)',
    borderRadius: '16px',
  },
  search: {
    margin: '8px 10px',
    padding: '5px 10px',
    fontSize: '12px',
    border: 'var(--border-style)',
    borderRadius: '10px',
    background: 'var(--white)',
    width: 'calc(100% - 20px)',
    color: 'var(--strong)',
    outline: 'none',
    flexShrink: 0,
    fontFamily: 'var(--font)',
  },
  addBtn: {
    margin: '0 10px 8px',
    padding: '7px 0',
    fontSize: '11px',
    fontFamily: 'var(--font)',
    color: 'var(--muted)',
    background: 'transparent',
    border: '1.5px dashed var(--border)',
    borderRadius: '10px',
    width: 'calc(100% - 20px)',
    cursor: 'pointer',
    letterSpacing: '0.03em',
    transition: 'background 0.15s, color 0.15s',
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
    borderRadius: '10px',
    margin: '1px 6px',
    transition: 'background 0.1s',
    outline: 'none',
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
  itemTitle: {
    fontSize: '12px',
    color: 'var(--strong)',
    lineHeight: '1.4',
    overflow: 'hidden',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
  },
  empty: {
    padding: '24px 12px',
    fontSize: '12px',
    color: 'var(--muted)',
    textAlign: 'center',
    lineHeight: '1.6',
  },
  // The tag filters pop out from the list card's right edge (Filter button).
  tagPopover: {
    position: 'fixed',
    width: '100px',
    zIndex: 1000,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    background: 'var(--white)',
    border: 'var(--border-style)',
    borderRadius: '16px',
    boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
    overflowY: 'auto',
    overflowX: 'hidden',
    padding: '12px 6px',
    gap: '6px',
    boxSizing: 'border-box',
  },
  searchRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    margin: '8px 10px',
    flexShrink: 0,
  },
  filterBtn: {
    width: '28px',
    height: '28px',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'var(--border-style)',
    borderRadius: '10px',
    background: 'var(--white)',
    color: 'var(--muted)',
    cursor: 'pointer',
    padding: 0,
    transition: 'color 0.12s, background 0.12s',
  },
};


function formatEntryDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toUpperCase();
  } catch {
    return dateStr;
  }
}

export default function EntryList({ entries, activeId, onSelect, onNew, onDelete, allTags = [], allManualTags, allAutoTags, onDeleteTag, onAddTag, onNavigateToChat }) {
  // Manual tags above LLM-applied auto tags with a divider between them.
  // If the parent didn't pass the split arrays, fall back to treating allTags
  // as a single manual list — keeps the component backward-compatible.
  const allManual = allManualTags || allTags;
  const allAuto = allAutoTags || [];
  const { t } = useLanguage();
  const { isCore, coreList } = useCoreTags();
  // Core tags always render (even if no entry currently carries them) so the
  // user can keep pinned filters visible while navigating sparsely-tagged data.
  const coreTags = coreList;
  const manualTags = allManual.filter((tag) => !isCore(tag));
  const autoTags = allAuto.filter((tag) => !isCore(tag));
  const [search, setSearch] = useState('');

  const [confirmModal, setConfirmModal] = useState(null);
  const [filterTag, setFilterTag] = useState(ALL_TAG);
  const [addingTag, setAddingTag] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');
  const tagInputRef = useRef(null);

  useEffect(() => {
    if (addingTag) tagInputRef.current?.focus();
  }, [addingTag]);

  function confirmDelete(id, title, hasLinkedChat) {
    const key = hasLinkedChat ? 'journal.deleteConfirmWithChat' : 'journal.deleteConfirm';
    setConfirmModal({
      message: t(key, { title: title || 'Untitled' }),
      onConfirm: () => { onDelete(id); setConfirmModal(null); },
    });
  }

  function handleDeleteTag(tag) {
    setConfirmModal({
      message: `Remove tag "${tag}" from all entries?`,
      onConfirm: () => {
        onDeleteTag?.(tag);
        if (filterTag === tag) setFilterTag(ALL_TAG);
        setConfirmModal(null);
      },
    });
  }

  // Filter by tag first, then by search
  let filtered = filterTag === ALL_TAG
    ? entries
    : entries.filter(e => (e.tags || []).includes(filterTag));

  if (search) {
    filtered = filtered.filter(
      (e) =>
        e.title.toLowerCase().includes(search.toLowerCase()) ||
        (e.body_text || '').toLowerCase().includes(search.toLowerCase())
    );
  }

  useListArrowNav(filtered, (e) => e.id, activeId, onSelect);

  // Tag filters: a pop-out from the list card's right edge, opened by the
  // Filter button beside the search box. Picking a tag filters and closes it;
  // click outside or Esc closes it. (Right-click menus and the emoji picker
  // are drawn inside the pills, so using them doesn't count as outside.)
  const listCardRef = useRef(null);
  const filterBtnRef = useRef(null);
  const popRef = useRef(null);
  const [filterPos, setFilterPos] = useState(null); // { left, top, maxHeight } while open
  const filterOpen = !!filterPos;
  function toggleFilter() {
    if (filterOpen) { setFilterPos(null); return; }
    const card = listCardRef.current?.getBoundingClientRect();
    const btn = filterBtnRef.current?.getBoundingClientRect();
    if (!card || !btn) return;
    const width = 100;
    const left = Math.min(card.right + 8, window.innerWidth - width - 8);
    const top = btn.top;
    setFilterPos({ left, top, maxHeight: window.innerHeight - top - 16 });
  }
  function pickTag(tag) {
    setFilterTag(tag);
    setFilterPos(null);
  }
  useEffect(() => {
    if (!filterOpen) return undefined;
    const onDown = (e) => {
      if (popRef.current?.contains(e.target) || filterBtnRef.current?.contains(e.target)) return;
      setFilterPos(null);
    };
    const onKey = (e) => { if (e.key === 'Escape') setFilterPos(null); };
    const onResize = () => setFilterPos(null);
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, [filterOpen]);
  const filterActive = filterTag !== ALL_TAG;

  return (
    <div style={s.root}>
      {/* List column */}
      <div style={s.listCol}>
        <PageHero icon="/page-icons/journal.png" title={filterTag !== ALL_TAG ? filterTag : t('nav.journal')} divider={false} />

        <div ref={listCardRef} style={s.listCard}>
        <Calendar items={filtered} activeId={activeId} onSelect={onSelect} collapsibleKey="journal" />

        <div style={s.searchRow}>
          <input
            data-tour-id="journal-search"
            style={{ ...s.search, margin: 0, width: 'auto', flex: 1, minWidth: 0 }}
            placeholder={t('common.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={t('common.search')}
          />
          <button
            ref={filterBtnRef}
            data-tour-id="journal-tag-filter"
            onClick={toggleFilter}
            title={filterActive ? `${t('journal.filterByTag')}: ${filterTag}` : t('journal.filterByTag')}
            aria-label={t('journal.filterByTag')}
            aria-expanded={filterOpen}
            style={{
              ...s.filterBtn,
              ...(filterActive ? { background: 'var(--strong)', color: 'var(--white)', border: '1px solid var(--strong)' }
                : filterOpen ? { background: 'var(--panel-bg)', color: 'var(--strong)' } : {}),
            }}
          >
            {/* funnel */}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 5h18l-7 8.5V19l-4 2v-7.5z" />
            </svg>
          </button>
        </div>

        <button
          data-tour-id="journal-new-entry"
          style={s.addBtn}
          onClick={onNew}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--strong)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--muted)'; }}
        >
          + {t('journal.newEntry')}
        </button>

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
              onDelete={onDelete ? () => confirmDelete(entry.id, entry.title, !!entry.linked_session_id) : null}
              onNavigateToChat={onNavigateToChat}
            />
          ))}
        </div>
        </div>
      </div>

      {/* Tag filters — pop out from the list card while open */}
      {filterOpen && createPortal(
      <div ref={popRef} role="dialog" aria-label={t('journal.filterByTag')}
        style={{ ...s.tagPopover, left: filterPos.left, top: filterPos.top, maxHeight: filterPos.maxHeight }}>
        <TagPill
          label={t('notes.typeAll')}
          active={filterTag === ALL_TAG}
          onClick={() => pickTag(ALL_TAG)}
        />

        {coreTags.length > 0 && (
          <>
            {coreTags.map((tag) => (
              <TagCustomPill
                key={`c-${tag}`}
                label={tag}
                active={filterTag === tag}
                onClick={() => pickTag(tag)}
                onDelete={() => handleDeleteTag(tag)}
                auto={false}
              />
            ))}
            {(manualTags.length > 0 || autoTags.length > 0) && (
              <div style={{ width: '100%', borderTop: 'var(--border-style)', margin: '6px 0' }} />
            )}
          </>
        )}

        {manualTags.map((tag) => (
          <TagCustomPill
            key={`m-${tag}`}
            label={tag}
            active={filterTag === tag}
            onClick={() => pickTag(tag)}
            onDelete={() => handleDeleteTag(tag)}
          />
        ))}

        {autoTags.map((tag) => (
          <TagCustomPill
            key={`a-${tag}`}
            label={tag}
            active={filterTag === tag}
            onClick={() => pickTag(tag)}
            onDelete={() => handleDeleteTag(tag)}
            auto
          />
        ))}

        {addingTag ? (
          <input
            ref={tagInputRef}
            value={newTagInput}
            onChange={(e) => setNewTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newTagInput.trim()) {
                // Persist the new tag by adding it to the active entry —
                // otherwise the pill vanishes the next time the user clicks
                // anything because it never made it into any entry's tags
                // and `allManualTags` is derived from entries.
                const clean = newTagInput.trim().toLowerCase();
                onAddTag?.(clean);
                setFilterTag(clean);
                setNewTagInput('');
                setAddingTag(false);
              }
              if (e.key === 'Escape') { setAddingTag(false); setNewTagInput(''); }
            }}
            onBlur={() => { if (!newTagInput.trim()) setAddingTag(false); }}
            placeholder="tag…"
            maxLength={30}
            style={{
              width: '74px',
              padding: '4px 6px',
              fontSize: '11px',
              borderRadius: '20px',
              border: '1px solid var(--border)',
              textAlign: 'center',
              outline: 'none',
              fontFamily: 'var(--font)',
            }}
          />
        ) : (
          <button
            onClick={() => setAddingTag(true)}
            title="New tag"
            style={{
              width: '74px',
              padding: '4px 0',
              fontSize: '14px',
              color: 'var(--muted)',
              border: '1px dashed var(--border)',
              borderRadius: '20px',
              background: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--font)',
            }}
          >
            +
          </button>
        )}

      </div>,
      document.body,
      )}

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

function TagPill({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '74px',
        padding: '5px 4px',
        fontSize: '10px',
        fontWeight: active ? '600' : '400',
        letterSpacing: '0.03em',
        borderRadius: '20px',
        border: active ? '1px solid var(--strong)' : '1px solid var(--border)',
        background: active ? 'var(--strong)' : 'transparent',
        color: active ? 'var(--white)' : 'var(--body)',
        cursor: 'pointer',
        textAlign: 'center',
        transition: 'all 0.12s',
        flexShrink: 0,
        fontFamily: 'var(--font)',
      }}
    >
      {label}
    </button>
  );
}

function TagCustomPill({ label, active, onClick, onDelete, auto = false }) {
  const [hover, setHover] = useState(false);
  const [menu, setMenu] = useState(null);
  const [picker, setPicker] = useState(null);
  const { isLocked, isAlwaysLocked, lock, unlock } = useLockedTags();
  const { isCore, makeCore, removeCore } = useCoreTags();
  const { dynamicMap, setOverride, clearOverride } = useTagEmojis();
  const core = isCore(label);
  const userLocked = isLocked(label);
  // Core tags are auto-locked — × never shows on them, across all surfaces.
  const locked = userLocked || core;
  const always = isAlwaysLocked(label);
  const borderStyle = active ? '1px solid var(--strong)' : '1px solid var(--border)';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        width: '88px',
        borderRadius: '20px',
        border: borderStyle,
        background: active ? 'var(--strong)' : 'transparent',
        overflow: 'hidden',
        transition: 'all 0.12s',
        flexShrink: 0,
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setMenu({ x: e.clientX, y: e.clientY }); }}
    >
      <button
        onClick={onClick}
        className="mono-emoji"
        style={{
          flex: 1,
          padding: '5px 0 5px 8px',
          fontSize: '10px',
          fontWeight: active ? '600' : '400',
          fontStyle: auto && !active ? 'italic' : 'normal',
          letterSpacing: '0.03em',
          background: 'none',
          border: 'none',
          color: active ? 'var(--white)' : (auto ? 'var(--muted)' : 'var(--body)'),
          cursor: 'pointer',
          textAlign: 'left',
          fontFamily: 'var(--font)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minWidth: 0,
        }}
        title={locked ? `${label} (locked)` : label}
      >
        {IMG_EMOJI[label.toLowerCase()]
          ? <><img src={IMG_EMOJI[label.toLowerCase()]} alt="" style={{ width: '12px', height: '12px', verticalAlign: '-2px' }} /> {label}</>
          : tagLabel(label, dynamicMap)}
      </button>
      {hover && !locked && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          title="Delete tag"
          style={{
            padding: '5px 5px 5px 2px',
            fontSize: '9px',
            background: 'none',
            border: 'none',
            color: active ? 'rgba(255,255,255,0.6)' : 'var(--muted)',
            cursor: 'pointer',
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          ×
        </button>
      )}
      {menu && (() => {
        const hasOverride = !!(dynamicMap.overrides && dynamicMap.overrides[label.toLowerCase()]);
        return (
          <TagContextMenu
            x={menu.x}
            y={menu.y}
            onClose={() => setMenu(null)}
            items={[
              userLocked
                ? { label: always ? 'Permanently locked' : 'Unlock tag', disabled: always, onClick: () => unlock(label) }
                : { label: core ? 'Locked (core tag)' : 'Lock tag', disabled: core, onClick: () => lock(label) },
              core
                ? { label: 'Remove from core', onClick: () => removeCore(label) }
                : { label: 'Make core', onClick: () => makeCore(label) },
              { label: 'Change emoji…', onClick: () => setPicker({ x: menu.x, y: menu.y }) },
              ...(hasOverride ? [{ label: 'Reset emoji to default', onClick: () => clearOverride(label) }] : []),
            ]}
          />
        );
      })()}
      {picker && (
        <EmojiPicker
          x={picker.x}
          y={picker.y}
          currentEmoji={dynamicMap.overrides?.[label.toLowerCase()] || null}
          onPick={(e) => setOverride(label, e)}
          onClear={() => clearOverride(label)}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}

function breakthroughPips(level) {
  if (level == null) return '';
  if (level === 0) return '∙';
  if (level <= 4) return '∙∙';
  if (level <= 8) return '∙∙∙';
  if (level <= 12) return '∙∙∙∙';
  return '∙∙∙∙∙';
}

function LinkedChatButton({ onClick }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title="Go to linked chat"
      style={{
        width: '28px',
        height: '28px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '14px',
        border: 'none',
        background: 'rgba(99,102,241,0.1)',
        color: 'rgb(99,102,241)',
        cursor: 'pointer',
        flexShrink: 0,
        transition: 'background 0.15s',
      }}
    >
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H6l-3 3V11H4a2 2 0 0 1-2-2V3z" />
        <circle cx="8" cy="6" r="1.5" fill="currentColor" stroke="none" />
      </svg>
    </button>
  );
}

function EntryItem({ entry, active, onClick, onDelete, onNavigateToChat }) {
  const [hover, setHover] = useState(false);
  const { dynamicMap } = useTagEmojis();

  const tags = entry.tags || [];
  const isFight = tags.includes('fights');
  const isBreakthrough = tags.includes('breakthrough') || entry.breakthrough_level != null;
  // Right-side emoji strip — shows the glyph for every tag on the entry,
  // manual + auto. Includes auto_tags so historical entries (before
  // auto-tagging was removed) still surface their LLM-applied glyphs.
  // tagEmojisFromTags dedupes, so manual takes precedence on collisions.
  const emojiTags = tagEmojisFromTags([...tags, ...(entry.auto_tags || [])], dynamicMap);

  return (
    <div
      style={{
        ...s.item,
        position: 'relative',
        ...(active ? s.itemActive : hover ? { background: 'var(--panel-bg)' } : {}),
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      role="button"
      data-entry-item="true"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
    >
      {entry.linked_session_id && onNavigateToChat && (
        <LinkedChatButton onClick={() => onNavigateToChat(entry.linked_session_id)} />
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ ...s.itemDate, display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>{formatEntryDate(entry.date || entry.created_at)}</span>
          {isBreakthrough && (
            <span
              title={`Breakthrough${entry.breakthrough_level != null ? ` (${entry.breakthrough_level})` : ''}`}
              style={{ color: 'var(--strong)', letterSpacing: '1px', fontSize: '11px' }}
            >
              {breakthroughPips(entry.breakthrough_level)}
            </span>
          )}
          {isFight && (
            <span title="Fight" className="mono-emoji" style={{ fontSize: '9px', opacity: 0.7 }}>🔥</span>
          )}
        </div>
        <div style={{ ...s.itemTitle, paddingRight: hover ? '18px' : '0' }}>
          {entry.title || 'Untitled'}
        </div>
      </div>
      {emojiTags.length > 0 && (
        <div
          title={emojiTags.map(e => e.tag).join(', ')}
          className="mono-emoji"
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: '3px',
            flexShrink: 0,
            fontSize: '15px',
            lineHeight: 1,
            marginRight: hover && onDelete ? '14px' : '0',
          }}
        >
          {emojiTags.slice(0, 3).map((e) => (
            e.img
              ? <img key={e.tag} src={e.img} alt={e.tag} style={{ width: '15px', height: '15px', display: 'block' }} />
              : <span key={e.tag}>{e.glyph}</span>
          ))}
        </div>
      )}
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
