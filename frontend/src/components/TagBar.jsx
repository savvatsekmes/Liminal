import { useEffect, useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { tagLabel, IMG_EMOJI } from '../utils/tagEmoji';
import TagContextMenu from './TagContextMenu';
import EmojiPicker from './EmojiPicker';
import { useLockedTags } from '../hooks/useLockedTags';
import { useCoreTags } from '../hooks/useCoreTags';
import { useTagEmojis } from '../hooks/useTagEmojis';

function TagLabel({ tag, dynamicMap }) {
  const src = IMG_EMOJI[tag.toLowerCase()];
  if (src) return <><img src={src} alt="" style={{ width: '12px', height: '12px', verticalAlign: '-2px' }} /> {tag}</>;
  return tagLabel(tag, dynamicMap);
}

const s = {
  root: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 32px',
    borderBottom: 'var(--border-style)',
    background: 'var(--near-white)',
    minHeight: '36px',
    flexWrap: 'wrap',
    flexShrink: 0,
  },
  label: {
    fontSize: '10px',
    fontWeight: '600',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--muted)',
    marginRight: '4px',
    flexShrink: 0,
  },
  addInput: {
    fontSize: '11px',
    padding: '2px 6px',
    border: 'var(--border-style)',
    borderRadius: '2px',
    background: 'var(--white)',
    color: 'var(--strong)',
    outline: 'none',
    width: '90px',
  },
};

export default function TagBar({ tags = [], onTagsChange }) {
  const { t } = useLanguage();
  const [adding, setAdding] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [menu, setMenu] = useState(null); // { x, y, tag }
  const [picker, setPicker] = useState(null); // { x, y, tag }
  const { isLocked, isAlwaysLocked, lock, unlock } = useLockedTags();
  const { isCore, makeCore, removeCore } = useCoreTags();
  const { dynamicMap, setOverride, clearOverride, primeUnknown } = useTagEmojis();

  // When the tag list changes, prime emoji lookups for any unknown ones so
  // they light up on subsequent renders.
  useEffect(() => { primeUnknown(tags); }, [tags, primeUnknown]);

  function removeTag(tag) {
    onTagsChange(tags.filter((t) => t !== tag));
  }

  function addTag() {
    const clean = newTag.trim().toLowerCase();
    if (clean && !tags.includes(clean)) {
      onTagsChange([...tags, clean]);
      primeUnknown([clean]);
    }
    setNewTag('');
    setAdding(false);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') addTag();
    if (e.key === 'Escape') { setAdding(false); setNewTag(''); }
  }

  return (
    <div style={s.root}>
      <span style={s.label}>{t('tags.label')}</span>

      {tags.map((tag) => {
        // Core tags are auto-locked across journal/notes/oracle — no × shown.
        const userLocked = isLocked(tag);
        const core = isCore(tag);
        const locked = userLocked || core;
        return (
          <span
            key={tag}
            className="tag"
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setMenu({ x: e.clientX, y: e.clientY, tag }); }}
          >
            <TagLabel tag={tag} dynamicMap={dynamicMap} />
            {!locked && (
              <button
                className="tag-remove"
                onClick={() => removeTag(tag)}
                aria-label={`Remove tag ${tag}`}
              >
                ×
              </button>
            )}
          </span>
        );
      })}

      {menu && (() => {
        const userLocked = isLocked(menu.tag);
        const always = isAlwaysLocked(menu.tag);
        const core = isCore(menu.tag);
        const hasOverride = !!(dynamicMap.overrides && dynamicMap.overrides[menu.tag.toLowerCase()]);
        return (
          <TagContextMenu
            x={menu.x}
            y={menu.y}
            onClose={() => setMenu(null)}
            items={[
              userLocked
                ? { label: always ? 'Permanently locked' : 'Unlock tag', disabled: always, onClick: () => unlock(menu.tag) }
                : { label: core ? 'Locked (core tag)' : 'Lock tag', disabled: core, onClick: () => lock(menu.tag) },
              core
                ? { label: 'Remove from core', onClick: () => removeCore(menu.tag) }
                : { label: 'Make core', onClick: () => makeCore(menu.tag) },
              { label: 'Change emoji…', onClick: () => setPicker({ x: menu.x, y: menu.y, tag: menu.tag }) },
              ...(hasOverride ? [{ label: 'Reset emoji to default', onClick: () => clearOverride(menu.tag) }] : []),
            ]}
          />
        );
      })()}

      {picker && (
        <EmojiPicker
          x={picker.x}
          y={picker.y}
          currentEmoji={dynamicMap.overrides?.[picker.tag.toLowerCase()] || null}
          onPick={(e) => setOverride(picker.tag, e)}
          onClear={() => clearOverride(picker.tag)}
          onClose={() => setPicker(null)}
        />
      )}

      {adding ? (
        <input
          autoFocus
          style={s.addInput}
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={addTag}
          placeholder={t('tags.placeholder')}
        />
      ) : (
        <button
          style={{ fontSize: '11px', color: 'var(--muted)', padding: '2px 4px' }}
          onClick={() => setAdding(true)}
          title="Add tag"
        >
          {t('tags.add')}
        </button>
      )}
    </div>
  );
}
