// First-upload rights acknowledgment. Shows a one-time confirmation dialog
// the first time the user uploads user-supplied content (archetype images,
// voice samples). After they accept, a localStorage flag means we don't
// prompt again. Logged with a timestamp so the acknowledgment is evidence
// a real choice was made, not just a dismissed modal.
//
// Returns true if the upload should proceed, false if the user cancelled.
// Called imperatively from upload handlers (not as a React hook) so it
// works uniformly from MemoryPage, SettingsPage, etc.

const FLAG_KEY = 'liminal:upload_rights_confirmed_at';

export function hasConfirmedUploadRights() {
  return !!localStorage.getItem(FLAG_KEY);
}

export async function confirmUploadRights(t) {
  if (hasConfirmedUploadRights()) return true;

  const title = (t && t('uploadRights.confirmTitle')) || 'Confirm you have the rights to this content';
  const body = (t && t('uploadRights.confirmBody')) ||
    'By uploading, you confirm that you created this content yourself, own the rights to it, or have clear and informed permission from the rightsholder. Uploading voices or likenesses of real people without consent may be unlawful in your jurisdiction. You are solely responsible for the content you upload and any output it produces.';

  const ok = window.confirm(`${title}\n\n${body}`);
  if (ok) {
    try { localStorage.setItem(FLAG_KEY, new Date().toISOString()); } catch {}
    return true;
  }
  return false;
}
