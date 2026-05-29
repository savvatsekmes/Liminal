// Renderer-side WebAuthn helpers for YubiKey 2FA.
//
// Chromium handles all the platform-specific FIDO HID quirks for us — no
// admin elevation on Windows, no Input Monitoring prompt on macOS. We just
// call navigator.credentials.create() / .get() with the prf extension and
// hand the resulting credential_id + prf_output to the backend.
//
// The prf extension is WebAuthn Level 3's standardised version of the legacy
// FIDO2 hmac-secret extension. It returns a 32-byte HMAC-SHA-256 of a salt
// we provide under a device-held secret that never leaves the YubiKey.

// ── base64 helpers ───────────────────────────────────────────────────────────
function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64(bytes) {
  let bin = '';
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin);
}

// ── Capability check ────────────────────────────────────────────────────────
export function webauthnSupported() {
  return typeof window !== 'undefined'
    && !!window.PublicKeyCredential
    && typeof navigator !== 'undefined'
    && !!navigator.credentials;
}

// ── Enrollment ──────────────────────────────────────────────────────────────
// Two-step ceremony:
//   1. create() to register the credential with prf-eval primed
//   2. get() with the same salt to extract the prf_output value
// Returns { credential_id, prf_output, prf_salt } all base64-encoded for
// transit to the backend.
//
// `options` is the JSON the backend returned from /api/yubikey/enroll-options.
export async function enrollYubikey(options) {
  if (!webauthnSupported()) throw new Error('WebAuthn not supported in this environment');

  const challenge = b64ToBytes(options.challenge);
  const prfSalt = b64ToBytes(options.prf_salt);
  const userId = b64ToBytes(options.user.id);

  const publicKey = {
    rp: options.rp,
    user: {
      id: userId,
      name: options.user.name,
      displayName: options.user.displayName,
    },
    challenge,
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 },   // ES256
      { type: 'public-key', alg: -257 }, // RS256
    ],
    timeout: 60_000,
    attestation: 'none',
    authenticatorSelection: {
      // FIDO2 / YubiKey — cross-platform USB / NFC. Not platform (Touch ID).
      authenticatorAttachment: 'cross-platform',
      // discoverable credential not required for our use case; we always have
      // the credential_id to hand over at .get() time.
      requireResidentKey: false,
      // 'required' (not 'discouraged'): the YubiKey will not return an
      // hmac-secret / PRF output unless user verification was performed
      // during makeCredential. Without UV, the credential is created with
      // hmac-secret DISABLED, so the follow-up .get() can't recover it
      // either — Chromium then throws NotAllowedError. Requiring UV up
      // front guarantees the PIN dialog appears and the credential is
      // registered with hmac-secret enabled. Windows Hello already
      // enforces UV, so this is a no-op there.
      userVerification: 'required',
    },
    // WebAuthn Level 3 hint — tells the OS UI to skip the "phone or security
    // key" chooser and go straight to security key prompts. Chrome 122+ and
    // recent Windows builds honour this; older browsers ignore the field and
    // fall back to the chooser, which is still fine.
    hints: ['security-key'],
    extensions: {
      // prf-eval is the "register and pre-fetch the prf output" shortcut.
      // Some browsers honor it during create(); others ignore eval here and
      // we have to do a follow-up .get() call. Provide it either way.
      prf: { eval: { first: prfSalt } },
    },
  };

  const cred = await navigator.credentials.create({ publicKey });
  if (!cred) throw new Error('Credential creation was cancelled');

  // Did create() return the prf output already (Chrome 116+)? If so, no need
  // for the second ceremony. Otherwise do an immediate .get() to fetch it.
  const createExtensions = typeof cred.getClientExtensionResults === 'function'
    ? cred.getClientExtensionResults()
    : {};
  let prfFirst = createExtensions?.prf?.results?.first;
  let credentialId = new Uint8Array(cred.rawId);

  if (!prfFirst) {
    // Fallback: ask the same key to evaluate the prf again via .get().
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: b64ToBytes(options.challenge),
        timeout: 60_000,
        userVerification: 'required',
        allowCredentials: [{ type: 'public-key', id: credentialId.buffer, transports: ['usb', 'nfc'] }],
        hints: ['security-key'],
        extensions: { prf: { eval: { first: prfSalt } } },
      },
    });
    if (!assertion) throw new Error('Hardware-key tap was cancelled');
    const assertExtensions = assertion.getClientExtensionResults?.() || {};
    prfFirst = assertExtensions?.prf?.results?.first;
    if (!prfFirst) {
      throw new Error("Your hardware key didn't return a PRF value. It may not support the prf/hmac-secret extension.");
    }
  }

  return {
    credential_id: bytesToB64(credentialId),
    prf_output: bytesToB64(new Uint8Array(prfFirst)),
    prf_salt: options.prf_salt, // pass through unchanged (already base64)
  };
}

// ── Assertion (login or sensitive op) ───────────────────────────────────────
// Asks the user's existing enrolled YubiKey to compute the prf_output for
// the stored salt. Used by both /login-yubikey (after password verifies) and
// /yubikey/disable (alongside re-entering the password).
//
// Both inputs are base64 (as returned by the backend's status / login
// response). Returns { prf_output } base64.
export async function assertYubikey({ credential_id, prf_salt }) {
  if (!webauthnSupported()) throw new Error('WebAuthn not supported in this environment');
  const credentialId = b64ToBytes(credential_id);
  const prfSalt = b64ToBytes(prf_salt);
  // Random challenge — we don't verify the assertion signature server-side
  // in this single-user app, so the challenge is essentially anti-replay
  // hygiene only. Still random per call.
  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);

  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      timeout: 60_000,
      userVerification: 'preferred',
      allowCredentials: [{ type: 'public-key', id: credentialId.buffer, transports: ['usb', 'nfc'] }],
      // Skip the Windows passkey chooser when the OS honours it.
      hints: ['security-key'],
      extensions: { prf: { eval: { first: prfSalt } } },
    },
  });
  if (!assertion) throw new Error('Hardware-key tap was cancelled');
  const ext = assertion.getClientExtensionResults?.() || {};
  const prfFirst = ext?.prf?.results?.first;
  if (!prfFirst) {
    throw new Error("Your hardware key didn't return a PRF value. Different key from the one you enrolled?");
  }
  return { prf_output: bytesToB64(new Uint8Array(prfFirst)) };
}
