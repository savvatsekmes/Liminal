import DOMPurify from 'dompurify';

// Card readings come back from the AI as HTML, and what the AI writes can be
// steered by text it read (an imported entry, a pasted web page). So that
// HTML is untrusted: keep the formatting, drop scripts, event handlers,
// embeds and forms before it's rendered.
export function sanitizeHtml(html) {
  return DOMPurify.sanitize(String(html || ''), {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'iframe', 'object', 'embed'],
  });
}
