import { useState, useRef, useEffect, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import Bold from '@tiptap/extension-bold';
import Italic from '@tiptap/extension-italic';
import Strike from '@tiptap/extension-strike';
import Code from '@tiptap/extension-code';
import Heading from '@tiptap/extension-heading';
import BulletList from '@tiptap/extension-bullet-list';
import OrderedList from '@tiptap/extension-ordered-list';
import ListItem from '@tiptap/extension-list-item';
import HardBreak from '@tiptap/extension-hard-break';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import Blockquote from '../extensions/Blockquote';
import History from '@tiptap/extension-history';
import Gapcursor from '@tiptap/extension-gapcursor';
import Placeholder from '@tiptap/extension-placeholder';
import { useNotes } from '../hooks/useNotes';
import { useDictation } from '../hooks/useDictation';
import { useTagSuggestions } from '../hooks/useTagSuggestions';
import { YoutubeEmbed } from '../extensions/YoutubeEmbed';
import { InstagramEmbed } from '../extensions/InstagramEmbed';
import { ImageEmbed } from '../extensions/ImageEmbed';
import { DetailsBlock } from '../extensions/DetailsBlock';
import { MediaRow } from '../extensions/MediaRow';
import { apiFetch } from '../utils/api';
import { parseSqliteUtc } from '../utils/dates';
import { tagLabel, tagEmoji, IMG_EMOJI, tagEmojisFromTags } from '../utils/tagEmoji';

function TagLabel({ tag }) {
  const src = IMG_EMOJI[tag.toLowerCase()];
  if (src) return <><img src={src} alt="" style={{ width: '12px', height: '12px', verticalAlign: '-2px' }} /> {tag}</>;
  return tagLabel(tag);
}
import { streamSpeak, stopSpeak } from '../utils/ttsStream';
import MirrorBlock from '../components/MirrorBlock';
import MicButton from '../components/MicButton';
import CardPullModal from '../components/CardPullModal';
import DoodleModal from '../components/DoodleModal';
import { CardReading } from '../extensions/CardReading';
import { atomDragGuard } from '../extensions/atomDragGuard';
import VersionsPanel from '../components/VersionsPanel';
import { useResizable } from '../hooks/useResizable';
import Calendar from '../components/Calendar';
import { BUILT_IN_ARCHETYPES } from '../constants/archetypes';
import ArchetypeAvatar from '../components/ArchetypeAvatar';
import ResizeDivider from '../components/ResizeDivider';
import { useLanguage } from '../i18n/LanguageContext';
import { useIsMobile } from '../hooks/useIsMobile';

const BUILT_IN_TYPES = [
  { type: 'all',        labelKey: 'notes.typeAll' },
  { type: 'idea',       labelKey: 'notes.typeIdea' },
  { type: 'quote',      labelKey: 'notes.typeQuote' },
  { type: 'goal',       labelKey: 'notes.typeGoal' },
  { type: 'reflection', labelKey: 'notes.typeReflection' },
  { type: 'dream',      labelKey: 'notes.typeDream' },
  { type: 'gratitude',  labelKey: 'notes.typeGratitude' },
  { type: 'none',       labelKey: 'notes.typeNone' },
];

// Type-specific display config
const TYPE_META = {
  idea:       { indicator: '·', bodyStyle: {} },
  quote:      { indicator: '"', bodyStyle: { fontStyle: 'italic' } },
  goal:       { indicator: '○', bodyStyle: {} },
  reflection: { indicator: '·', bodyStyle: {} },
  dream:      { indicator: '·', bodyStyle: { fontStyle: 'italic', color: 'var(--muted)' } },
  gratitude:  { indicator: '·', bodyStyle: {} },
  custom:     { indicator: '·', bodyStyle: {} },
  none:       { indicator: '·', bodyStyle: { color: 'var(--muted)' } },
};

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toUpperCase();
}

