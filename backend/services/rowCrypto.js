// Field-level encryption for per-user sensitive text columns.
//
// Ciphertext format:  lenc:v1:base64(iv || ciphertext || gcm_tag)
// Plaintext rows written before this feature shipped are left alone — they
// have no sentinel, so decryptField returns them as-is. Writes always produce
// sentinel'd ciphertext.
//
// The per-user key is held in memory for the lifetime of the backend process,
// keyed by userId. Login populates it; backend restart drops it. That matches
// the existing auth.js model where the JWT secret rotates on every restart.

const crypto = require('crypto');

const SENTINEL = 'lenc:v1:';
const IV_BYTES = 12;
const TAG_BYTES = 16;

const userKeys = new Map();

function setUserKey(userId, keyBuffer) {
  userKeys.set(Number(userId), keyBuffer);
}

function clearUserKey(userId) {
  userKeys.delete(Number(userId));
}

function hasUserKey(userId) {
  return userKeys.has(Number(userId));
}

function getUserKey(userId) {
  const k = userKeys.get(Number(userId));
  if (!k) throw new Error(`no in-memory key for user ${userId} — login required`);
  return k;
}

function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(SENTINEL);
}

function encryptField(userId, plaintext) {
  if (plaintext == null) return plaintext;
  const str = typeof plaintext === 'string' ? plaintext : String(plaintext);
  if (str === '') return str;
  if (isEncrypted(str)) return str;
  const key = getUserKey(userId);
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(str, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return SENTINEL + Buffer.concat([iv, ct, tag]).toString('base64');
}

function decryptField(userId, value) {
  if (value == null) return value;
  if (typeof value !== 'string' || !isEncrypted(value)) return value;
  const key = getUserKey(userId);
  const buf = Buffer.from(value.slice(SENTINEL.length), 'base64');
  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(buf.length - TAG_BYTES);
  const ct = buf.subarray(IV_BYTES, buf.length - TAG_BYTES);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

// Best-effort decrypt: on any failure, return the raw value. Used for read
// paths where we want to surface something rather than 500 if a row pre-dates
// the feature or the key is wrong for some reason.
function safeDecrypt(userId, value) {
  try { return decryptField(userId, value); } catch { return value; }
}

module.exports = {
  setUserKey,
  clearUserKey,
  hasUserKey,
  getUserKey,
  isEncrypted,
  encryptField,
  decryptField,
  safeDecrypt,
  SENTINEL,
};
