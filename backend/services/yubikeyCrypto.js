// YubiKey 2FA crypto helpers.
//
// When the user enables YubiKey 2FA, we add a third wrapping of their random
// `user_key` keyed by a secret derived from the WebAuthn PRF extension output
// (the standardised modern equivalent of FIDO2's hmac-secret). Stored in
// users.user_key_by_yubikey.
//
// Enrollment ceremony:
//   1. Renderer calls navigator.credentials.create() with prf extension.
//      Browser returns credential_id and acknowledges prf support.
//   2. Renderer immediately calls navigator.credentials.get() with the same
//      credential and a server-generated 32-byte salt → browser returns the
//      32-byte prf_output.
//   3. Renderer posts credential_id + prf_output to the backend.
//   4. Backend wraps user_key with a key derived from prf_output and stores
//      it as user_key_by_yubikey. The password wrapper (user_key_by_password)
//      is dropped — once enrolled, password alone cannot unlock. True 2FA.
//      The recovery-key wrapper (user_key_by_recovery) is untouched.
//
// Login ceremony:
//   1. /api/auth/login validates the bcrypt password as before.
//   2. If yubikey_enabled, server responds with { yubikey_required, credential_id,
//      prf_salt } instead of issuing a JWT.
//   3. Renderer calls navigator.credentials.get() with the stored credential
//      and salt → browser returns the same 32-byte prf_output as enrollment.
//   4. Renderer posts prf_output to /api/auth/login-yubikey.
//   5. Server unwraps user_key_by_yubikey, caches user_key, issues JWT.
//
// The prf_output never persists on disk — only transits over localhost HTTP
// during the assertion → unwrap step. The credential_id and prf_salt are
// stored in plaintext (they're useless without the physical key).
//
// Disable: requires current password + a fresh YubiKey assertion. We rewrap
// user_key with the password KEK to restore user_key_by_password, then clear
// the yubikey_* columns.

const crypto = require('crypto');

const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HKDF_INFO = Buffer.from('liminal-yubikey-prf-wrap-v1', 'utf8');

// Generate the 32-byte salt sent to the YubiKey via the prf extension. Stored
// per-user; the YubiKey returns a deterministic HMAC of this salt under its
// internal hmac-secret, so the same salt yields the same prf_output every
// time the same physical key is tapped. Rotating the salt would change the
// derived wrapping key and require re-wrapping user_key, so it stays stable
// for the life of the enrollment.
function generatePrfSalt() {
  return crypto.randomBytes(32);
}

// Derive a 32-byte AES-256 wrapping key from the prf_output via HKDF-SHA256.
// We don't use prf_output directly as the AES key — HKDF gives us domain
// separation (the same physical key could in theory be used by other software
// for other purposes; tying the wrapping key to a Liminal-specific info label
// makes cross-protocol confusion impossible).
function deriveWrappingKey(prfOutput) {
  if (!Buffer.isBuffer(prfOutput)) prfOutput = Buffer.from(prfOutput);
  if (prfOutput.length !== 32) {
    throw new Error(`yubikey prf_output must be 32 bytes, got ${prfOutput.length}`);
  }
  // No salt — the prf_output is already high-entropy and our domain-separation
  // is in the info label. crypto.hkdfSync takes (digest, ikm, salt, info, length).
  const empty = Buffer.alloc(0);
  return Buffer.from(crypto.hkdfSync('sha256', prfOutput, empty, HKDF_INFO, KEY_BYTES));
}

function wrap(kek, plaintext) {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', kek, iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ct, tag]);
}

function unwrap(kek, wrapped) {
  if (!Buffer.isBuffer(wrapped)) wrapped = Buffer.from(wrapped);
  const iv = wrapped.subarray(0, IV_BYTES);
  const tag = wrapped.subarray(wrapped.length - TAG_BYTES);
  const ct = wrapped.subarray(IV_BYTES, wrapped.length - TAG_BYTES);
  const decipher = crypto.createDecipheriv('aes-256-gcm', kek, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

function wrapUserKeyWithPrf(userKey, prfOutput) {
  const kek = deriveWrappingKey(prfOutput);
  return wrap(kek, userKey);
}

function unwrapUserKeyWithPrf(wrappedUserKey, prfOutput) {
  try {
    const kek = deriveWrappingKey(prfOutput);
    return unwrap(kek, wrappedUserKey);
  } catch {
    return null;
  }
}

module.exports = {
  generatePrfSalt,
  wrapUserKeyWithPrf,
  unwrapUserKeyWithPrf,
};