export default function NotesPage({ initialNoteId, onNoteSelected, onTalkAboutNote, onNavigateToChat }) {
  const { t } = useLanguage();
  const isMobile = useIsMobile();
  const [mobileView, setMobileView] = useState('editor'); // 'list' | 'editor' | 'reflect'
  const {
    notes,
    activeNote,
    activeFilters,
    allTags,
    allManualTags,
    allAutoTags,
    customTags,
    createNote,
    scheduleUpdate,
    deleteNote,
    deleteCustomTag,
    selectNote,
    toggleFilter,
    clearFilters,
    refreshCustomTags,
  } = useNotes();

  useEffect(() => {
    if (!initialNoteId || !notes.length) return;
    const target = notes.find((n) => n.id === initialNoteId);
    if (target) { selectNote(target); onNoteSelected?.(); }
  }, [initialNoteId, notes]);

  const [newTagInput, setNewTagInput] = useState('');
  const [showNewTagInput, setShowNewTagInput] = useState(false);
  const [confirmModal, setConfirmModal] = useState(null); // { message, onConfirm }
  const [showCal, setShowCal] = useState(true);
  const [search, setSearch] = useState('');
  const [reflectBlocks, setReflectBlocks] = useState([]);
  const [reflecting, setReflecting] = useState(false);
  const [reflectError, setReflectError] = useState(null);
  const [previewVersion, setPreviewVersion] = useState(null);
  const newTagRef = useRef(null);

  const [noteListWidth, startNoteListDrag] = useResizable(220, { min: 180, max: 380 });
  // Mirror split as percentage of editor+mirror area
  const [mirrorPct, setMirrorPct] = useState(50);
  const editorMirrorRef = useRef(null);
  const startMirrorDrag = useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startPct = mirrorPct;
    const areaW = editorMirrorRef.current?.offsetWidth || 1;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    function onMove(evt) {
      const delta = startX - evt.clientX;
      const deltaPct = (delta / areaW) * 100;
      setMirrorPct(Math.max(15, Math.min(75, startPct + deltaPct)));
    }
    function onUp() {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [mirrorPct]);

  // Load saved reflection when note changes
  useEffect(() => {
    setReflectBlocks([]);
    setReflectError(null);
    setPreviewVersion(null);
    if (!activeNote?.id) return;
    apiFetch(`/api/notes/${activeNote.id}/reflect`)
      .then((r) => r.json())
      .then((data) => { if (data.blocks?.length) setReflectBlocks(data.blocks); })
      .catch(() => {});
  }, [activeNote?.id]);

  async function handleReflect(archetype) {
    if (!activeNote?.id) return;
    setReflecting(true);
    setReflectError(null);
    try {
      const res = await apiFetch(`/api/notes/${activeNote.id}/reflect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          archetype: archetype && archetype !== 'Auto' ? archetype : undefined,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setReflectBlocks(data.blocks || []);
    } catch (err) {
      setReflectError(err.message);
    } finally {
      setReflecting(false);
    }
  }

  // Persist a manually-edited blocks array to the note's reflection.
  async function saveNoteBlocks(noteId, nextBlocks) {
    if (!noteId) return;
    try {
      await apiFetch(`/api/notes/${noteId}/reflect/blocks`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks: nextBlocks }),
      });
    } catch (err) {
      console.error('[NotesPage] saveNoteBlocks failed:', err.message);
    }
  }

  function handleUpdateNoteBlock(noteId, index, patch) {
    setReflectBlocks((prev) => {
      const next = prev.map((b, i) => (i === index ? { ...b, ...patch } : b));
      saveNoteBlocks(noteId, next);
      return next;
    });
  }

  // Per-field patch via PATCH endpoint — does NOT depend on local state being
  // current, so it survives the user editing and immediately switching notes.
  async function handlePatchNoteBlock(noteId, index, patch) {
    if (!noteId || index == null) return;
    setReflectBlocks((prev) => prev.map((b, i) => (i === index ? { ...b, ...patch } : b)));
    try {
      await apiFetch(`/api/notes/${noteId}/reflect/blocks/${index}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patch }),
      });
    } catch (err) {
      console.error('[NotesPage] handlePatchNoteBlock failed:', err.message);
    }
  }

  function handleDeleteNoteBlock(noteId, index) {
    setReflectBlocks((prev) => {
      const next = prev.filter((_, i) => i !== index);
      saveNoteBlocks(noteId, next);
      return next;
    });
  }

  function handleAddNoteBlock(noteId) {
    setReflectBlocks((prev) => {
      const next = [...prev, { title: '', body: '', quote: null, archetype: 'Manual' }];
      saveNoteBlocks(noteId, next);
      return next;
    });
  }

  function handleCreateNote() {
    // New note gets current active filters as its tags
    const tags = activeFilters.length > 0 ? [...activeFilters] : [];
    createNote('none', null, tags);
  }

  function handleNewCustomTag(e) {
    if (e.key === 'Enter' && newTagInput.trim()) {
      const tag = newTagInput.trim().toLowerCase();
      setNewTagInput('');
      setShowNewTagInput(false);
      createNote('none', null, [tag]);
    }
    if (e.key === 'Escape') {
      setNewTagInput('');
      setShowNewTagInput(false);
    }
  }

  function handleDeleteTag(tag) {
    // Remove tag from all notes that have it
    for (const note of notes) {
      if ((note.tags || []).includes(tag)) {
        scheduleUpdate(note.id, { tags: (note.tags || []).filter(t => t !== tag) });
      }
    }
    if (activeFilters.includes(tag)) toggleFilter(tag);
  }

  function openConfirm(message, onConfirm) {
    setConfirmModal({ message, onConfirm });
  }

  const isAllActive = activeFilters.length === 0;

  const filteredNotes = search
    ? notes.filter(n =>
        (n.title || '').toLowerCase().includes(search.toLowerCase()) ||
        (n.body || '').replace(/<[^>]+>/g, ' ').toLowerCase().includes(search.toLowerCase())
      )
    : notes;

  const mobileSelectNote = (note) => {
    selectNote(note);
    setMobileView('editor');
  };

  return (
    <div style={{ display: 'flex', flex: 1, height: '100%', overflow: 'hidden', minWidth: 0 }}>
      {/* Note list — fills available space on mobile (minus tag strip) */}
      <div style={{
        width: isMobile ? 'auto' : noteListWidth + 'px',
        flex: isMobile ? 1 : undefined,
        minWidth: 0,
        flexShrink: 0,
        display: isMobile && mobileView !== 'list' ? 'none' : 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--near-white)',
      }}>
        {/* List header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          height: '44px',
          borderBottom: 'var(--border-style)',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {t('notes.title')}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button
              style={{
                fontSize: '11px',
                color: showCal ? 'var(--strong)' : 'var(--muted)',
                background: showCal ? 'var(--panel-bg)' : 'none',
                border: 'var(--border-style)',
                borderRadius: '2px',
                padding: '2px 5px',
                cursor: 'pointer',
                fontFamily: 'var(--font)',
                lineHeight: 1.4,
                transition: 'color 0.15s, background 0.15s',
              }}
              onClick={() => setShowCal(v => !v)}
              title={t('journal.calendar')}
            >
              {t('journal.calendar')}
            </button>
          </div>
        </div>

        {showCal && (
          <Calendar
            items={notes}
            activeId={activeNote?.id}
            onSelect={(note) => selectNote(note)}
            dateField="created_at"
          />
        )}

        <input
          style={{
            margin: '8px 10px', padding: '5px 10px', fontSize: '12px',
            border: 'var(--border-style)', borderRadius: '10px', background: 'var(--white)',
            width: 'calc(100% - 20px)', color: 'var(--strong)', outline: 'none',
            flexShrink: 0, fontFamily: 'var(--font)',
          }}
          placeholder={t('common.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <button
          style={{
            margin: '0 10px 8px', padding: '7px 0', fontSize: '11px',
            fontFamily: 'var(--font)', color: 'var(--muted)', background: 'transparent',
            border: '1.5px dashed var(--border)', borderRadius: '10px',
            width: 'calc(100% - 20px)', cursor: 'pointer', letterSpacing: '0.03em',
            transition: 'background 0.15s, color 0.15s', flexShrink: 0,
          }}
          onClick={handleCreateNote}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--strong)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--muted)'; }}
        >
          + {t('notes.newNote')}
        </button>

        {/* Note items */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          {filteredNotes.length === 0 && (
            <div style={{ padding: '24px 14px', fontSize: '12px', color: 'var(--muted)', fontStyle: 'italic' }}>
              {t('notes.noNotes')}
            </div>
          )}
          {filteredNotes.map((note) => (
            <NoteListItem
              key={note.id}
              note={note}
              active={activeNote?.id === note.id}
              onClick={() => isMobile ? mobileSelectNote(note) : selectNote(note)}
              onDelete={() => openConfirm(
                t(note.linked_session_id ? 'notes.deleteConfirmWithChat' : 'notes.deleteConfirm'),
                () => deleteNote(note.id)
              )}
              onNavigateToChat={onNavigateToChat}
            />
          ))}
        </div>
      </div>

      {/* Tag strip — hidden on mobile except in list view */}
      {(!isMobile || mobileView === 'list') && <div style={{
        width: '76px',
        flexShrink: 0,
        borderLeft: 'var(--border-style)',
        background: 'var(--near-white)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '16px 6px',
        gap: '4px',
        overflowY: 'auto',
      }}>
        {BUILT_IN_TYPES.map(({ type, labelKey }) => (
          <TypePill
            key={type}
            type={type}
            label={t(labelKey)}
            active={type === 'all' ? isAllActive : activeFilters.includes(type)}
            onClick={() => type === 'all' ? clearFilters() : toggleFilter(type)}
          />
        ))}

        {(() => {
          // Render manual tags first, then a divider, then LLM-applied auto
          // tags. Built-in type pills already cover the canonical labels
          // (idea/quote/etc.), so we strip them from both lists. Manual wins
          // already happens upstream in useNotes, so we can render directly.
          const builtInSet = new Set(BUILT_IN_TYPES.map(b => b.type));
          const manualExtras = (allManualTags || allTags).filter(t => !builtInSet.has(t));
          const autoExtras = (allAutoTags || []).filter(t => !builtInSet.has(t));
          if (manualExtras.length === 0 && autoExtras.length === 0) return null;
          return (
            <>
              <div style={{ width: '100%', borderTop: 'var(--border-style)', margin: '6px 0' }} />
              {manualExtras.map((tag) => (
                <CustomTagPill
                  key={`m-${tag}`}
                  label={tag}
                  active={activeFilters.includes(tag)}
                  onClick={() => toggleFilter(tag)}
                  onDelete={() => openConfirm(
                    t('notes.deleteTagConfirm', { tag }),
                    () => handleDeleteTag(tag)
                  )}
                />
              ))}
              {autoExtras.length > 0 && (
                <div style={{
                  width: '50px',
                  height: '1px',
                  background: 'var(--border)',
                  opacity: 0.6,
                  margin: '4px 0',
                  flexShrink: 0,
                }} title="LLM-suggested tags" />
              )}
              {autoExtras.map((tag) => (
                <CustomTagPill
                  key={`a-${tag}`}
                  label={tag}
                  active={activeFilters.includes(tag)}
                  onClick={() => toggleFilter(tag)}
                  onDelete={() => openConfirm(
                    t('notes.deleteTagConfirm', { tag }),
                    () => handleDeleteTag(tag)
                  )}
                  auto
                />
              ))}
            </>
          );
        })()}

        {showNewTagInput ? (
          <input
            ref={newTagRef}
            autoFocus
            value={newTagInput}
            onChange={(e) => setNewTagInput(e.target.value)}
            onKeyDown={handleNewCustomTag}
            onBlur={() => { setNewTagInput(''); setShowNewTagInput(false); }}
            placeholder={t('notes.tagPlaceholder')}
            style={{
              width: '62px',
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
            onClick={() => setShowNewTagInput(true)}
            title={t('notes.newCustomTag')}
            style={{
              width: '62px',
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

        <div style={{ flex: 1 }} />
      </div>}

      {!isMobile && <ResizeDivider onMouseDown={startNoteListDrag} />}

      {/* Editor + mirror area — hidden on mobile when viewing list */}
      <div ref={editorMirrorRef} style={{ flex: 1, display: isMobile && mobileView === 'list' ? 'none' : 'flex', minWidth: 0, overflow: 'hidden', flexDirection: isMobile ? 'column' : 'row' }}>
        {/* Mobile top bar: Notes (list) ← → Reflect */}
        {isMobile && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--white)', borderBottom: 'var(--border-style)', flexShrink: 0 }}>
            {mobileView === 'reflect' ? (
              <button
                onClick={() => setMobileView('editor')}
                style={{ background: 'none', border: 'none', fontSize: '13px', color: 'var(--muted)', cursor: 'pointer', fontFamily: 'var(--font)', padding: '4px 0' }}
              >
                ‹ Notes Editor
              </button>
            ) : (
              <button
                onClick={() => setMobileView('list')}
                style={{ background: 'none', border: 'none', fontSize: '13px', color: 'var(--muted)', cursor: 'pointer', fontFamily: 'var(--font)', padding: '4px 0' }}
              >
                ‹ {t('notes.title')}
              </button>
            )}
            {mobileView === 'editor' && (
              <button
                onClick={() => setMobileView('reflect')}
                disabled={!activeNote}
                style={{ background: 'none', border: 'none', fontSize: '13px', color: activeNote ? 'var(--strong)' : 'var(--muted)', cursor: activeNote ? 'pointer' : 'default', fontFamily: 'var(--font)', padding: '4px 0', opacity: activeNote ? 1 : 0.5 }}
              >
                {t('notes.mirror')} ›
              </button>
            )}
          </div>
        )}
        {/* Note editor — shown on desktop always, on mobile only when view === 'editor' */}
        <div style={{ width: isMobile ? '100%' : `${100 - mirrorPct}%`, minWidth: 0, display: isMobile && mobileView !== 'editor' ? 'none' : 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--white)' }}>
          {activeNote ? (
            <NoteEditor
              key={activeNote.id}
              note={activeNote}
              onChange={scheduleUpdate}
              customTags={customTags}
              onVersionPreview={setPreviewVersion}
              previewVersionId={previewVersion?.id}
              onTalkAboutNote={onTalkAboutNote}
            />
          ) : (
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              gap: '12px',
              color: 'var(--muted)',
            }}>
              <div style={{ fontSize: '28px', opacity: 0.3 }}>◈</div>
              <div style={{ fontSize: '13px' }}>{t('notes.selectNote')}</div>
              <button className="btn-ghost" onClick={handleCreateNote} style={{ marginTop: '4px' }}>
                {t('notes.newNote')}
              </button>
            </div>
          )}
        </div>

        {!isMobile && <ResizeDivider onMouseDown={(e) => startMirrorDrag(e)} inverted />}
        {/* Note mirror panel — full width on mobile when view === 'reflect' */}
        <div style={{
          width: isMobile ? '100%' : `${mirrorPct}%`,
          minWidth: 0,
          overflow: 'hidden',
          display: isMobile && mobileView !== 'reflect' ? 'none' : 'block',
          flex: isMobile ? 1 : 'none',
        }}>
          <NoteMirrorPanel
            note={activeNote}
            blocks={reflectBlocks}
            loading={reflecting}
            error={reflectError}
            onReflect={handleReflect}
            onUpdateBlock={handleUpdateNoteBlock}
            onPatchBlock={handlePatchNoteBlock}
            onDeleteBlock={handleDeleteNoteBlock}
            onAddBlock={handleAddNoteBlock}
            previewVersion={previewVersion}
            onClearPreview={() => setPreviewVersion(null)}
          />
        </div>
      </div>{/* end editor+mirror area */}

      {/* Confirm modal */}
      {confirmModal && (
        <ConfirmModal
          message={confirmModal.message}
          onConfirm={() => { confirmModal.onConfirm(); setConfirmModal(null); }}
          onCancel={() => setConfirmModal(null)}
        />
      )}
    </div>
  );
}

// ── ConfirmModal ──────────────────────────────────────────────────────────────

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
              padding: '7px 16px',
              fontSize: '12px',
              border: 'var(--border-style)',
              borderRadius: '10px',
              background: 'var(--white)',
              color: 'var(--body)',
              cursor: 'pointer',
              fontFamily: 'var(--font)',
            }}
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: '7px 16px',
              fontSize: '12px',
              border: '1px solid #cc0000',
              borderRadius: '10px',
              background: '#cc0000',
              color: '#fff',
              cursor: 'pointer',
              fontFamily: 'var(--font)',
            }}
          >
            {t('common.delete')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── TypePill ──────────────────────────────────────────────────────────────────

function TypePill({ label, type, active, onClick }) {
  const emoji = type && type !== 'all' ? tagEmoji(type) : '';
  return (
    <button
      onClick={onClick}
      style={{
        minWidth: '62px',
        padding: '5px 8px',
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
        whiteSpace: 'nowrap',
      }}
    >
      {emoji ? `${emoji} ${label}` : label}
    </button>
  );
}

// ── CustomTagPill ─────────────────────────────────────────────────────────────

function CustomTagPill({ label, active, onClick, onDelete, auto = false }) {
  const { t } = useLanguage();
  const [hover, setHover] = useState(false);

  // Auto (LLM-applied) tags get a dashed border + italic so they read as
  // distinct from user-typed manual tags at a glance.
  const borderStyle = auto
    ? (active ? '1px solid var(--strong)' : '1px dashed var(--border)')
    : (active ? '1px solid var(--strong)' : '1px solid var(--border)');

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        minWidth: '72px',
        maxWidth: '110px',
        borderRadius: '20px',
        border: borderStyle,
        background: active ? 'var(--strong)' : 'transparent',
        overflow: 'hidden',
        transition: 'all 0.12s',
        flexShrink: 0,
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        onClick={onClick}
        style={{
          flex: 1,
          padding: '5px 0 5px 6px',
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
        title={label}
      >
        <TagLabel tag={label} />
      </button>
      {hover && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          title={t('notes.deleteTag')}
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
    </div>
  );
}

// ── NoteListItem ──────────────────────────────────────────────────────────────

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

function NoteListItem({ note, active, onClick, onDelete, onNavigateToChat }) {
  const { t } = useLanguage();
  const [hover, setHover] = useState(false);
  const meta = TYPE_META[note.type] || TYPE_META.idea;
  const preview = note.body
    ? note.body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || '—'
    : '—';

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '8px 12px',
        cursor: 'pointer',
        borderRadius: '10px',
        margin: '1px 6px',
        background: active ? 'var(--panel-bg)' : hover ? 'var(--panel-bg)' : 'transparent',
        transition: 'background 0.1s',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}
    >
      {note.linked_session_id && onNavigateToChat && (
        <LinkedChatButton onClick={() => onNavigateToChat(note.linked_session_id)} />
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: '10px', fontWeight: '600', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '2px' }}>
          {(note.tags || []).length > 0 ? (note.tags || []).map(t => tagLabel(t)).join(' · ') + ' · ' : ''}{formatDate(note.created_at)}
        </div>
        <div style={{
          fontSize: '12px',
          color: active ? 'var(--strong)' : 'var(--body)',
          lineHeight: '1.4',
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          paddingRight: hover ? '18px' : '0',
          ...meta.bodyStyle,
        }}>
          {note.title || preview}
        </div>
      </div>
      {(() => {
        const emojiTags = tagEmojisFromTags(note.tags || []);
        if (!emojiTags.length) return null;
        return (
          <div
            title={emojiTags.map(e => e.tag).join(', ')}
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: '3px',
              flexShrink: 0,
              fontSize: '15px',
              lineHeight: 1,
              marginRight: hover ? '14px' : '0',
            }}
          >
            {emojiTags.slice(0, 3).map((e) => (
              e.img
                ? <img key={e.tag} src={e.img} alt={e.tag} style={{ width: '15px', height: '15px', display: 'block' }} />
                : <span key={e.tag}>{e.glyph}</span>
            ))}
          </div>
        );
      })()}
      {hover && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          title={t('notes.deleteNote')}
          style={{
            position: 'absolute',
            right: '10px',
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: '14px',
            color: 'var(--muted)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            lineHeight: 1,
            padding: '2px 4px',
            borderRadius: '2px',
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}

// ── TypeSelector ──────────────────────────────────────────────────────────────

const BUILT_IN_NOTE_TYPES = ['idea', 'quote', 'goal', 'reflection', 'dream', 'gratitude', 'none'];

const TYPE_LABEL_KEYS = {
  idea: 'notes.typeIdea',
  quote: 'notes.typeQuote',
  goal: 'notes.typeGoal',
  reflection: 'notes.typeReflection',
  dream: 'notes.typeDream',
  gratitude: 'notes.typeGratitude',
  none: 'notes.typeNone',
};

function TypeSelector({ note, customTags, suggestedTags = [], onDismissSuggestion, onChange }) {
  const { t } = useLanguage();
  const tags = note.tags || [];
  const autoTags = note.auto_tags || [];

  // Toggle: manual pills toggle in `tags`, auto pills in `auto_tags`. A pill
  // not on the note yet (e.g. an existing filter from another note) gets
  // added as a manual tag.
  function toggleTag(tag) {
    if (tags.includes(tag)) {
      onChange(note.id, { tags: tags.filter(t => t !== tag) });
    } else if (autoTags.includes(tag)) {
      onChange(note.id, { auto_tags: autoTags.filter(t => t !== tag) });
    } else {
      onChange(note.id, { tags: [...tags, tag] });
    }
  }

  // Promote a suggestion → write into `auto_tags`. The user can later
  // promote it to manual by clicking the auto pill (server's normaliseTagPair
  // ensures it never lives in both arrays at once).
  function applySuggestion(tag) {
    if (!tags.includes(tag) && !autoTags.includes(tag)) {
      onChange(note.id, { auto_tags: [...autoTags, tag] });
    }
    onDismissSuggestion?.(tag);
  }

  // Hide suggestions that overlap built-in types, existing custom tags, or
  // anything already on the note (manual or auto).
  const knownSet = new Set([...BUILT_IN_NOTE_TYPES, ...customTags, ...tags, ...autoTags]);
  const freshSuggestions = suggestedTags.filter((s) => !knownSet.has(s));

  const pillBase = {
    fontSize: '10px',
    padding: '3px 9px',
    borderRadius: '20px',
    border: '1px solid var(--border)',
    background: 'transparent',
    color: 'var(--muted)',
    cursor: 'pointer',
    transition: 'all 0.12s',
    fontFamily: 'var(--font)',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  };

  const pillActive = {
    border: '1px solid var(--strong)',
    background: 'var(--strong)',
    color: 'var(--white)',
    fontWeight: '600',
  };

  // Visually distinct pill style for live LLM-suggested tags — dashed border
  // and italic so the user can tell at a glance these aren't yet applied.
  const pillSuggested = {
    border: '1px dashed var(--border)',
    background: 'var(--near-white)',
    color: 'var(--muted)',
    fontStyle: 'italic',
  };

  // Auto-applied (LLM) tags already on the note: dashed border, no italic.
  const pillAuto = {
    border: '1px dashed var(--border)',
    background: 'transparent',
    color: 'var(--muted)',
  };

  // Auto tags to render inline. Hide ones that are also a built-in type or
  // a known custom tag — those already render via the customTags pass with
  // the active state, and showing both would be a duplicate.
  const customSet = new Set([...BUILT_IN_NOTE_TYPES, ...customTags]);
  const inlineAutoTags = autoTags.filter((t) => !customSet.has(t));

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap', flex: 1, marginRight: '16px' }}>
      {BUILT_IN_NOTE_TYPES.map((typ) => {
        const active = tags.includes(typ);
        return (
          <button
            key={typ}
            style={{ ...pillBase, ...(active ? pillActive : {}) }}
            onClick={() => toggleTag(typ)}
          >
            {tagEmoji(typ) ? `${tagEmoji(typ)} ${t(TYPE_LABEL_KEYS[typ])}` : t(TYPE_LABEL_KEYS[typ])}
          </button>
        );
      })}

      {customTags.length > 0 && (
        <div style={{ width: '1px', height: '14px', background: 'var(--border)', flexShrink: 0, margin: '0 2px' }} />
      )}

      {customTags.map((tag) => {
        const active = tags.includes(tag);
        return (
          <button
            key={tag}
            style={{ ...pillBase, ...(active ? pillActive : {}) }}
            onClick={() => toggleTag(tag)}
          >
            <TagLabel tag={tag} />
          </button>
        );
      })}

      {inlineAutoTags.length > 0 && (
        <div style={{ width: '1px', height: '14px', background: 'var(--border)', flexShrink: 0, margin: '0 2px' }} />
      )}

      {inlineAutoTags.map((tag) => (
        <button
          key={'a-' + tag}
          style={{ ...pillBase, ...pillAuto }}
          onClick={() => toggleTag(tag)}
          title="Suggested tag — click to remove"
        >
          <TagLabel tag={tag} />
        </button>
      ))}

      {freshSuggestions.length > 0 && (
        <div style={{ width: '1px', height: '14px', background: 'var(--border)', flexShrink: 0, margin: '0 2px' }} />
      )}

      {freshSuggestions.map((tag) => (
        <button
          key={'sug-' + tag}
          style={{ ...pillBase, ...pillSuggested }}
          onClick={() => applySuggestion(tag)}
          title="Suggested — click to add"
        >
          + <TagLabel tag={tag} />
        </button>
      ))}
    </div>
  );
}

// ── NoteToolbar ───────────────────────────────────────────────────────────────

function noteWordCount(text) {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function NoteToolbar({ editor, saveStatus, onVersionsOpen, onCardPull, onDoodle, editMode, onToggleEditMode }) {
  const { t } = useLanguage();
  if (!editor) return null;
  const words = noteWordCount(editor.getText());

  const btnStyle = {
    width: '26px',
    height: '26px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '3px',
    fontSize: '12px',
    color: 'var(--muted)',
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'color 0.1s, background 0.1s',
    border: 'none',
    background: 'none',
    fontFamily: 'var(--font)',
  };

  const btnActive = { color: 'var(--strong)', background: 'var(--panel-bg)' };
  const divider = { width: '1px', height: '14px', background: 'var(--border)', margin: '0 3px', flexShrink: 0 };

  const btn = (label, active, onClick, children) => (
    <button
      key={label}
      style={{ ...btnStyle, ...(active ? btnActive : {}) }}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '1px',
      padding: '0 12px',
      height: '40px',
      borderBottom: 'var(--border-style)',
      flexShrink: 0,
      background: 'var(--white)',
    }}>
      {btn('Bold',          editor.isActive('bold'),          () => editor.chain().focus().toggleBold().run(),          <strong>B</strong>)}
      {btn('Italic',        editor.isActive('italic'),        () => editor.chain().focus().toggleItalic().run(),        <em>I</em>)}
      {btn('Strikethrough', editor.isActive('strike'),        () => editor.chain().focus().toggleStrike().run(),        <s>S</s>)}
      <div style={divider} />
      {btn('Heading 1', editor.isActive('heading', { level: 1 }), () => editor.chain().focus().toggleHeading({ level: 1 }).run(), 'H1')}
      {btn('Heading 2', editor.isActive('heading', { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), 'H2')}
      <div style={divider} />
      {btn('Bullet list',   editor.isActive('bulletList'),   () => editor.chain().focus().toggleBulletList().run(),   '≡')}
      {btn('Ordered list',  editor.isActive('orderedList'),  () => editor.chain().focus().toggleOrderedList().run(),  '#')}
      {btn('Indent',  false,  () => editor.chain().focus().sinkListItem('listItem').run(),  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="8" x2="21" y2="8"/><line x1="3" y1="16" x2="21" y2="16"/><polyline points="9 4 13 8 9 12"/></svg>)}
      {btn('Outdent', false,  () => editor.chain().focus().liftListItem('listItem').run(),  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="8" x2="21" y2="8"/><line x1="3" y1="16" x2="21" y2="16"/><polyline points="13 4 9 8 13 12"/></svg>)}
      {btn('Quote',         editor.isActive('blockquote'),   () => editor.chain().focus().toggleBlockquote().run(),   '"')}
      {btn('Toggle', editor.isActive('detailsBlock'), () => editor.chain().focus().setDetailsBlock().run(), <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="6,4 20,12 6,20" fill="currentColor" stroke="none"/></svg>)}
      <div style={divider} />
      {btn('Horizontal rule', false, () => editor.chain().focus().setHorizontalRule().run(), '—')}
      <div style={divider} />
      {btn(t('cards.pullCards'), false, () => onCardPull?.(), <svg width="12" height="15" viewBox="0 0 12 15" fill="none" stroke="currentColor" strokeWidth="1"><rect x="0.5" y="0.5" width="11" height="14" rx="1.5"/><rect x="1.5" y="1.5" width="9" height="12" rx="1" strokeWidth="0.6"/><polygon points="6,3.5 8,7.5 6,11 4,7.5" fill="currentColor" stroke="none"/></svg>)}
      {btn(t('doodle.title'), false, () => onDoodle?.(), <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12L1 13L3 12L12 3L11 2L2 11Z" /><path d="M10 3L11 4" /></svg>)}
      <div style={{ flex: 1 }} />
      <button
        style={{ ...btnStyle, ...(editMode ? btnActive : {}), marginRight: '2px' }}
        title={editMode ? 'Exit edit mode' : 'Enable edit mode'}
        onClick={onToggleEditMode}
        type="button"
      >
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <path d="M11.5 2.5l2 2-8 8H3.5v-2l8-8z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        style={{ ...btnStyle, fontSize: '14px', marginRight: '2px' }}
        title={t('notes.versionHistory')}
        onClick={onVersionsOpen}
        type="button"
      >
        ◷
      </button>
      {saveStatus !== 'idle' && (
        <span style={{ fontSize: '11px', color: 'var(--muted)', flexShrink: 0, marginRight: '4px' }}>
          {saveStatus === 'saving' ? t('common.saving') : '✓ ' + t('common.saved')}
        </span>
      )}
      <span style={{ fontSize: '11px', color: 'var(--muted)', flexShrink: 0, marginRight: '4px' }}>
        {t('common.words', { count: words })}
      </span>
    </div>
  );
}

// ── NoteEditor ────────────────────────────────────────────────────────────────

const NOTE_PLACEHOLDER_KEYS = {
  idea:       'notes.placeholderIdea',
  quote:      'notes.placeholderQuote',
  goal:       'notes.placeholderGoal',
  reflection: 'notes.placeholderReflection',
  dream:      'notes.placeholderDream',
  gratitude:  'notes.placeholderGratitude',
  custom:     'notes.placeholderCustom',
  none:       'notes.placeholderNone',
};

function NoteEditor({ note, onChange, customTags, onVersionPreview, previewVersionId, onTalkAboutNote }) {
  const { t } = useLanguage();
  const noteRef = useRef(note);
  noteRef.current = note;

  const saveTimer = useRef(null);
  const savedTimer = useRef(null);
  const pendingSave = useRef(null); // { id, body } — flushed on unmount
  const lastSnapshotAt = useRef(null);
  const [saveStatus, setSaveStatus] = useState('idle'); // idle | saving | saved
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versions, setVersions] = useState([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const [titling, setTitling] = useState(false);
  const [cardModalOpen, setCardModalOpen] = useState(false);
  const [doodleModalOpen, setDoodleModalOpen] = useState(false);
  const [reading, setReading] = useState(false);
  const [editorText, setEditorText] = useState('');
  const isMobileEditor = useIsMobile();
  const [editMode, setEditMode] = useState(true);
  const ttsAudioRef = useRef(null);
  const ttsCancelRef = useRef(false);
  const editorWrapRef = useRef(null);

  useEffect(() => { setSaveStatus('idle'); }, [note.id]);

  // Reseed the suggestion source when switching notes so the bar doesn't keep
  // showing tags suggested for the previous note's content.
  useEffect(() => {
    setEditorText((note?.body || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  }, [note.id]);

  // Live LLM-suggested tags. Existing manual + auto tags and the note's
  // `type` (also rendered as a pill in the same bar) are excluded so
  // suggestions only show fresh adds.
  const existingTagSet = (note.tags || [])
    .concat(note.auto_tags || [])
    .concat(note.type ? [note.type] : []);
  const { suggestions: suggestedTags, dismiss: dismissSuggestion } = useTagSuggestions(
    editorText,
    existingTagSet
  );

async function handlePolish() {
    const ed = editorRef.current;
    if (!ed || !note?.id || polishing) return;
    const html = ed.getHTML();
    if (!html || html === '<p></p>') return;
    setPolishing(true);
    try {
      await apiFetch(`/api/notes/${note.id}/snapshot`, { method: 'POST' }).catch(() => {});

      // Strip card reading blocks before polishing — preserve them as placeholders
      const cardReadings = [];
      const strippedHtml = html.replace(/<div data-card-reading[^>]*><\/div>/g, (match) => {
        cardReadings.push(match);
        return `<!--card-reading-${cardReadings.length - 1}-->`;
      });

      const res = await apiFetch('/api/reflect/polish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: strippedHtml, format: 'html' }),
      });
      const data = await res.json();
      if (data.polished) {
        // Re-insert card reading blocks
        let polished = data.polished;
        cardReadings.forEach((block, i) => {
          polished = polished.replace(`<!--card-reading-${i}-->`, block);
        });

        ed.commands.setContent(polished, false);
        onChange(note.id, { body: polished });
        setSaveStatus('saved');
        clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setSaveStatus('idle'), 2000);
      }
    } catch (err) {
      console.error('Polish failed:', err);
    } finally {
      setPolishing(false);
    }
  }

  async function handleGenerateTitle() {
    const ed = editorRef.current;
    if (!ed || !note?.id || titling) return;
    const text = ed.getText();
    if (!text || text.trim().length < 10) return;
    setTitling(true);
    try {
      const res = await apiFetch('/api/reflect/title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (data.title) {
        onChange(note.id, { title: data.title });
      }
    } catch (err) {
      console.error('Title generation failed:', err);
    } finally {
      setTitling(false);
    }
  }

  async function handleReadAloud() {
    if (reading) { stopSpeak(ttsAudioRef, ttsCancelRef); setReading(false); return; }
    const ed = editorRef.current;
    const body = ed?.getText();
    const text = (note?.title ? note.title + '. ' : '') + (body || '');
    if (!text?.trim()) return;
    ttsCancelRef.current = false;
    setReading(true);
    await streamSpeak(text, ttsAudioRef, ttsCancelRef);
    setReading(false);
  }

  async function fetchVersions() {
    setVersionsLoading(true);
    try {
      const res = await apiFetch(`/api/notes/${note.id}/versions`);
      const data = await res.json();
      setVersions(Array.isArray(data) ? data : []);
    } catch {
      setVersions([]);
    } finally {
      setVersionsLoading(false);
    }
  }

  async function handleRestoreVersion(v) {
    const res = await apiFetch(`/api/notes/${note.id}/versions/${v.id}/restore`, { method: 'POST' });
    const data = await res.json();
    if (data.error) return;
    if (editorRef.current) editorRef.current.commands.setContent(data.body, false);
    onChange(note.id, { body: data.body });
    setVersionsOpen(false);
  }

  // On unmount: flush any pending save so switching notes never loses keystrokes
  useEffect(() => () => {
    clearTimeout(saveTimer.current);
    clearTimeout(savedTimer.current);
    if (pendingSave.current) {
      onChange(pendingSave.current.id, { body: pendingSave.current.body });
      pendingSave.current = null;
    }
  }, []);

  const editor = useEditor({
    extensions: [
      Document, Paragraph, Text, Bold, Italic, Strike, Code,
      Heading.configure({ levels: [1, 2, 3] }),
      BulletList, OrderedList, ListItem,
      HardBreak, HorizontalRule, Blockquote, History, Gapcursor,
      YoutubeEmbed,
      InstagramEmbed,
      ImageEmbed,
      DetailsBlock,
      MediaRow,
      CardReading,
      Placeholder.configure({
        placeholder: t(NOTE_PLACEHOLDER_KEYS[note.type] || 'notes.placeholderReflection'),
        emptyEditorClass: 'is-editor-empty',
      }),
    ],
    content: note.body || '',
    editorProps: {
      handleDOMEvents: { dragstart: atomDragGuard },
    },
    onUpdate: ({ editor }) => {
      const noteId = noteRef.current.id; // capture NOW
      const body = editor.getHTML();
      pendingSave.current = { id: noteId, body };
      setEditorText(editor.getText());

      setSaveStatus('saving');
      clearTimeout(saveTimer.current);
      clearTimeout(savedTimer.current);
      saveTimer.current = setTimeout(async () => {
        await onChange(noteId, { body });
        pendingSave.current = null;
        setSaveStatus('saved');
        savedTimer.current = setTimeout(() => setSaveStatus('idle'), 2000);
        // Snapshot at most once per minute, tied to actual saves
        const now = Date.now();
        if (!lastSnapshotAt.current || now - lastSnapshotAt.current >= 60_000) {
          lastSnapshotAt.current = now;
          apiFetch(`/api/notes/${noteId}/snapshot`, { method: 'POST' }).catch(() => {});
        }
      }, 800);
    },
  });

  // Keep editorRef stable for dictation
  const editorRef = useRef(null);
  useEffect(() => { editorRef.current = editor; }, [editor]);

  // Read-only by default; toggle via the pencil button in the toolbar.
  useEffect(() => {
    if (editor) editor.setEditable(editMode);
  }, [editor, editMode]);

  // Keep edit mode on when switching notes — users expect to type immediately.
  // (Previously reset to read-only on desktop, but that confused users.)

  const { isRecording, isProcessing, toggle: toggleDictation } = useDictation((text) => {
    editorRef.current?.chain().focus().insertContent(text + ' ').run();
  });

  const hasText = editor && editor.getText().trim().length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Formatting toolbar (with mic on right) */}
      <NoteToolbar
        editor={editor}
        saveStatus={saveStatus}
        onVersionsOpen={() => { setVersionsOpen(true); fetchVersions(); }}
        onCardPull={() => setCardModalOpen(true)}
        onDoodle={() => setDoodleModalOpen(true)}
        editMode={editMode}
        onToggleEditMode={() => setEditMode(v => !v)}
      />

      {/* Type selector row — like the TAGS bar in Journal */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        flexWrap: 'wrap',
        padding: '8px 14px',
        borderBottom: 'var(--border-style)',
        flexShrink: 0,
        background: 'var(--white)',
      }}>
        <TypeSelector
          note={note}
          customTags={customTags}
          suggestedTags={suggestedTags}
          onDismissSuggestion={dismissSuggestion}
          onChange={onChange}
        />
      </div>

      {/* Note title */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', padding: '14px 32px 0', flexShrink: 0 }}>
        <input
          style={{
            fontSize: '18px',
            fontWeight: '700',
            color: 'var(--strong)',
            border: 'none',
            outline: 'none',
            background: 'transparent',
            width: '100%',
            fontFamily: 'var(--font)',
            lineHeight: '1.3',
          }}
          value={note.title || ''}
          onChange={(e) => onChange(note.id, { title: e.target.value })}
          placeholder="Untitled"
        />
        <span style={{ fontSize: '11px', color: 'var(--muted)', flexShrink: 0, whiteSpace: 'nowrap' }}>
          {formatDate(note.created_at)}
        </span>
      </div>

      {/* Scrollable content */}
      <div ref={editorWrapRef} style={{ flex: 1, overflowY: 'auto', padding: '20px 48px 40px', position: 'relative' }}>
        <DefaultEditor note={note} editor={editor} />
        <div
          style={{ height: '240px', cursor: 'text' }}
          onMouseDown={(e) => {
            e.preventDefault();
            if (!editor) return;
            const lineHeight = 27;
            const lines = Math.max(1, Math.round((e.clientY - e.currentTarget.getBoundingClientRect().top) / lineHeight));
            editor.chain().focus('end').insertContent('<p></p>'.repeat(lines)).run();
          }}
        />
      </div>

      {/* Polish + Mic — fixed footer */}
      <div style={{ borderTop: 'var(--border-style)', padding: '14px 18px', flexShrink: 0, background: 'var(--white)', display: 'flex', gap: '10px', alignItems: 'center' }}>
        <button
          style={{
            flex: 1,
            fontSize: '12px',
            padding: '9px 0',
            fontWeight: '500',
            color: 'var(--white)',
            background: 'var(--strong)',
            borderRadius: '20px',
            cursor: (polishing || !hasText) ? 'default' : 'pointer',
            transition: 'opacity 0.15s',
            border: 'none',
            fontFamily: 'var(--font)',
            opacity: (polishing || !hasText) ? 0.35 : 1,
            boxShadow: '0 2px 4px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.1)',
          }}
          onClick={handlePolish}
          disabled={polishing || !hasText}
        >
          {polishing ? t('notes.polishing') : t('notes.polish')}
        </button>
        <button
          onClick={handleGenerateTitle}
          title="Generate title"
          disabled={titling || !hasText}
          style={{
            width: '36px',
            height: '36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '20px',
            border: 'none',
            background: 'var(--near-white)',
            color: 'var(--muted)',
            cursor: (titling || !hasText) ? 'default' : 'pointer',
            transition: 'color 0.15s, background 0.15s, opacity 0.15s',
            flexShrink: 0,
            opacity: (titling || !hasText) ? 0.35 : 1,
            boxShadow: '0 1px 3px rgba(0,0,0,0.08), inset 0 -1px 0 rgba(0,0,0,0.06)',
          }}
        >
          {titling ? <SpinnerIcon /> : <TitleIcon />}
        </button>
        <MicButton
          isRecording={isRecording}
          isProcessing={isProcessing}
          onClick={toggleDictation}
        />
        <button
          onClick={handleReadAloud}
          title={reading ? t('common.stop') : t('common.readAloud')}
          type="button"
          disabled={!hasText && !reading}
          style={{
            width: '36px',
            height: '36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '20px',
            border: 'none',
            background: reading ? 'rgba(0,0,0,0.06)' : 'var(--near-white)',
            color: reading ? 'var(--strong)' : 'var(--muted)',
            cursor: (!hasText && !reading) ? 'default' : 'pointer',
            transition: 'color 0.15s, background 0.15s',
            flexShrink: 0,
            opacity: (!hasText && !reading) ? 0.35 : 1,
            boxShadow: reading
              ? 'inset 0 1px 2px rgba(0,0,0,0.08)'
              : '0 1px 3px rgba(0,0,0,0.08), inset 0 -1px 0 rgba(0,0,0,0.06)',
          }}
        >
          <WaveformIcon playing={reading} />
        </button>
        {onTalkAboutNote && (
          <button
            onClick={() => onTalkAboutNote(note.id, note.linked_session_id)}
            title={note.linked_session_id ? t('notes.goToChat') : t('notes.talkAboutThis')}
            type="button"
            disabled={!hasText}
            style={{
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '20px',
              border: 'none',
              background: note.linked_session_id ? 'rgba(99,102,241,0.1)' : 'var(--near-white)',
              color: note.linked_session_id ? 'rgb(99,102,241)' : 'var(--muted)',
              cursor: !hasText ? 'default' : 'pointer',
              transition: 'color 0.15s, background 0.15s',
              flexShrink: 0,
              opacity: !hasText ? 0.35 : 1,
              boxShadow: '0 1px 3px rgba(0,0,0,0.08), inset 0 -1px 0 rgba(0,0,0,0.06)',
            }}
          >
            <ChatBubbleIcon linked={!!note.linked_session_id} />
          </button>
        )}
      </div>

      <VersionsPanel
        isOpen={versionsOpen}
        onClose={() => { setVersionsOpen(false); onVersionPreview?.(null); }}
        versions={versions}
        onRestore={handleRestoreVersion}
        onPreview={onVersionPreview}
        previewVersionId={previewVersionId}
        loading={versionsLoading}
        title={t('notes.noteVersions')}
      />

      {cardModalOpen && (
        <CardPullModal
          onClose={() => setCardModalOpen(false)}
          onInsert={(data) => {
            if (data.type === 'cardReading') {
              editorRef.current?.chain().focus().insertContent({
                type: 'cardReading',
                attrs: data.attrs,
              }).run();
            } else {
              editorRef.current?.chain().focus().insertContent(data).run();
            }
            setCardModalOpen(false);
          }}
          entryText={editorRef.current?.getText() || ''}
        />
      )}

      {doodleModalOpen && (
        <DoodleModal
          onClose={() => setDoodleModalOpen(false)}
          onInsert={(dataUrl) => {
            editorRef.current?.chain().focus().insertContent({
              type: 'imageEmbed',
              attrs: { src: dataUrl, alt: 'Doodle', width: '100%', analyzed: false },
            }).run();
            setDoodleModalOpen(false);
          }}
        />
      )}
    </div>
  );
}

// ── QuoteEditor ───────────────────────────────────────────────────────────────

function QuoteEditor({ note, onChange, editor }) {
  const { t } = useLanguage();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ position: 'relative' }}>
        <div style={{
          position: 'absolute',
          top: '-10px',
          left: '-8px',
          fontSize: '72px',
          lineHeight: 1,
          color: 'var(--panel-bg)',
          fontFamily: 'Georgia, serif',
          userSelect: 'none',
          pointerEvents: 'none',
          zIndex: 0,
        }}>
          "
        </div>
        <div className="note-editor-quote" style={{ position: 'relative', zIndex: 1, paddingTop: '8px' }}>
          <EditorContent editor={editor} />
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '18px', color: 'var(--muted)', fontFamily: 'Georgia, serif' }}>—</span>
        <input
          type="text"
          value={note.attribution || ''}
          onChange={(e) => onChange(note.id, { attribution: e.target.value })}
          placeholder={t('notes.attributionPlaceholder')}
          style={{
            flex: 1,
            fontSize: '13px',
            color: 'var(--body)',
            background: 'transparent',
            border: 'none',
            borderBottom: 'var(--border-style)',
            borderRadius: 0,
            padding: '4px 0',
          }}
        />
      </div>
    </div>
  );
}

