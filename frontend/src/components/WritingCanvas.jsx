import { useEffect, useRef, useState, useCallback } from 'react';
import { useDictation } from '../hooks/useDictation';
import MicButton from './MicButton';
import { YoutubeEmbed } from '../extensions/YoutubeEmbed';
import { ImageEmbed } from '../extensions/ImageEmbed';
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
import Placeholder from '@tiptap/extension-placeholder';
import Code from '@tiptap/extension-code';
import Blockquote from '../extensions/Blockquote';
import TagBar from './TagBar';
import VersionsPanel from './VersionsPanel';
import CardPullModal from './CardPullModal';
import DoodleModal from './DoodleModal';
import { CardReading } from '../extensions/CardReading';
import { apiFetch } from '../utils/api';
import { useLanguage } from '../i18n/LanguageContext';

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

function ToolbarButton({ label, active, onClick, children }) {
  return (
    <button
      style={{ ...s.toolbarBtn, ...(active ? s.toolbarBtnActive : {}) }}
      onClick={onClick}
      title={label}
      aria-label={label}
      type="button"
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
}) {
  const { t } = useLanguage();
  const saveTimer = useRef(null);
  const savedTimer = useRef(null);
  const lastSnapshotAt = useRef(null);
  const [saveStatus, setSaveStatus] = useState('idle'); // idle | saving | saved
  const [contextPopup, setContextPopup] = useState(null); // { x, y, text }
  const [contextSaved, setContextSaved] = useState(false);
  const editorWrapRef = useRef(null);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versions, setVersions] = useState([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const [cardModalOpen, setCardModalOpen] = useState(false);
  const [doodleModalOpen, setDoodleModalOpen] = useState(false);
  const [reading, setReading] = useState(false);
  const ttsAudioRef = useRef(null);

  const editorRef = useRef(null);
  const { isRecording, isProcessing, toggle: toggleDictation } = useDictation((text) => {
    const ed = editorRef.current;
    if (ed) ed.chain().focus().insertContent(text + ' ').run();
  });

  const handleContextMenu = useCallback((e) => {
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
      // Don't prevent default — let the native context menu show too
      const rootEl = editorWrapRef.current.closest('[data-canvas-root]');
      const rootRect = rootEl ? rootEl.getBoundingClientRect() : { left: 0, top: 0 };
      setContextSaved(false);
      setContextPopup({
        x: e.clientX - rootRect.left,
        y: e.clientY - rootRect.top,
        below: e.clientY > window.innerHeight * 0.6,
        text,
      });
    }
  }, []);

  async function fetchVersions() {
    if (!entry?.id) return;
    setVersionsLoading(true);
    try {
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
    setPolishing(true);
    try {
      // Snapshot before polish so user can undo
      await apiFetch(`/api/entries/${entry.id}/snapshot`, { method: 'POST' }).catch(() => {});

      // Strip card reading blocks before polishing — preserve them as placeholders
      const cardReadings = [];
      const strippedHtml = html.replace(/<div data-card-reading[^>]*>(<\/div>)?/g, (match) => {
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

  async function handleReadAloud() {
    if (reading) {
      if (ttsAudioRef.current) { ttsAudioRef.current.pause(); ttsAudioRef.current = null; }
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      setReading(false);
      return;
    }
    const text = editor?.getText();
    if (!text?.trim()) return;

    // Try custom TTS first
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

    // Fallback to browser TTS
    if (window.speechSynthesis) {
      const utt = new SpeechSynthesisUtterance(text);
      utt.onend = () => setReading(false);
      utt.onerror = () => setReading(false);
      window.speechSynthesis.speak(utt);
    } else {
      setReading(false);
    }
  }

  async function saveToLifeContext() {
    if (!contextPopup) return;
    await apiFetch('/api/memories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: contextPopup.text,
      }),
    });
    setContextSaved(true);
    setTimeout(() => setContextPopup(null), 1200);
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
      YoutubeEmbed,
      ImageEmbed,
      CardReading,
      Placeholder.configure({
        placeholder: isFirstSession
          ? t('journal.firstSession')
          : t('journal.placeholder'),
        emptyEditorClass: 'is-editor-empty',
      }),
    ],
    content: entry?.body || '',
    editorProps: {
      attributes: { spellcheck: 'true' },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      const text = editor.getText();
      const entryId = entry?.id; // capture NOW — prevents saving to wrong entry if switched quickly

      setSaveStatus('saving');
      clearTimeout(saveTimer.current);
      clearTimeout(savedTimer.current);
      saveTimer.current = setTimeout(async () => {
        await onUpdate({ body: html, body_text: text }, entryId);
        setSaveStatus('saved');
        savedTimer.current = setTimeout(() => setSaveStatus('idle'), 2000);
        // Snapshot at most once per minute, tied to actual saves
        const now = Date.now();
        if (!lastSnapshotAt.current || now - lastSnapshotAt.current >= 60_000) {
          lastSnapshotAt.current = now;
          apiFetch(`/api/entries/${entryId}/snapshot`, { method: 'POST' }).catch(() => {});
        }
      }, 800);
    },
  });

  // Keep editorRef in sync for dictation insertion
  useEffect(() => { editorRef.current = editor; }, [editor]);

  // Reload content when active entry changes
  useEffect(() => {
    if (!editor) return;
    const newContent = entry?.body || '';
    if (editor.getHTML() !== newContent) {
      editor.commands.setContent(newContent, false);
    }
  }, [entry?.id]);

  // Reset save status and snapshot timer when switching entries
  useEffect(() => {
    setSaveStatus('idle');
    lastSnapshotAt.current = null;
  }, [entry?.id]);

  // Cleanup debounce on unmount
  useEffect(() => () => {
    clearTimeout(saveTimer.current);
    clearTimeout(savedTimer.current);
  }, []);

  const words = wordCount(editor?.getText() || '');

  return (
    <div style={s.root} data-canvas-root onContextMenu={handleContextMenu} onClick={() => contextPopup && setContextPopup(null)}>
      {/* Toolbar */}
      <div style={s.toolbar}>
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
          label="Quote"
          active={editor?.isActive('blockquote')}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
        >
          "
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
          label={t('cards.pullCards')}
          onClick={() => setCardModalOpen(true)}
        >
          <svg width="12" height="15" viewBox="0 0 12 15" fill="none" stroke="currentColor" strokeWidth="1"><rect x="0.5" y="0.5" width="11" height="14" rx="1.5"/><rect x="1.5" y="1.5" width="9" height="12" rx="1" strokeWidth="0.6"/><polygon points="6,3.5 8,7.5 6,11 4,7.5" fill="currentColor" stroke="none"/></svg>
        </ToolbarButton>

        <ToolbarButton
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
          style={{ ...s.toolbarBtn, fontSize: '14px' }}
          title={t('journal.versionHistory')}
          onClick={() => { setVersionsOpen(true); fetchVersions(); }}
          type="button"
        >
          ◷
        </button>

        <span style={s.wordCount}>{t('common.words', { count: words })}</span>

        <button
          style={{ ...s.toolbarBtn, fontSize: '12px', width: 'auto', padding: '0 10px' }}
          onClick={onNew}
          title={t('journal.newEntry')}
        >
          + {t('journal.newEntry')}
        </button>
      </div>

      {/* Tag bar */}
      {entry && (
        <TagBar
          tags={entry.tags || []}
          onTagsChange={(tags) => onUpdate({ tags })}
        />
      )}

      {/* Entry title + meta */}
      {entry && (
        <div style={s.meta}>
          <input
            style={s.dateTitle}
            value={entry.title || ''}
            onChange={(e) => onUpdate({ title: e.target.value })}
            placeholder={t('journal.entryTitle')}
            aria-label={t('journal.entryTitle')}
          />
          <span style={s.dateLine}>{formatDate(entry.date)}</span>
        </div>
      )}

      {/* Editor */}
      <div style={{ ...s.editorWrap, position: 'relative' }} ref={editorWrapRef}>
        {entry ? (
          <>
            <EditorContent editor={editor} />
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
          <MicButton
            isRecording={isRecording}
            isProcessing={isProcessing}
            onClick={toggleDictation}
          />
          <button
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
        </div>
      )}

      {/* Life context selection popup */}
      {contextPopup && (
        <div style={{
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
          <div style={{
            color: 'var(--body)',
            fontSize: '11px',
            fontWeight: '500',
            borderRadius: '16px',
            padding: '5px 12px',
            whiteSpace: 'nowrap',
            cursor: 'pointer',
            fontFamily: 'var(--font)',
            transition: 'background 0.12s',
          }}
            onClick={saveToLifeContext}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--near-white)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            {contextSaved ? t('journal.savedToMemory') : t('journal.saveToMemory')}
          </div>
          <div style={{ width: '1px', height: '16px', background: 'var(--border)', flexShrink: 0 }} />
          <div style={{
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
            if (data.type === 'cardReading') {
              editor?.chain().focus().insertContent({
                type: 'cardReading',
                attrs: data.attrs,
              }).run();
            } else {
              editor?.chain().focus().insertContent(data).run();
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
