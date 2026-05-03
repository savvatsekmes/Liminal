import { useEffect, useRef, useState } from 'react';
import { useDictation } from '../hooks/useDictation';
import { useTagSuggestions } from '../hooks/useTagSuggestions';
import { tagLabel, IMG_EMOJI } from '../utils/tagEmoji';

function TagLabel({ tag }) {
  const src = IMG_EMOJI[tag.toLowerCase()];
  if (src) return <><img src={src} alt="" style={{ width: '12px', height: '12px', verticalAlign: '-2px' }} /> {tag}</>;
  return tagLabel(tag);
}
import MicButton from './MicButton';
import { useCrisisGate } from './CrisisGate';
import { YoutubeEmbed } from '../extensions/YoutubeEmbed';
import { InstagramEmbed } from '../extensions/InstagramEmbed';
import { ImageEmbed } from '../extensions/ImageEmbed';
import { DetailsBlock } from '../extensions/DetailsBlock';
import { MediaRow } from '../extensions/MediaRow';
import { useEditor, EditorContent } from '@tiptap/react';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import Bold from '@tiptap/extension-bold';
import Italic from '@tiptap/extension-italic';
import Strike from '@tiptap/extension-strike';
import Heading from '@tiptap/extension-heading';
import BulletList from '@tiptap/extension-bullet-list';
import OrderedList from '@tiptap/extension-ordered-list';
import ListItem from '@tiptap/extension-list-item';
import HardBreak from '@tiptap/extension-hard-break';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import History from '@tiptap/extension-history';
import Gapcursor from '@tiptap/extension-gapcursor';
import { TextIndent } from '../extensions/TextIndent';
import Placeholder from '@tiptap/extension-placeholder';
import Code from '@tiptap/extension-code';
import Blockquote from '../extensions/Blockquote';
import VersionsPanel from './VersionsPanel';
import CardPullModal from './CardPullModal';
import DoodleModal from './DoodleModal';
import { CardReading } from '../extensions/CardReading';
import { atomDragGuard } from '../extensions/atomDragGuard';
import { apiFetch } from '../utils/api';
import { lockbug } from '../utils/lockbugLog';
import { streamSpeak, stopSpeak } from '../utils/ttsStream';
import { useLanguage } from '../i18n/LanguageContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { useFirstTourTrigger } from './TutorialContext';

const s = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minWidth: 0,
    borderRight: 'var(--border-style)',
    overflow: 'hidden',
    position: 'relative',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    padding: '0 12px',
    height: '40px',
    borderBottom: 'var(--border-style)',
    flexShrink: 0,
    background: 'var(--white)',
  },
  toolbarBtn: {
    width: '28px',
    height: '28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '3px',
    fontSize: '13px',
    color: 'var(--muted)',
    transition: 'color 0.1s, background 0.1s',
    cursor: 'pointer',
    flexShrink: 0,
  },
  toolbarBtnActive: {
    color: 'var(--strong)',
    background: 'var(--panel-bg)',
  },
  toolbarDivider: {
    width: '1px',
    height: '16px',
    background: 'var(--border)',
    margin: '0 4px',
    flexShrink: 0,
  },
  toolbarSpacer: { flex: 1 },
  toggleListBtn: {
    fontSize: '11px',
    color: 'var(--muted)',
    padding: '4px 8px',
    borderRadius: '2px',
    transition: 'color 0.1s',
    flexShrink: 0,
  },
  meta: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '12px',
    padding: '14px 32px 0',
    flexShrink: 0,
  },
  dateTitle: {
    fontSize: '18px',
    fontWeight: '700',
    color: 'var(--strong)',
    border: 'none',
    outline: 'none',
    background: 'transparent',
    width: '100%',
    fontFamily: 'var(--font)',
    lineHeight: '1.3',
  },
  dateLine: {
    fontSize: '11px',
    color: 'var(--muted)',
    flexShrink: 0,
    whiteSpace: 'nowrap',
  },
  wordCount: {
    fontSize: '11px',
    color: 'var(--muted)',
    flexShrink: 0,
  },
  editorWrap: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px 32px 80px',
  },
};