// ── GoalEditor ────────────────────────────────────────────────────────────────

function GoalEditor({ note, onChange, editor }) {
  const { t } = useLanguage();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        <button
          style={{
            width: '18px',
            height: '18px',
            border: '1.5px solid var(--strong)',
            borderRadius: '2px',
            flexShrink: 0,
            marginTop: '4px',
            background: 'transparent',
          }}
          title={t('notes.markComplete')}
        />
        <div className="note-editor-default" style={{ flex: 1, fontSize: '15px', lineHeight: '1.7' }}>
          <EditorContent editor={editor} />
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{t('notes.targetDate')}</span>
        <input
          type="date"
          value={note.target_date || ''}
          onChange={(e) => onChange(note.id, { target_date: e.target.value })}
          style={{ fontSize: '12px', color: 'var(--body)' }}
        />
      </div>
    </div>
  );
}

// ── NoteMirrorPanel ───────────────────────────────────────────────────────────

function formatVersionDate(isoStr) {
  if (!isoStr) return '';
  const d = parseSqliteUtc(isoStr);
  const now = new Date();
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return `Today, ${time}`;
  if (d.toDateString() === new Date(now - 86400000).toDateString()) return `Yesterday, ${time}`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' + time;
}


function NoteMirrorPanel({ note, blocks, loading, error, onReflect, onUpdateBlock, onPatchBlock, onDeleteBlock, onAddBlock, previewVersion, onClearPreview }) {
  const { t } = useLanguage();
  const hasContent = note?.body?.trim();
  const [readingAll, setReadingAll] = useState(false);
  const ttsAudioRef = useRef(null);
  const readingCancelledRef = useRef(false);
  const [archetypeOpen, setArchetypeOpen] = useState(false);
  const [selectedArchetype, setSelectedArchetype] = useState('Auto');
  const archetypeRef = useRef(null);
  const [mirrorCustomArchetypes, setMirrorCustomArchetypes] = useState([]);
  const bodyRef = useRef(null);
  const [editMode, setEditMode] = useState(false);

  // Drop back to read-only when switching notes so the user doesn't
  // accidentally edit reflections of a note they just clicked into.
  useEffect(() => { setEditMode(false); }, [note?.id]);

  useEffect(() => () => {
    stopSpeak(ttsAudioRef, readingCancelledRef);
  }, []);

  // Load custom archetypes
  useEffect(() => {
    apiFetch('/api/portrait').then(r => r.json()).then(p => {
      if (p) {
        try {
          const custom = Array.isArray(p.custom_archetypes) ? p.custom_archetypes : JSON.parse(p.custom_archetypes || '[]');
          if (custom.length) setMirrorCustomArchetypes(custom);
        } catch {}
      }
    }).catch(() => {});
  }, []);

  // Close archetype popup on outside click
  useEffect(() => {
    if (!archetypeOpen) return;
    function handleClick(e) {
      if (archetypeRef.current && !archetypeRef.current.contains(e.target)) {
        setArchetypeOpen(false);
      }
    }
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [archetypeOpen]);

// Voice for read-all / selected-text reads:
  //  1. Dropdown selection (if non-Auto) — voice updates immediately, no re-reflect needed
  //  2. Else, common archetype across all blocks (from a prior single-archetype reflect)
  //  3. Else undefined → system default
  function activeReadArchetype() {
    if (selectedArchetype && selectedArchetype !== 'Auto') return selectedArchetype;
    if (!blocks.length) return undefined;
    const first = blocks[0]?.archetype;
    if (!first || first === 'Auto') return undefined;
    return blocks.every(b => b.archetype === first) ? first : undefined;
  }

  async function handleReadAll() {
    if (readingAll) { stopSpeak(ttsAudioRef, readingCancelledRef); setReadingAll(false); return; }
    if (!blocks.length) return;
    const fullText = blocks.map(b => [b.title, b.body, b.quote].filter(Boolean).join('. ')).filter(Boolean).join('\n\n');
    if (!fullText.trim()) return;
    readingCancelledRef.current = false;
    setReadingAll(true);
    await streamSpeak(fullText, ttsAudioRef, readingCancelledRef, { archetype: activeReadArchetype() });
    setReadingAll(false);
  }

const panelStyle = {
    width: '100%',
    height: '100%',
    background: 'var(--near-white)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    position: 'relative',
  };
  const headerStyle = {
    padding: '0 18px',
    height: '40px',
    borderBottom: 'var(--border-style)',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  };
  const pillBtn = {
    width: '36px',
    height: '36px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '20px',
    border: 'none',
    cursor: 'pointer',
    transition: 'color 0.15s, background 0.15s',
    flexShrink: 0,
  };

  if (previewVersion) {
    return (
      <div style={panelStyle}>
        <div style={headerStyle}>
          <div style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>
            {t('notes.versionPreview')}
          </div>
          <button
            onClick={onClearPreview}
            style={{ fontSize: '11px', color: 'var(--muted)', background: 'none', border: 'var(--border-style)', borderRadius: '2px', padding: '2px 8px', cursor: 'pointer', fontFamily: 'var(--font)' }}
          >
            {t('notes.closePreview')}
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>
          <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '12px', fontStyle: 'italic' }}>
            {formatVersionDate(previewVersion.saved_at)}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--body)', lineHeight: '1.85', whiteSpace: 'pre-wrap' }}>
            {previewVersion.body_text || '—'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>
          {t('notes.mirror')}
        </div>
      </div>

      {/* Blocks */}
      <div ref={bodyRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
        {loading && (
          <div style={{ padding: '40px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: '24px', color: 'var(--muted)', letterSpacing: '4px', animation: 'pulse 1.4s ease-in-out infinite' }}>· · ·</div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '12px' }}>{t('notes.readingNote')}</div>
          </div>
        )}

        {error && (
          <div style={{ padding: '16px 18px', fontSize: '12px', color: 'var(--muted)', fontStyle: 'italic' }}>
            {error}
          </div>
        )}

        {!loading && blocks.length === 0 && !error && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: '20px', marginBottom: '12px', color: 'var(--border)' }}>◎</div>
            <div style={{ fontSize: '12px', color: 'var(--body)', lineHeight: '1.8', marginBottom: '4px' }}>
              {note ? t('notes.reflectEmpty') : t('notes.reflectNoNote')}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', fontStyle: 'italic', lineHeight: '1.7' }}>
              {t('notes.mirrorTagline')}
            </div>
          </div>
        )}

        {blocks.map((block, i) => (
          <MirrorBlock
            key={i}
            block={block}
            overrideArchetype={selectedArchetype !== 'Auto' ? selectedArchetype : undefined}
            onChange={editMode && onUpdateBlock && note?.id ? (next) => onUpdateBlock(note.id, i, next) : undefined}
            onPatch={editMode && onPatchBlock && note?.id ? (patch) => onPatchBlock(note.id, i, patch) : undefined}
            onDelete={editMode && onDeleteBlock && note?.id ? () => onDeleteBlock(note.id, i) : undefined}
          />
        ))}
      </div>

      {/* Archetype picker popup */}
      {archetypeOpen && (
        <div ref={archetypeRef} style={{
          position: 'absolute',
          bottom: '64px',
          right: '18px',
          background: 'var(--white)',
          borderRadius: '12px',
          padding: '6px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.14), 0 0 0 1px rgba(0,0,0,0.06)',
          zIndex: 50,
          minWidth: '140px',
        }}>
          {BUILT_IN_ARCHETYPES.map((a) => (
            <button
              key={a.value}
              style={{
                display: 'flex',
                alignItems: 'center',
                width: '100%',
                textAlign: 'left',
                padding: '7px 14px',
                fontSize: '12px',
                color: selectedArchetype === a.value ? 'var(--strong)' : 'var(--body)',
                fontWeight: selectedArchetype === a.value ? '600' : '400',
                background: 'none',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontFamily: 'var(--font)',
                transition: 'background 0.1s',
              }}
              onClick={() => { setSelectedArchetype(a.value); setArchetypeOpen(false); }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--near-white)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <ArchetypeAvatar archetype={a} size={18} color={selectedArchetype === a.value ? 'var(--strong)' : 'var(--muted)'} />
              <span style={{ marginLeft: '8px' }}>{t(a.key)}</span>
            </button>
          ))}
          {mirrorCustomArchetypes.length > 0 && (
            <div style={{ height: '1px', background: 'var(--border)', margin: '4px 8px' }} />
          )}
          {mirrorCustomArchetypes.map((c) => (
            <button
              key={c.name}
              style={{
                display: 'flex',
                alignItems: 'center',
                width: '100%',
                textAlign: 'left',
                padding: '7px 14px',
                fontSize: '12px',
                color: selectedArchetype === c.name ? 'var(--strong)' : 'var(--body)',
                fontWeight: selectedArchetype === c.name ? '600' : '400',
                background: 'none',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontFamily: 'var(--font)',
                transition: 'background 0.1s',
              }}
              onClick={() => { setSelectedArchetype(c.name); setArchetypeOpen(false); }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--near-white)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <ArchetypeAvatar archetype={{ value: c.name }} size={18} color={c.color || 'var(--muted)'} />
              <span style={{ marginLeft: '8px' }}>{c.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Footer */}
      <div style={{
        padding: '14px 18px',
        borderTop: 'var(--border-style)',
        flexShrink: 0,
        display: 'flex',
        gap: '10px',
        alignItems: 'center',
      }}>
        <button
          className="btn-primary"
          style={{ flex: 1, fontSize: '12px', padding: '9px 0', borderRadius: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.1)', opacity: (!hasContent || loading) ? 0.45 : 1 }}
          onClick={() => onReflect(selectedArchetype)}
          disabled={!hasContent || loading}
        >
          {loading ? t('notes.reflecting') : t('notes.reflect')}
        </button>

        {/* Edit mode toggle */}
        <button
          onClick={() => setEditMode(v => !v)}
          title={editMode ? (t('common.done') || 'Done') : (t('common.edit') || 'Edit')}
          type="button"
          disabled={blocks.length === 0}
          style={{
            ...pillBtn,
            background: editMode ? 'rgba(0,0,0,0.06)' : 'var(--near-white)',
            color: editMode ? 'var(--strong)' : 'var(--muted)',
            cursor: blocks.length === 0 ? 'default' : 'pointer',
            opacity: blocks.length === 0 ? 0.35 : 1,
            boxShadow: editMode
              ? 'inset 0 1px 2px rgba(0,0,0,0.08)'
              : '0 1px 3px rgba(0,0,0,0.08), inset 0 -1px 0 rgba(0,0,0,0.06)',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <path d="M11.5 2.5l2 2-8 8H3.5v-2l8-8z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
        </button>

        {/* Add manual block — only in edit mode */}
        {onAddBlock && editMode && (
          <button
            onClick={() => onAddBlock(note?.id)}
            title={t('mirror.addBlock')}
            type="button"
            disabled={!note?.id}
            style={{
              ...pillBtn,
              background: 'var(--near-white)',
              color: 'var(--muted)',
              cursor: note?.id ? 'pointer' : 'default',
              opacity: note?.id ? 1 : 0.35,
              boxShadow: '0 1px 3px rgba(0,0,0,0.08), inset 0 -1px 0 rgba(0,0,0,0.06)',
              fontSize: '18px',
              fontWeight: '300',
              lineHeight: 1,
              paddingBottom: '2px',
            }}
          >+</button>
        )}

        {/* Archetype picker button */}
        <button
          onClick={(e) => { e.stopPropagation(); setArchetypeOpen(!archetypeOpen); }}
          title={t(BUILT_IN_ARCHETYPES.find(a => a.value === selectedArchetype)?.key || 'archetype.auto')}
          type="button"
          style={{
            ...pillBtn,
            background: archetypeOpen ? 'rgba(0,0,0,0.06)' : 'var(--near-white)',
            color: selectedArchetype !== 'Auto' ? 'var(--strong)' : 'var(--muted)',
            boxShadow: archetypeOpen
              ? 'inset 0 1px 2px rgba(0,0,0,0.08)'
              : '0 1px 3px rgba(0,0,0,0.08), inset 0 -1px 0 rgba(0,0,0,0.06)',
          }}
        >
          {(() => {
            const builtIn = BUILT_IN_ARCHETYPES.find(a => a.value === selectedArchetype);
            const custom = mirrorCustomArchetypes.find(a => a.name === selectedArchetype);
            if (builtIn) return <ArchetypeAvatar archetype={builtIn} size={20} color={selectedArchetype !== 'Auto' ? 'var(--strong)' : 'var(--muted)'} />;
            if (custom) return <ArchetypeAvatar archetype={{ value: custom.name }} size={20} color={custom.color || 'var(--strong)'} />;
            return <ArchetypeIcon />;
          })()}
        </button>

        {/* Read all button */}
        <button
          onClick={handleReadAll}
          title={readingAll ? t('common.stop') : t('common.readAloud')}
          type="button"
          disabled={blocks.length === 0 && !readingAll}
          style={{
            ...pillBtn,
            background: readingAll ? 'rgba(0,0,0,0.06)' : 'var(--near-white)',
            color: readingAll ? 'var(--strong)' : 'var(--muted)',
            cursor: (blocks.length === 0 && !readingAll) ? 'default' : 'pointer',
            opacity: (blocks.length === 0 && !readingAll) ? 0.35 : 1,
            boxShadow: readingAll
              ? 'inset 0 1px 2px rgba(0,0,0,0.08)'
              : '0 1px 3px rgba(0,0,0,0.08), inset 0 -1px 0 rgba(0,0,0,0.06)',
          }}
        >
          <WaveformIcon playing={readingAll} />
        </button>
      </div>
    </div>
  );
}

// ── DefaultEditor ─────────────────────────────────────────────────────────────

function DefaultEditor({ note, editor }) {
  const className = 'note-editor-default';
  return (
    <div className={className} style={{ fontSize: '15px', lineHeight: '1.8' }}>
      <EditorContent editor={editor} />
    </div>
  );
}

function TitleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="2" y1="3" x2="12" y2="3" />
      <line x1="2" y1="7" x2="9" y2="7" />
      <line x1="2" y1="11" x2="6" y2="11" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M7 1a6 6 0 0 1 6 6" opacity="0.3">
        <animateTransform attributeName="transform" type="rotate" from="0 7 7" to="360 7 7" dur="0.8s" repeatCount="indefinite" />
      </path>
    </svg>
  );
}

function ChatBubbleIcon({ linked }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H6l-3 3V11H4a2 2 0 0 1-2-2V3z" />
      {linked && <circle cx="8" cy="6" r="1.5" fill="currentColor" stroke="none" />}
    </svg>
  );
}

function WaveformIcon({ playing }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1" y={playing ? 2 : 4} width="2" height={playing ? 10 : 6} rx="1" fill="currentColor">
        {playing && <animate attributeName="height" values="10;4;10" dur="0.8s" repeatCount="indefinite" />}
      </rect>
      <rect x="4.5" y={playing ? 0 : 2} width="2" height={playing ? 14 : 10} rx="1" fill="currentColor">
        {playing && <animate attributeName="height" values="14;6;14" dur="0.6s" repeatCount="indefinite" />}
      </rect>
      <rect x="8" y={playing ? 3 : 4} width="2" height={playing ? 8 : 6} rx="1" fill="currentColor">
        {playing && <animate attributeName="height" values="8;12;8" dur="0.9s" repeatCount="indefinite" />}
      </rect>
      <rect x="11.5" y={playing ? 1 : 3} width="2" height={playing ? 12 : 8} rx="1" fill="currentColor">
        {playing && <animate attributeName="height" values="12;5;12" dur="0.7s" repeatCount="indefinite" />}
      </rect>
    </svg>
  );
}

function ArchetypeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="4.5" r="2.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3 14c0-2.76 2.24-5 5-5s5 2.24 5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function NoteArchetypeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M3 14c0-2.8 2.2-5 5-5s5 2.2 5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
