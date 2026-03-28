import { useState } from 'react';

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
  const [adding, setAdding] = useState(false);
  const [newTag, setNewTag] = useState('');

  function removeTag(tag) {
    onTagsChange(tags.filter((t) => t !== tag));
  }

  function addTag() {
    const clean = newTag.trim().toLowerCase();
    if (clean && !tags.includes(clean)) {
      onTagsChange([...tags, clean]);
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
      <span style={s.label}>Tags</span>

      {tags.map((tag) => (
        <span key={tag} className="tag">
          {tag}
          <button
            className="tag-remove"
            onClick={() => removeTag(tag)}
            aria-label={`Remove tag ${tag}`}
          >
            ×
          </button>
        </span>
      ))}

      {adding ? (
        <input
          autoFocus
          style={s.addInput}
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={addTag}
          placeholder="tag name"
        />
      ) : (
        <button
          style={{ fontSize: '11px', color: 'var(--muted)', padding: '2px 4px' }}
          onClick={() => setAdding(true)}
          title="Add tag"
        >
          + add
        </button>
      )}
    </div>
  );
}
