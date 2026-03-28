/**
 * MicButton — reusable record/stop button.
 * isRecording: red mic, pulsing
 * isProcessing: shows a spinner ring instead (Whisper uploading)
 */
export default function MicButton({ isRecording, isProcessing, onClick, style = {} }) {
  const baseStyle = {
    width: '28px',
    height: '28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '3px',
    border: 'none',
    background: isRecording ? 'rgba(180,0,0,0.08)' : 'none',
    color: isRecording ? '#b00000' : 'var(--muted)',
    cursor: isProcessing ? 'default' : 'pointer',
    transition: 'color 0.15s, background 0.15s',
    flexShrink: 0,
    ...style,
  };

  return (
    <button
      onClick={isProcessing ? undefined : onClick}
      title={isProcessing ? 'Transcribing…' : isRecording ? 'Stop dictating' : 'Dictate'}
      style={baseStyle}
      type="button"
    >
      {isProcessing ? <SpinnerIcon /> : <MicIcon recording={isRecording} />}
    </button>
  );
}

function MicIcon({ recording }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      style={recording ? { animation: 'micPulse 1.2s ease-in-out infinite' } : {}}
    >
      {/* Capsule body */}
      <rect x="4.5" y="1" width="5" height="7" rx="2.5" fill="currentColor" />
      {/* Stand arc */}
      <path
        d="M2.5 7a4.5 4.5 0 0 0 9 0"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        fill="none"
      />
      {/* Stem */}
      <line x1="7" y1="11.5" x2="7" y2="13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="5" y1="13" x2="9" y2="13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      style={{ animation: 'spin 0.8s linear infinite' }}
    >
      <circle cx="7" cy="7" r="5" stroke="var(--border)" strokeWidth="1.5" />
      <path d="M7 2a5 5 0 0 1 5 5" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
