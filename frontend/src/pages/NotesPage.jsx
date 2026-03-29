import { useState, useRef, useEffect } from 'react';
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
import History from '@tiptap/extension-history';
import Placeholder from '@tiptap/extension-placeholder';
import { useNotes } from '../hooks/useNotes';
import { useDictation } from '../hooks/useDictation';
import { YoutubeEmbed } from '../extensions/YoutubeEmbed';
import { ImageEmbed } from '../extensions/ImageEmbed';
import { apiFetch } from '../utils/api';
import MirrorBlock from '../components/MirrorBlock';
import MicButton from '../components/MicButton';
import VersionsPanel from '../components/VersionsPanel';
import { useResizable } from '../hooks/useResizable';
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
  const [mirrorPanelWidth, startMirrorDrag] = useResizable(
    Math.floor((window.innerWidth - 48 - 76 - 210) / 2),
    { min: 180, max: window.innerWidth - 48 - 76 - 210 - 200 },
  );

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

      {/* Note editor */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--white)' }}>
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

      <ResizeDivider onMouseDown={startMirrorDrag} inverted />
      {/* Note mirror panel */}
      <div style={{ width: mirrorPanelWidth + 'px', flexShrink: 0, overflow: 'hidden' }}>
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

function NoteToolbar({ editor, isRecording, isProcessing, onToggleDictation, saveStatus, onVersionsOpen }) {
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
      <div style={divider} />
      {btn('Horizontal rule', false, () => editor.chain().focus().setHorizontalRule().run(), '—')}
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
      <MicButton isRecording={isRecording} isProcessing={isProcessing} onClick={onToggleDictation} />
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

  useEffect(() => { setSaveStatus('idle'); }, [note.id]);

  async function handlePolish() {
    const ed = editorRef.current;
    if (!ed || !note?.id || polishing) return;
    const html = ed.getHTML();
    if (!html || html === '<p></p>') return;
    setPolishing(true);
    try {
      await apiFetch(`/api/notes/${note.id}/snapshot`, { method: 'POST' }).catch(() => {});
      const res = await apiFetch('/api/reflect/polish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: html, format: 'html' }),
      });
      const data = await res.json();
      if (data.polished) {
        ed.commands.setContent(data.polished, false);
        onChange(note.id, { body: data.polished });
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
      HardBreak, HorizontalRule, History,
      YoutubeEmbed,
      ImageEmbed,
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Formatting toolbar (with mic on right) */}
      <NoteToolbar
        editor={editor}
        isRecording={isRecording}
        isProcessing={isProcessing}
        onToggleDictation={toggleDictation}
        saveStatus={saveStatus}
        onVersionsOpen={() => { setVersionsOpen(true); fetchVersions(); }}
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
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 48px 40px' }}>
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
      </div>

      {/* Polish button — fixed footer */}
      {editor && editor.getText().trim().length > 0 && (
        <div style={{ borderTop: 'var(--border-style)', padding: '14px 18px', flexShrink: 0, background: 'var(--white)' }}>
          <button
            style={{
              width: '100%',
              fontSize: '12px',
              padding: '9px 0',
              fontWeight: '500',
              color: 'var(--white)',
              background: 'var(--strong)',
              borderRadius: '2px',
              cursor: polishing ? 'default' : 'pointer',
              transition: 'opacity 0.15s',
              border: 'none',
              fontFamily: 'var(--font)',
              opacity: polishing ? 0.55 : 1,
            }}
            onClick={handlePolish}
            disabled={polishing}
          >
            {polishing ? t('notes.polishing') : t('notes.polish')}
          </button>
        </div>
      )}

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
  const panelStyle = {
    width: '100%',
    height: '100%',
    background: 'var(--near-white)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
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
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
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
            ttsOnline={false}
          />
        ))}
      </div>

      {/* Footer */}
      <div style={{
        padding: '14px 18px',
        borderTop: 'var(--border-style)',
        flexShrink: 0,
      }}>
        <button
          className="btn-primary"
          style={{ width: '100%', fontSize: '12px', padding: '9px 0', opacity: (!hasContent || loading) ? 0.45 : 1 }}
          onClick={onReflect}
          disabled={!hasContent || loading}
        >
          {loading ? t('notes.reflecting') : t('notes.reflect')}
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
