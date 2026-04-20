// Per-user encryption primitives.
//
// Each user has a random 32-byte "user key" that encrypts their sensitive row
// data (entry bodies, notes, reflections, threads, memories, versions). The
// user key itself is wrapped twice and stored in the users row:
//   - user_key_by_password  = AES-256-GCM(KEK_from_password, user_key)
//   - user_key_by_recovery  = AES-256-GCM(KEK_from_recovery, user_key)
// Either wrapping can unwrap the user key, so login accepts a password OR a
// recovery key. The user key never leaves the backend process.
//
// The recovery key string itself is also stored wrapped by the password
// (recovery_key_by_password) so Settings can display the current recovery key
// after the user re-enters their password. Regenerating a recovery key
// rewraps user_key_by_recovery and replaces recovery_key_by_password.

const crypto = require('crypto');

const KDF_ITERATIONS = 600_000;
const KDF_DIGEST = 'sha512';
const KEY_BYTES = 32;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;

function deriveKek(secret, salt) {
  return crypto.pbkdf2Sync(secret, salt, KDF_ITERATIONS, KEY_BYTES, KDF_DIGEST);
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

// Recovery key: 128 bits → 32 hex chars → 8 groups of 4, dash-separated.
// Example: D3EF-3CFD-8944-42F9-EF40-C982-82F8-E077
function generateRecoveryKey() {
  const hex = crypto.randomBytes(16).toString('hex').toUpperCase();
  return hex.match(/.{4}/g).join('-');
}

function normalizeRecoveryKey(input) {
  if (typeof input !== 'string') return '';
  const stripped = input.replace(/[\s-]/g, '').toUpperCase();
  if (!/^[0-9A-F]{32}$/.test(stripped)) return '';
  return stripped.match(/.{4}/g).join('-');
}

// Create a brand new key slot set for a new user.
// Returns { userKey, recoveryKey, fields } where fields contains the blobs to
// persist on the users row.
function createKeySlots(password) {
  const userKey = crypto.randomBytes(KEY_BYTES);
  const recoveryKey = generateRecoveryKey();

  const passwordSalt = crypto.randomBytes(SALT_BYTES);
  const recoverySalt = crypto.randomBytes(SALT_BYTES);

  const passwordKek = deriveKek(password, passwordSalt);
  const recoveryKek = deriveKek(recoveryKey, recoverySalt);

  const userKeyByPassword = wrap(passwordKek, userKey);
  const userKeyByRecovery = wrap(recoveryKek, userKey);
  const recoveryKeyByPassword = wrap(passwordKek, Buffer.from(recoveryKey, 'utf8'));

  return {
    userKey,
    recoveryKey,
    fields: {
      password_salt: passwordSalt,
      recovery_salt: recoverySalt,
      user_key_by_password: userKeyByPassword,
      user_key_by_recovery: userKeyByRecovery,
      recovery_key_by_password: recoveryKeyByPassword,
    },
  };
}

// Returns the decrypted user key, or null if password is wrong.
function unlockWithPassword(password, row) {
  try {
    const kek = deriveKek(password, row.password_salt);
    return unwrap(kek, row.user_key_by_password);
  } catch {
    return null;
  }
}

// Returns the decrypted user key, or null if recovery key is wrong.
function unlockWithRecovery(recoveryKey, row) {
  const normalized = normalizeRecoveryKey(recoveryKey);
  if (!normalized) return null;
  try {
    const kek = deriveKek(normalized, row.recovery_salt);
    return unwrap(kek, row.user_key_by_recovery);
  } catch {
    return null;
  }
}

// View the current recovery key (requires unlocked password KEK).
function decryptRecoveryKey(password, row) {
  try {
    const kek = deriveKek(password, row.password_salt);
    const plaintext = unwrap(kek, row.recovery_key_by_password);
    return plaintext.toString('utf8');
  } catch {
    return null;
  }
}

// Rewrap user key under a new password. Generates a fresh password salt.
// Returns { fields } to write back to the users row.
function rewrapPassword(userKey, newPassword, currentRecoveryKey) {
  const passwordSalt = crypto.randomBytes(SALT_BYTES);
  const passwordKek = deriveKek(newPassword, passwordSalt);
  const userKeyByPassword = wrap(passwordKek, userKey);
  const recoveryKeyByPassword = wrap(passwordKek, Buffer.from(currentRecoveryKey, 'utf8'));
  return {
    password_salt: passwordSalt,
    user_key_by_password: userKeyByPassword,
    recovery_key_by_password: recoveryKeyByPassword,
  };
}

// Generate a fresh recovery key and rewrap. Also updates recovery_key_by_password.
// Returns { recoveryKey, fields }.
function rotateRecoveryKey(userKey, password, passwordSalt) {
  const recoveryKey = generateRecoveryKey();
  const recoverySalt = crypto.randomBytes(SALT_BYTES);
  const recoveryKek = deriveKek(recoveryKey, recoverySalt);
  const userKeyByRecovery = wrap(recoveryKek, userKey);
  const passwordKek = deriveKek(password, passwordSalt);
  const recoveryKeyByPassword = wrap(passwordKek, Buffer.from(recoveryKey, 'utf8'));
  return {
    recoveryKey,
    fields: {
      recovery_salt: recoverySalt,
      user_key_by_recovery: userKeyByRecovery,
      recovery_key_by_password: recoveryKeyByPassword,
    },
  };
}

module.exports = {
  createKeySlots,
  unlockWithPassword,
  unlockWithRecovery,
  decryptRecoveryKey,
  rewrapPassword,
  rotateRecoveryKey,
  generateRecoveryKey,
  normalizeRecoveryKey,
};
