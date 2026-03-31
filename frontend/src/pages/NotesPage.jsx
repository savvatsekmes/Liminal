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
import Placeholder from '@tiptap/extension-placeholder';
import { useNotes } from '../hooks/useNotes';
import { useDictation } from '../hooks/useDictation';
import { YoutubeEmbed } from '../extensions/YoutubeEmbed';
import { ImageEmbed } from '../extensions/ImageEmbed';
import { apiFetch } from '../utils/api';
import MirrorBlock from '../components/MirrorBlock';
import MicButton from '../components/MicButton';
import CardPullModal from '../components/CardPullModal';
import DoodleModal from '../components/DoodleModal';
import { CardReading } from '../extensions/CardReading';
import VersionsPanel from '../components/VersionsPanel';
import { useResizable } from '../hooks/useResizable';
import { BUILT_IN_ARCHETYPES } from '../constants/archetypes';
import ArchetypeAvatar from '../components/ArchetypeAvatar';
import ResizeDivider from '../components/ResizeDivider';
import { useLanguage } from '../i18n/LanguageContext';

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
  return new Date(iso).toLocaleDateString('en-AU', { day: '2-digit', month: 'short' });
}

export default function NotesPage({ initialNoteId, onNoteSelected }) {
  const { t } = useLanguage();
  const {
    notes,
    activeNote,
    filterType,
    filterCustomTag,
    customTags,
    createNote,
    scheduleUpdate,
    deleteNote,
    deleteCustomTag,
    selectNote,
    changeFilter,
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
  const [reflectBlocks, setReflectBlocks] = useState([]);
  const [reflecting, setReflecting] = useState(false);
  const [reflectError, setReflectError] = useState(null);
  const [previewVersion, setPreviewVersion] = useState(null);
  const newTagRef = useRef(null);

  const [noteListWidth, startNoteListDrag] = useResizable(210, { min: 140, max: 380 });
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

  async function handleReflect() {
    if (!activeNote?.id) return;
    setReflecting(true);
    setReflectError(null);
    try {
      const res = await apiFetch(`/api/notes/${activeNote.id}/reflect`, { method: 'POST' });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setReflectBlocks(data.blocks || []);
    } catch (err) {
      setReflectError(err.message);
    } finally {
      setReflecting(false);
    }
  }

  function handleCreateNote() {
    const type = filterType === 'all' ? 'idea' : filterType;
    const customTag = filterType === 'custom' ? filterCustomTag : null;
    createNote(type, customTag);
  }

  function handleNewCustomTag(e) {
    if (e.key === 'Enter' && newTagInput.trim()) {
      const tag = newTagInput.trim();
      setNewTagInput('');
      setShowNewTagInput(false);
      createNote('custom', tag).then(refreshCustomTags);
      changeFilter('custom', tag);
    }
    if (e.key === 'Escape') {
      setNewTagInput('');
      setShowNewTagInput(false);
    }
  }

  function openConfirm(message, onConfirm) {
    setConfirmModal({ message, onConfirm });
  }

  const activeIsCustom = filterType === 'custom';

  return (
    <div style={{ display: 'flex', flex: 1, height: '100%', overflow: 'hidden', minWidth: 0 }}>
      {/* Note list */}
      <div style={{
        width: noteListWidth + 'px',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--near-white)',
      }}>
        {/* List header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 14px 10px',
          borderBottom: 'var(--border-style)',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--strong)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            {filterType === 'custom' && filterCustomTag
              ? filterCustomTag
              : filterType === 'all' ? t('notes.title') : filterType.charAt(0).toUpperCase() + filterType.slice(1) + 's'}
          </span>
          <button
            onClick={handleCreateNote}
            title={t('notes.newNote')}
            style={{ fontSize: '18px', color: 'var(--muted)', lineHeight: 1 }}
          >
            +
          </button>
        </div>

        {/* Note items */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {notes.length === 0 && (
            <div style={{ padding: '24px 14px', fontSize: '12px', color: 'var(--muted)', fontStyle: 'italic' }}>
              {t('notes.noNotes')}
            </div>
          )}
          {notes.map((note) => (
            <NoteListItem
              key={note.id}
              note={note}
              active={activeNote?.id === note.id}
              onClick={() => selectNote(note)}
              onDelete={() => openConfirm(t('notes.deleteConfirm'), () => deleteNote(note.id))}
            />
          ))}
        </div>
      </div>

      {/* Tag strip */}
      <div style={{
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
            label={t(labelKey)}
            active={filterType === type && !activeIsCustom}
            onClick={() => changeFilter(type)}
          />
        ))}

        {customTags.length > 0 && (
          <div style={{ width: '100%', borderTop: 'var(--border-style)', margin: '6px 0' }} />
        )}

        {customTags.map((tag) => (
          <CustomTagPill
            key={tag}
            label={tag}
            active={filterType === 'custom' && filterCustomTag === tag}
            onClick={() => changeFilter('custom', tag)}
            onDelete={() => openConfirm(
              t('notes.deleteTagConfirm', { tag }),
              () => deleteCustomTag(tag)
            )}
          />
        ))}

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
      </div>

      <ResizeDivider onMouseDown={startNoteListDrag} />

      {/* Editor + mirror area */}
      <div ref={editorMirrorRef} style={{ flex: 1, display: 'flex', minWidth: 0, overflow: 'hidden' }}>
        {/* Note editor */}
        <div style={{ width: `${100 - mirrorPct}%`, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--white)' }}>
          {activeNote ? (
            <NoteEditor
              key={activeNote.id}
              note={activeNote}
              onChange={scheduleUpdate}
              customTags={customTags}
              onVersionPreview={setPreviewVersion}
              previewVersionId={previewVersion?.id}
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

        <ResizeDivider onMouseDown={(e) => startMirrorDrag(e)} inverted />
        {/* Note mirror panel */}
        <div style={{ width: `${mirrorPct}%`, minWidth: 0, overflow: 'hidden' }}>
        <NoteMirrorPanel
          note={activeNote}
          blocks={reflectBlocks}
          loading={reflecting}
          error={reflectError}
          onReflect={handleReflect}
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
              padding: '7px 16px',
              fontSize: '12px',
              border: 'var(--border-style)',
              borderRadius: '2px',
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
              borderRadius: '2px',
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

function TypePill({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '62px',
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
      }}
    >
      {label}
    </button>
  );
}

// ── CustomTagPill ─────────────────────────────────────────────────────────────

function CustomTagPill({ label, active, onClick, onDelete }) {
  const { t } = useLanguage();
  const [hover, setHover] = useState(false);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        width: '62px',
        borderRadius: '20px',
        border: active ? '1px solid var(--strong)' : '1px solid var(--border)',
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
          letterSpacing: '0.03em',
          background: 'none',
          border: 'none',
          color: active ? 'var(--white)' : 'var(--body)',
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
        {label}
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

function NoteListItem({ note, active, onClick, onDelete }) {
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
        padding: '10px 14px',
        cursor: 'pointer',
        borderBottom: 'var(--border-style)',
        background: active ? 'var(--panel-bg)' : 'transparent',
        transition: 'background 0.1s',
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px' }}>
        <span style={{ fontSize: '10px', color: 'var(--muted)' }}>
          {note.type === 'custom' && note.custom_tag ? note.custom_tag : note.type}
        </span>
        <span style={{ fontSize: '10px', color: 'var(--border)', marginLeft: 'auto' }}>
          {formatDate(note.created_at)}
        </span>
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
        {preview}
      </div>
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

function TypeSelector({ note, customTags, onChange }) {
  const { t } = useLanguage();
  function selectType(type, customTag = null) {
    onChange(note.id, { type, custom_tag: customTag });
  }

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

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap', flex: 1, marginRight: '16px' }}>
      {BUILT_IN_NOTE_TYPES.map((typ) => {
        const active = note.type === typ;
        return (
          <button
            key={typ}
            style={{ ...pillBase, ...(active ? pillActive : {}) }}
            onClick={() => selectType(typ)}
          >
            {t(TYPE_LABEL_KEYS[typ])}
          </button>
        );
      })}

      {customTags.length > 0 && (
        <div style={{ width: '1px', height: '14px', background: 'var(--border)', flexShrink: 0, margin: '0 2px' }} />
      )}

      {customTags.map((tag) => {
        const active = note.type === 'custom' && note.custom_tag === tag;
        return (
          <button
            key={tag}
            style={{ ...pillBase, ...(active ? pillActive : {}) }}
            onClick={() => selectType('custom', tag)}
          >
            {tag}
          </button>
        );
      })}
    </div>
  );
}

// ── NoteToolbar ───────────────────────────────────────────────────────────────

function noteWordCount(text) {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function NoteToolbar({ editor, saveStatus, onVersionsOpen, onCardPull, onDoodle }) {
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
      {btn('Quote',         editor.isActive('blockquote'),   () => editor.chain().focus().toggleBlockquote().run(),   '"')}
      <div style={divider} />
      {btn('Horizontal rule', false, () => editor.chain().focus().setHorizontalRule().run(), '—')}
      <div style={divider} />
      {btn(t('cards.pullCards'), false, () => onCardPull?.(), <svg width="12" height="15" viewBox="0 0 12 15" fill="none" stroke="currentColor" strokeWidth="1"><rect x="0.5" y="0.5" width="11" height="14" rx="1.5"/><rect x="1.5" y="1.5" width="9" height="12" rx="1" strokeWidth="0.6"/><polygon points="6,3.5 8,7.5 6,11 4,7.5" fill="currentColor" stroke="none"/></svg>)}
      {btn(t('doodle.title'), false, () => onDoodle?.(), <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12L1 13L3 12L12 3L11 2L2 11Z" /><path d="M10 3L11 4" /></svg>)}
      <div style={{ flex: 1 }} />
      <button
        style={{ ...btnStyle, fontSize: '14px', marginRight: '2px' }}
        title={t('notes.versionHistory')}
        onClick={onVersionsOpen}
        type="button"
      >
        ◷
      </button>
      <span style={{ fontSize: '11px', color: 'var(--muted)', flexShrink: 0, marginRight: '4px' }}>
        {t('common.words', { count: words })}
      </span>
      {saveStatus !== 'idle' && (
        <span style={{ fontSize: '11px', color: 'var(--muted)', flexShrink: 0, marginRight: '4px' }}>
          {saveStatus === 'saving' ? t('common.saving') : '✓ ' + t('common.saved')}
        </span>
      )}
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

function NoteEditor({ note, onChange, customTags, onVersionPreview, previewVersionId }) {
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
  const [cardModalOpen, setCardModalOpen] = useState(false);
  const [doodleModalOpen, setDoodleModalOpen] = useState(false);
  const [reading, setReading] = useState(false);
  const ttsAudioRef = useRef(null);
  const [contextPopup, setContextPopup] = useState(null);
  const editorWrapRef = useRef(null);
  const contextPopupRef = useRef(null);

  useEffect(() => { setSaveStatus('idle'); }, [note.id]);

  // Close context popup on click outside
  useEffect(() => {
    if (!contextPopup) return;
    function close(e) {
      if (contextPopupRef.current && contextPopupRef.current.contains(e.target)) return;
      setContextPopup(null);
    }
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [contextPopup]);

  const handleEditorContextMenu = useCallback((e) => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      setContextPopup(null);
      return;
    }
    const text = sel.toString().trim();
    if (editorWrapRef.current && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      if (!editorWrapRef.current.contains(range.commonAncestorContainer)) {
        setContextPopup(null);
        return;
      }
      const rootRect = editorWrapRef.current.getBoundingClientRect();
      setContextPopup({
        x: e.clientX - rootRect.left,
        y: e.clientY - rootRect.top,
        below: e.clientY > window.innerHeight * 0.6,
        text,
      });
    }
  }, []);

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

  async function handleReadAloud() {
    if (reading) {
      if (ttsAudioRef.current) { ttsAudioRef.current.pause(); ttsAudioRef.current = null; }
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      setReading(false);
      return;
    }
    const ed = editorRef.current;
    const text = ed?.getText();
    if (!text?.trim()) return;

    try {
      setReading(true);
      const res = await fetch('/api/tts/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, exaggeration: 0.5 }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        ttsAudioRef.current = audio;
        audio.onended = () => { setReading(false); URL.revokeObjectURL(url); };
        audio.onerror = () => { setReading(false); };
        await audio.play();
        return;
      }
    } catch {}

    if (window.speechSynthesis) {
      const utt = new SpeechSynthesisUtterance(text);
      utt.onend = () => setReading(false);
      utt.onerror = () => setReading(false);
      window.speechSynthesis.speak(utt);
    } else {
      setReading(false);
    }
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
      HardBreak, HorizontalRule, Blockquote, History,
      YoutubeEmbed,
      ImageEmbed,
      CardReading,
      Placeholder.configure({
        placeholder: t(NOTE_PLACEHOLDER_KEYS[note.type] || 'notes.placeholderReflection'),
        emptyEditorClass: 'is-editor-empty',
      }),
    ],
    content: note.body || '',
    onUpdate: ({ editor }) => {
      const noteId = noteRef.current.id; // capture NOW
      const body = editor.getHTML();
      pendingSave.current = { id: noteId, body };

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
          onChange={onChange}
        />
      </div>

      {/* Scrollable content */}
      <div ref={editorWrapRef} onContextMenu={handleEditorContextMenu} style={{ flex: 1, overflowY: 'auto', padding: '20px 48px 40px', position: 'relative' }}>
        {note.type === 'quote' && (
          <QuoteEditor note={note} onChange={onChange} editor={editor} />
        )}
        {note.type === 'goal' && (
          <GoalEditor note={note} onChange={onChange} editor={editor} />
        )}
        {(note.type === 'idea' || note.type === 'reflection' || note.type === 'dream' ||
          note.type === 'gratitude' || note.type === 'custom' || note.type === 'none') && (
          <DefaultEditor note={note} editor={editor} />
        )}
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

        {/* Right-click read-aloud popup */}
        {contextPopup && (
          <div ref={contextPopupRef} style={{
            position: 'absolute',
            left: `${contextPopup.x}px`,
            top: contextPopup.below ? `${contextPopup.y + 11}px` : `${contextPopup.y - 11}px`,
            transform: contextPopup.below ? 'translate(0, 0)' : 'translate(0, -100%)',
            display: 'flex',
            alignItems: 'center',
            gap: '2px',
            zIndex: 100,
            userSelect: 'none',
            background: 'var(--white)',
            borderRadius: '20px',
            padding: '3px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.06)',
          }}>
            <div
              style={{
                color: 'var(--body)',
                fontSize: '11px',
                fontWeight: '500',
                borderRadius: '16px',
                padding: '5px 12px',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                fontFamily: 'var(--font)',
                transition: 'background 0.12s',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
              onClick={() => {
                const text = contextPopup.text;
                setContextPopup(null);
                (async () => {
                  try {
                    const res = await fetch('/api/tts/speak', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ text, exaggeration: 0.5 }),
                    });
                    if (res.ok) {
                      const blob = await res.blob();
                      const url = URL.createObjectURL(blob);
                      const audio = new Audio(url);
                      audio.onended = () => URL.revokeObjectURL(url);
                      await audio.play();
                      return;
                    }
                  } catch {}
                  if (window.speechSynthesis) {
                    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
                  }
                })();
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--near-white)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <WaveformIcon playing={false} /> {t('common.readAloud')}
            </div>
          </div>
        )}
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
  const d = new Date(isoStr);
  const now = new Date();
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return `Today, ${time}`;
  if (d.toDateString() === new Date(now - 86400000).toDateString()) return `Yesterday, ${time}`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' + time;
}


function NoteMirrorPanel({ note, blocks, loading, error, onReflect, previewVersion, onClearPreview }) {
  const { t } = useLanguage();
  const hasContent = note?.body?.trim();
  const [readingAll, setReadingAll] = useState(false);
  const ttsAudioRef = useRef(null);
  const readingCancelledRef = useRef(false);
  const [archetypeOpen, setArchetypeOpen] = useState(false);
  const [selectedArchetype, setSelectedArchetype] = useState('Auto');
  const archetypeRef = useRef(null);
  const [mirrorCustomArchetypes, setMirrorCustomArchetypes] = useState([]);
  const [contextPopup, setContextPopup] = useState(null);
  const bodyRef = useRef(null);
  const mirrorContextRef = useRef(null);

  useEffect(() => () => {
    readingCancelledRef.current = true;
    if (ttsAudioRef.current) { ttsAudioRef.current.pause(); ttsAudioRef.current = null; }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
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

  // Close context popup on click outside
  useEffect(() => {
    if (!contextPopup) return;
    function close(e) {
      if (mirrorContextRef.current && mirrorContextRef.current.contains(e.target)) return;
      setContextPopup(null);
    }
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [contextPopup]);

  const handleContextMenu = useCallback((e) => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      setContextPopup(null);
      return;
    }
    const text = sel.toString().trim();
    if (bodyRef.current && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      if (!bodyRef.current.contains(range.commonAncestorContainer)) {
        setContextPopup(null);
        return;
      }
      const rootRect = bodyRef.current.closest('[style]')?.getBoundingClientRect() || { left: 0, top: 0 };
      setContextPopup({
        x: e.clientX - rootRect.left,
        y: e.clientY - rootRect.top,
        below: e.clientY > window.innerHeight * 0.6,
        text,
      });
    }
  }, []);

  async function handleReadAll() {
    if (readingAll) {
      readingCancelledRef.current = true;
      if (ttsAudioRef.current) { ttsAudioRef.current.pause(); ttsAudioRef.current = null; }
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      setReadingAll(false);
      return;
    }
    if (!blocks.length) return;

    const fullText = blocks.map(b => b.body).filter(Boolean).join('\n\n');
    if (!fullText.trim()) return;

    readingCancelledRef.current = false;
    setReadingAll(true);

    try {
      const res = await fetch('/api/tts/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: fullText, exaggeration: 0.5 }),
      });
      if (res.ok && !readingCancelledRef.current) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        ttsAudioRef.current = audio;
        audio.onended = () => { setReadingAll(false); URL.revokeObjectURL(url); };
        audio.onerror = () => { setReadingAll(false); };
        await audio.play();
        return;
      }
    } catch {}

    if (readingCancelledRef.current) return;

    if (window.speechSynthesis) {
      const utt = new SpeechSynthesisUtterance(fullText);
      utt.onend = () => setReadingAll(false);
      utt.onerror = () => setReadingAll(false);
      window.speechSynthesis.speak(utt);
    } else {
      setReadingAll(false);
    }
  }

  function readSelectedText(text) {
    setContextPopup(null);
    (async () => {
      try {
        const res = await fetch('/api/tts/speak', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, exaggeration: 0.5 }),
        });
        if (res.ok) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audio.onended = () => URL.revokeObjectURL(url);
          await audio.play();
          return;
        }
      } catch {}
      if (window.speechSynthesis) {
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
      }
    })();
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
      <div ref={bodyRef} onContextMenu={handleContextMenu} style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
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
          <MirrorBlock key={i} block={block} />
        ))}
      </div>

      {/* Right-click read-aloud popup */}
      {contextPopup && (
        <div ref={mirrorContextRef} style={{
          position: 'absolute',
          left: `${contextPopup.x}px`,
          top: contextPopup.below ? `${contextPopup.y + 11}px` : `${contextPopup.y - 11}px`,
          transform: contextPopup.below ? 'translate(0, 0)' : 'translate(0, -100%)',
          display: 'flex',
          alignItems: 'center',
          gap: '2px',
          zIndex: 100,
          userSelect: 'none',
          background: 'var(--white)',
          borderRadius: '20px',
          padding: '3px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.06)',
        }}>
          <div
            style={{
              color: 'var(--body)',
              fontSize: '11px',
              fontWeight: '500',
              borderRadius: '16px',
              padding: '5px 12px',
              whiteSpace: 'nowrap',
              cursor: 'pointer',
              fontFamily: 'var(--font)',
              transition: 'background 0.12s',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
            }}
            onClick={() => readSelectedText(contextPopup.text)}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--near-white)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <WaveformIcon playing={false} /> {t('common.readAloud')}
          </div>
        </div>
      )}

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
          onClick={onReflect}
          disabled={!hasContent || loading}
        >
          {loading ? t('notes.reflecting') : t('notes.reflect')}
        </button>

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
  const className = note.type === 'dream' ? 'note-editor-dream' : 'note-editor-default';
  return (
    <div className={className} style={{ fontSize: '15px', lineHeight: '1.8' }}>
      <EditorContent editor={editor} />
    </div>
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