function ToolbarButton({ label, active, onClick, children, ...rest }) {
  return (
    <button
      style={{ ...s.toolbarBtn, ...(active ? s.toolbarBtnActive : {}) }}
      onClick={onClick}
      title={label}
      aria-label={label}
      type="button"
      {...rest}
    >
      {children}
    </button>
  );
}

function wordCount(text) {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric'
    });
  } catch { return dateStr; }
}

export default function WritingCanvas({
  entry,
  onUpdate,
  onNew,
  toggleEntryList,
  entryListOpen,
  onVersionPreview,
  previewVersionId,
  isFirstSession,
  allTags = [],
  onTalkAboutThis,
}) {
  useFirstTourTrigger('journal');
  const { t } = useLanguage();
  const isMobile = useIsMobile();
  const { confirmIfCrisis } = useCrisisGate();
  const saveTimer = useRef(null);
  const savedTimer = useRef(null);
  const snapshotTimer = useRef(null);
  // Tracks which entry's body is currently loaded into the Tiptap editor.
  // Defensive guard for the lock-edit bug: any onUpdate emission whose
  // captured entryId does not match this ref is a stale event from a prior
  // entry and must never be persisted.
  const lastLoadedEntryIdRef = useRef(null);
  // Monotonic counter bumped each time a new entry's body is loaded.
  // Debounced saves capture the epoch at schedule time and re-check it when
  // the timer fires — if the user switched entries in the 800ms window, the
  // save is dropped.
  const loadEpochRef = useRef(0);
  // Snapshot of the HTML we loaded for the current entry. Swallows the very
  // first post-load onUpdate emissions (from Tiptap's own appendTransaction
  // hooks normalising the parsed doc) that don't reflect real user edits.
  const loadedHtmlRef = useRef('');
  const [saveStatus, setSaveStatus] = useState('idle'); // idle | saving | saved
  const editorWrapRef = useRef(null);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versions, setVersions] = useState([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const [titling, setTitling] = useState(false);
  const [cardModalOpen, setCardModalOpen] = useState(false);
  const [doodleModalOpen, setDoodleModalOpen] = useState(false);
  const [reading, setReading] = useState(false);
  const [editorText, setEditorText] = useState('');
  // Lock state is persisted per-entry on the server (`entries.locked`). We
  // derive editMode from the entry so it survives reloads and switching between
  // entries keeps each entry's own lock state.
  const editMode = !entry?.locked;
  const ttsAudioRef = useRef(null);
  const ttsCancelRef = useRef(false);

  // Live LLM-suggested tags for the tag bar — debounced as the user writes,
  // excluding tags already on the entry.
  const { suggestions: suggestedTags, dismiss: dismissSuggestion } = useTagSuggestions(
    editorText,
    [...(entry?.tags || []), ...(entry?.auto_tags || [])]
  );

  const editorRef = useRef(null);
  const { isRecording, isProcessing, toggle: toggleDictation } = useDictation((text) => {
    const ed = editorRef.current;
    if (ed) ed.chain().focus().insertContent(text + ' ').run();
  });

async function fetchVersions() {
    if (!entry?.id) return;
    setVersionsLoading(true);
    try {
      // Best-effort cleanup of historical blank snapshots created before the
      // backend guard existed. Failure here must not block the load.
      try { await apiFetch(`/api/entries/${entry.id}/versions/blank`, { method: 'DELETE' }); } catch {}
      const res = await apiFetch(`/api/entries/${entry.id}/versions`);
      const data = await res.json();
      setVersions(Array.isArray(data) ? data : []);
    } catch {
      setVersions([]);
    } finally {
      setVersionsLoading(false);
    }
  }

  async function handleRestoreVersion(v) {
    if (!entry?.id) return;
    const res = await apiFetch(`/api/entries/${entry.id}/versions/${v.id}/restore`, { method: 'POST' });
    const data = await res.json();
    if (data.error) return;
    if (editor) editor.commands.setContent(data.body, false);
    onUpdate({ body: data.body, body_text: data.body_text, title: data.title }, entry.id);
    setVersionsOpen(false);
  }

  async function handlePolish() {
    if (!editor || !entry?.id || polishing) return;
    const html = editor.getHTML();
    if (!html || html === '<p></p>') return;
    if (!await confirmIfCrisis(editor.getText())) return;
    setPolishing(true);
    try {
      // Snapshot before polish so user can undo
      await apiFetch(`/api/entries/${entry.id}/snapshot`, { method: 'POST' }).catch(() => {});

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

        editor.commands.setContent(polished, false);
        const text = editor.getText();
        await onUpdate({ body: polished, body_text: text }, entry.id);
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
    if (!editor || !entry?.id || titling) return;
    const entryId = entry.id; // capture before await — entry may switch mid-fetch
    const text = editor.getText();
    if (!text || text.trim().length < 10) return;
    setTitling(true);
    try {
      const res = await apiFetch('/api/reflect/title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (data.title) onUpdate({ title: data.title }, entryId);
    } catch (err) {
      console.error('Title generation failed:', err);
    } finally {
      setTitling(false);
    }
  }

  async function handleReadAloud() {
    if (reading) { stopSpeak(ttsAudioRef, ttsCancelRef); setReading(false); return; }
    const body = editor?.getText();
    const text = (entry?.title ? entry.title + '. ' : '') + (body || '');
    if (!text?.trim()) return;
    ttsCancelRef.current = false;
    setReading(true);
    await streamSpeak(text, ttsAudioRef, ttsCancelRef);
    setReading(false);
  }

const editor = useEditor({
    extensions: [
      Document,
      Paragraph,
      Text,
      Bold,
      Italic,
      Strike,
      Code,
      Heading.configure({ levels: [1, 2, 3] }),
      BulletList,
      OrderedList,
      ListItem,
      HardBreak,
      HorizontalRule,
      Blockquote,
      History,
      Gapcursor,
      YoutubeEmbed,
      InstagramEmbed,
      ImageEmbed,
      DetailsBlock,
      MediaRow,
      CardReading,
      TextIndent,
      Placeholder.configure({
        placeholder: isFirstSession
          ? t('journal.firstSession')
          : t('journal.placeholder'),
        emptyEditorClass: 'is-editor-empty',
      }),
    ],
    content: entry?.body || '',
    editable: true,
    editorProps: {
      attributes: { spellcheck: 'true' },
      handleDOMEvents: { dragstart: atomDragGuard },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      const text = editor.getText();
      const entryId = entry?.id; // capture NOW — prevents saving to wrong entry if switched quickly
      const epoch = loadEpochRef.current;
      lockbug('onUpdate', {
        entryId,
        ref: lastLoadedEntryIdRef.current,
        epoch,
        htmlLen: html.length,
        loadedLen: loadedHtmlRef.current.length,
        htmlPrefix: html.slice(0, 60),
      });
      // Drop any update that fires before setContent has loaded this entry's
      // body. Stale emissions (e.g. from an entry switch) would otherwise
      // overwrite the new entry with the previous entry's content.
      if (entryId == null || entryId !== lastLoadedEntryIdRef.current) {
        lockbug('onUpdate:DROP-id-mismatch', { entryId, ref: lastLoadedEntryIdRef.current });
        return;
      }
      // Swallow the no-op emissions that appendTransaction hooks fire
      // immediately after setContent when re-entering an entry.
      if (html === loadedHtmlRef.current) {
        lockbug('onUpdate:DROP-html-unchanged', { entryId });
        return;
      }
      setEditorText(text);

      setSaveStatus('saving');
      clearTimeout(saveTimer.current);
      clearTimeout(savedTimer.current);
      saveTimer.current = setTimeout(async () => {
        // Re-check at fire time: the user may have switched entries during
        // the 800ms debounce, invalidating the captured html/entryId.
        if (epoch !== loadEpochRef.current) {
          lockbug('save:DROP-epoch-stale', { entryId, epoch, current: loadEpochRef.current });
          return;
        }
        if (entryId !== lastLoadedEntryIdRef.current) {
          lockbug('save:DROP-ref-moved', { entryId, ref: lastLoadedEntryIdRef.current });
          return;
        }
        lockbug('save:FIRE', { entryId, htmlLen: html.length, htmlPrefix: html.slice(0, 60) });
        await onUpdate({ body: html, body_text: text }, entryId);
        setSaveStatus('saved');
        savedTimer.current = setTimeout(() => setSaveStatus('idle'), 2000);
        // Snapshot after 5s of save-idle so each editing session ends with a
        // version of the true final state (backend dedupes identical bodies).
        clearTimeout(snapshotTimer.current);
        snapshotTimer.current = setTimeout(() => {
          if (epoch !== loadEpochRef.current) return;
          apiFetch(`/api/entries/${entryId}/snapshot`, { method: 'POST' }).catch(() => {});
        }, 5000);
      }, 800);
    },
  });

  // Keep editorRef in sync for dictation insertion
  useEffect(() => { editorRef.current = editor; }, [editor]);

  // Reflect the lock/edit toggle onto the Tiptap editor.
  // `false` as second arg suppresses the `update` event — otherwise toggling
  // editable (including during an entry switch when old editor.getHTML() ≠
  // new entry.body) would trip the debounced save and overwrite the incoming
  // entry with the previous entry's body.
  useEffect(() => {
    if (editor) editor.setEditable(editMode, false);
  }, [editor, editMode]);

  // Listen for atom paste events from the right-click menu (SelectionMenu).
  // execCommand('paste') doesn't work in Electron for rich content, so the
  // menu dispatches a custom event with the atom's HTML. We insert it via
  // Tiptap's insertContent which parses through the schema properly.
  useEffect(() => {
    if (!editor) return;
    const handler = (e) => {
      const html = e.detail?.html;
      const text = e.detail?.text;
      if (!html && !text) return;
      editor.chain().focus().insertContent(html || text).run();
    };
    const el = editor.view.dom;
    el.addEventListener('liminal-paste-atom', handler);
    return () => el.removeEventListener('liminal-paste-atom', handler);
  }, [editor]);

  // Reload content when active entry changes.
  // Ref + epoch are bumped BEFORE setContent so any transaction spawned by
  // `appendTransaction` hooks (MediaRow, DetailsBlock, CardReading) — which
  // don't inherit `preventUpdate` from setContent's primary tr — gets dropped
  // by the onUpdate guard instead of firing a save.
  useEffect(() => {
    if (!editor) return;
    const newContent = entry?.body || '';
    lockbug('reload:start', {
      entryId: entry?.id,
      newLen: newContent.length,
      newPrefix: newContent.slice(0, 60),
      editorPrefix: editor.getHTML().slice(0, 60),
    });
    lastLoadedEntryIdRef.current = entry?.id ?? null;
    loadEpochRef.current += 1;
    if (editor.getHTML() !== newContent) {
      editor.commands.setContent(newContent, false);
    }
    // Snapshot the HTML actually in the editor (Tiptap may normalise parsed
    // input) so the onUpdate equality check catches appendTransaction echoes.
    loadedHtmlRef.current = editor.getHTML();
    setEditorText(editor.getText());
    lockbug('reload:done', { entryId: entry?.id, loadedLen: loadedHtmlRef.current.length, epoch: loadEpochRef.current });
  }, [entry?.id]);

  // Reset save status and timers when switching entries. Clearing saveTimer
  // is critical: a pending debounced save captured from the previous entry
  // would otherwise fire after the editor has reloaded with the new entry's
  // content, silently overwriting one entry's body with another.
  useEffect(() => {
    setSaveStatus('idle');
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (snapshotTimer.current) {
      clearTimeout(snapshotTimer.current);
      snapshotTimer.current = null;
    }
  }, [entry?.id]);

  // Cleanup debounce on unmount
  useEffect(() => () => {
    clearTimeout(saveTimer.current);
    clearTimeout(savedTimer.current);
    clearTimeout(snapshotTimer.current);
  }, []);

  const words = wordCount(editor?.getText() || '');

  return (
    <div style={s.root} data-canvas-root>
      {/* Toolbar */}
      <div data-tour-id="journal-toolbar" style={s.toolbar}>
        <button
          style={s.toggleListBtn}
          onClick={toggleEntryList}
          title={entryListOpen ? t('journal.hideEntryList') : t('journal.showEntryList')}
        >
          {entryListOpen ? '◂' : '▸'}
        </button>

        <div style={s.toolbarDivider} />

        <ToolbarButton
          label="Bold"
          active={editor?.isActive('bold')}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <strong>B</strong>
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          active={editor?.isActive('italic')}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <em>I</em>
        </ToolbarButton>
        <ToolbarButton
          label="Strikethrough"
          active={editor?.isActive('strike')}
          onClick={() => editor?.chain().focus().toggleStrike().run()}
        >
          <s>S</s>
        </ToolbarButton>

        <div style={s.toolbarDivider} />

        <ToolbarButton
          label="Heading 1"
          active={editor?.isActive('heading', { level: 1 })}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
        >
          H1
        </ToolbarButton>
        <ToolbarButton
          label="Heading 2"
          active={editor?.isActive('heading', { level: 2 })}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          H2
        </ToolbarButton>

        <div style={s.toolbarDivider} />

        <ToolbarButton
          label="Bullet list"
          active={editor?.isActive('bulletList')}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          ≡
        </ToolbarButton>
        <ToolbarButton
          label="Ordered list"
          active={editor?.isActive('orderedList')}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          #
        </ToolbarButton>

        <ToolbarButton
          label="Indent"
          onClick={() => editor?.chain().focus().indent().run()}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="8" x2="21" y2="8"/><line x1="3" y1="16" x2="21" y2="16"/><polyline points="9 4 13 8 9 12"/></svg>
        </ToolbarButton>
        <ToolbarButton
          label="Outdent"
          onClick={() => editor?.chain().focus().outdent().run()}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="8" x2="21" y2="8"/><line x1="3" y1="16" x2="21" y2="16"/><polyline points="13 4 9 8 13 12"/></svg>
        </ToolbarButton>

        <ToolbarButton
          label="Quote"
          active={editor?.isActive('blockquote')}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
        >
          "
        </ToolbarButton>

        <ToolbarButton
          data-tour-id="journal-toggle-block"
          label="Toggle"
          active={editor?.isActive('detailsBlock')}
          onClick={() => editor?.chain().focus().setDetailsBlock().run()}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="6,4 20,12 6,20" fill="currentColor" stroke="none"/></svg>
        </ToolbarButton>

        <div style={s.toolbarDivider} />

        <ToolbarButton
          label="Horizontal rule"
          onClick={() => editor?.chain().focus().setHorizontalRule().run()}
        >
          —
        </ToolbarButton>

        <div style={s.toolbarDivider} />

        <ToolbarButton
          data-tour-id="journal-card-pull"
          label={t('cards.pullCards')}
          onClick={() => setCardModalOpen(true)}
        >
          <svg width="12" height="15" viewBox="0 0 12 15" fill="none" stroke="currentColor" strokeWidth="1"><rect x="0.5" y="0.5" width="11" height="14" rx="1.5"/><rect x="1.5" y="1.5" width="9" height="12" rx="1" strokeWidth="0.6"/><polygon points="6,3.5 8,7.5 6,11 4,7.5" fill="currentColor" stroke="none"/></svg>
        </ToolbarButton>

        <ToolbarButton
          data-tour-id="journal-drawing"
          label={t('doodle.title')}
          onClick={() => setDoodleModalOpen(true)}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12L1 13L3 12L12 3L11 2L2 11Z" /><path d="M10 3L11 4" /></svg>
        </ToolbarButton>

        <div style={s.toolbarSpacer} />

        {saveStatus !== 'idle' && (
          <span style={{ fontSize: '11px', color: 'var(--muted)', flexShrink: 0 }}>
            {saveStatus === 'saving' ? t('common.saving') : `✓ ${t('common.saved')}`}
          </span>
        )}

        <button
          data-tour-id="journal-lock"
          style={{
            ...s.toolbarBtn,
            ...(editMode ? {} : { background: 'rgba(0,0,0,0.06)', color: 'var(--strong)' }),
          }}
          title={editMode ? 'Lock editing' : 'Enable edit mode'}
          onClick={() => entry?.id && onUpdate({ locked: editMode ? 1 : 0 }, entry.id)}
          type="button"
        >
          {editMode ? (
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M11.5 2.5l2 2-8 8H3.5v-2l8-8z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <rect x="3.5" y="7.5" width="9" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" />
              <path d="M5.5 7.5V5a2.5 2.5 0 015 0v2.5" stroke="currentColor" strokeWidth="1.4" fill="none" />
            </svg>
          )}
        </button>

        <button
          data-tour-id="journal-versions"
          style={{ ...s.toolbarBtn, fontSize: '14px' }}
          title={t('journal.versionHistory')}
          onClick={() => { setVersionsOpen(true); fetchVersions(); }}
          type="button"
        >
          ◷
        </button>

        <span style={s.wordCount}>{t('common.words', { count: words })}</span>

      </div>

      {/* Tag selector */}
      {entry && (
        <TagSelector
          data-tour-id="journal-tags"
          tags={entry.tags || []}
          autoTags={entry.auto_tags || []}
          allTags={allTags}
          suggestedTags={suggestedTags}
          onDismissSuggestion={dismissSuggestion}
          onTagsChange={(tags) => entry?.id && onUpdate({ tags }, entry.id)}
          onAutoTagsChange={(auto_tags) => entry?.id && onUpdate({ auto_tags }, entry.id)}
        />
      )}

      {/* Entry title + meta */}
      {entry && (
        <div style={s.meta}>
          <input
            style={s.dateTitle}
            value={entry.title || ''}
            onChange={(e) => entry?.id && onUpdate({ title: e.target.value }, entry.id)}
            placeholder={t('journal.entryTitle')}
            aria-label={t('journal.entryTitle')}
          />
          <span style={s.dateLine}>{formatDate(entry.date)}</span>
        </div>
      )}

      {/* Editor */}
      <div style={{ ...s.editorWrap, position: 'relative', ...(isMobile ? { padding: '12px 16px 80px' } : {}) }} ref={editorWrapRef} data-find-scope="1">
        {entry ? (
          <>
            <EditorContent editor={editor} />
            {!isMobile && (
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
            )}
          </>
        ) : (
          <div style={{ color: 'var(--muted)', fontSize: '14px', paddingTop: '16px' }}>
            {t('journal.selectEntry')}
          </div>
        )}
      </div>

      {/* Polish + Mic — fixed footer */}
      {entry && (
        <div style={{ borderTop: 'var(--border-style)', padding: '14px 18px', flexShrink: 0, background: 'var(--white)', display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            data-tour-id="journal-polish"
            style={{
              flex: 1,
              fontSize: '12px',
              padding: '9px 0',
              fontWeight: '500',
              color: 'var(--white)',
              background: 'var(--strong)',
              borderRadius: '20px',
              cursor: (polishing || words === 0) ? 'default' : 'pointer',
              transition: 'opacity 0.15s',
              border: 'none',
              fontFamily: 'var(--font)',
              opacity: (polishing || words === 0) ? 0.35 : 1,
              boxShadow: '0 2px 4px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.1)',
            }}
            onClick={handlePolish}
            disabled={polishing || words === 0}
          >
            {polishing ? t('journal.polishing') : t('journal.polish')}
          </button>
          <button
            data-tour-id="journal-generate-title"
            onClick={handleGenerateTitle}
            title="Generate title"
            disabled={titling || words === 0}
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
              cursor: (titling || words === 0) ? 'default' : 'pointer',
              transition: 'color 0.15s, background 0.15s, opacity 0.15s',
              flexShrink: 0,
              opacity: (titling || words === 0) ? 0.35 : 1,
              boxShadow: '0 1px 3px rgba(0,0,0,0.08), inset 0 -1px 0 rgba(0,0,0,0.06)',
            }}
          >
            {titling ? <SpinnerIcon /> : <TitleIcon />}
          </button>
          <span data-tour-id="journal-dictate" style={{ display: 'inline-flex' }}>
          <MicButton
            isRecording={isRecording}
            isProcessing={isProcessing}
            onClick={toggleDictation}
          />
          </span>
          <button
            data-tour-id="journal-read-aloud"
            onClick={handleReadAloud}
            title={reading ? t('common.stop') : t('common.readAloud')}
            type="button"
            disabled={words === 0 && !reading}
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
              cursor: (words === 0 && !reading) ? 'default' : 'pointer',
              transition: 'color 0.15s, background 0.15s',
              flexShrink: 0,
              opacity: (words === 0 && !reading) ? 0.35 : 1,
              boxShadow: reading
                ? 'inset 0 1px 2px rgba(0,0,0,0.08)'
                : '0 1px 3px rgba(0,0,0,0.08), inset 0 -1px 0 rgba(0,0,0,0.06)',
            }}
          >
            <WaveformIcon playing={reading} />
          </button>
          {onTalkAboutThis && (
            <button
              data-tour-id="journal-send-to-chat"
              onClick={() => onTalkAboutThis(entry)}
              title={entry.linked_session_id ? t('journal.goToChat') : t('journal.talkAboutThis')}
              type="button"
              disabled={words === 0}
              style={{
                width: '36px',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '20px',
                border: 'none',
                background: entry.linked_session_id ? 'rgba(99,102,241,0.1)' : 'var(--near-white)',
                color: entry.linked_session_id ? 'rgb(99,102,241)' : 'var(--muted)',
                cursor: words === 0 ? 'default' : 'pointer',
                transition: 'color 0.15s, background 0.15s',
                flexShrink: 0,
                opacity: words === 0 ? 0.35 : 1,
                boxShadow: '0 1px 3px rgba(0,0,0,0.08), inset 0 -1px 0 rgba(0,0,0,0.06)',
              }}
            >
              <ChatBubbleIcon linked={!!entry.linked_session_id} />
            </button>
          )}
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
        title="Entry Versions"
      />

      {cardModalOpen && (
        <CardPullModal
          onClose={() => setCardModalOpen(false)}
          onInsert={(data) => {
            // focus('end') clears any lingering NodeSelection (which CardReading
            // sets on dragstart) — without this, a second card-reading insert
            // would replace an existing selected one instead of appending.
            if (data.type === 'cardReading') {
              editor?.chain().focus('end').insertContent({
                type: 'cardReading',
                attrs: data.attrs,
              }).run();
            } else {
              editor?.chain().focus('end').insertContent(data).run();
            }
            setCardModalOpen(false);
          }}
          entryText={editor?.getText() || ''}
        />
      )}

      {doodleModalOpen && (
        <DoodleModal
          onClose={() => setDoodleModalOpen(false)}
          onInsert={(dataUrl) => {
            editor?.chain().focus().insertContent({
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

function ChatBubbleIcon({ linked }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H6l-3 3V11H4a2 2 0 0 1-2-2V3z" />
      {linked && <circle cx="8" cy="6" r="1.5" fill="currentColor" stroke="none" />}
    </svg>
  );
}

function TagSelector({ tags, autoTags = [], allTags, suggestedTags = [], onDismissSuggestion, onTagsChange, onAutoTagsChange, ...rest }) {
  const [adding, setAdding] = useState(false);
  const [newTag, setNewTag] = useState('');

  // A toggle on a pill flips it within whichever list currently holds it.
  // Manual pills toggle in `tags`, auto pills toggle in `auto_tags`. A pill
  // that's in neither (i.e. an existing filter from another entry) gets
  // added as a manual tag — the user is opting into it explicitly.
  function toggleTag(tag) {
    if (tags.includes(tag)) {
      onTagsChange(tags.filter(t => t !== tag));
    } else if (autoTags.includes(tag)) {
      onAutoTagsChange?.(autoTags.filter(t => t !== tag));
    } else {
      onTagsChange([...tags, tag]);
    }
  }

  // Promote a suggestion → write into `auto_tags`, since suggestions come
  // from the LLM. The user can later "promote" it to manual by clicking the
  // pill (which adds it to `tags`; the server's normaliseTagPair drops it
  // from auto_tags so a tag never lives in both arrays at once).
  function applySuggestion(tag) {
    if (!tags.includes(tag) && !autoTags.includes(tag)) {
      onAutoTagsChange?.([...autoTags, tag]);
    }
    onDismissSuggestion?.(tag);
  }

  function addTag() {
    const clean = newTag.trim().toLowerCase();
    if (clean && !tags.includes(clean)) onTagsChange([...tags, clean]);
    setNewTag('');
    setAdding(false);
  }

  // Render manual tags first, then the entry's own auto tags, then any
  // global tags that aren't on this entry. Dedupe so a tag never appears
  // twice (manual wins).
  const ownSet = new Set([...tags, ...autoTags]);
  const otherTags = allTags.filter((t) => !ownSet.has(t));
  const freshSuggestions = suggestedTags.filter((s) => !tags.includes(s) && !autoTags.includes(s) && !otherTags.includes(s));

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

  // Suggested-tag pills are visually distinct: dashed border + italic so the
  // user can tell at a glance which pills are LLM-suggested vs already-saved.
  const pillSuggested = {
    border: '1px dashed var(--border)',
    background: 'var(--near-white)',
    color: 'var(--muted)',
    fontStyle: 'italic',
  };

  // Auto-applied (LLM) tags already on the entry: filled like manual tags so
  // it's obvious they've been added, but keep a dashed border as the hint
  // that they originated from an LLM suggestion.
  const pillAuto = {
    border: '1px dashed var(--strong)',
    background: 'var(--strong)',
    color: 'var(--white)',
    fontWeight: '600',
  };

  // Sorted lists so the row layout is stable as the editor refreshes.
  const sortedManual = [...tags].sort();
  const sortedAuto = [...autoTags].sort();
  const sortedOther = [...otherTags].sort();

  return (
    <div {...rest} style={{
      display: 'flex',
      alignItems: 'center',
      gap: '5px',
      padding: '6px 32px',
      borderBottom: 'var(--border-style)',
      flexWrap: 'wrap',
      flexShrink: 0,
    }}>
      {sortedManual.map((tag) => (
        <button
          key={'m-' + tag}
          style={{ ...pillBase, ...pillActive }}
          onClick={() => toggleTag(tag)}
          title="Manual tag — click to remove"
        >
          <TagLabel tag={tag} />
        </button>
      ))}
      {sortedAuto.map((tag) => (
        <button
          key={'a-' + tag}
          style={{ ...pillBase, ...pillAuto }}
          onClick={() => toggleTag(tag)}
          title="Suggested tag — click to remove"
        >
          <TagLabel tag={tag} />
        </button>
      ))}
      {sortedOther.map((tag) => (
        <button
          key={'o-' + tag}
          style={{ ...pillBase }}
          onClick={() => toggleTag(tag)}
          title="Filter tag — click to add to this entry"
        >
          <TagLabel tag={tag} />
        </button>
      ))}
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
      {adding ? (
        <input
          autoFocus
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addTag(); if (e.key === 'Escape') { setAdding(false); setNewTag(''); } }}
          onBlur={addTag}
          placeholder="tag…"
          style={{
            fontSize: '10px',
            padding: '3px 8px',
            border: '1px solid var(--border)',
            borderRadius: '20px',
            background: 'var(--white)',
            color: 'var(--strong)',
            outline: 'none',
            width: '70px',
            fontFamily: 'var(--font)',
          }}
        />
      ) : (
        <button
          style={{ ...pillBase, border: '1px dashed var(--border)' }}
          onClick={() => setAdding(true)}
          title="Add tag"
        >
          +
        </button>
      )}
    </div>
  );
}
