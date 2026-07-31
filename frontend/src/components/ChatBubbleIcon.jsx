// Shared "talk about this" chat-bubble icon.
//
// Used by every surface that opens an item's linked Oracle conversation — the
// journal canvas, the notes canvas, and the reflection's closing-question
// answer box. The filled dot marks that a linked session already exists, so a
// linked item looks the same wherever it's shown.
export default function ChatBubbleIcon({ linked }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H6l-3 3V11H4a2 2 0 0 1-2-2V3z" />
      {linked && <circle cx="8" cy="6" r="1.5" fill="currentColor" stroke="none" />}
    </svg>
  );
}
