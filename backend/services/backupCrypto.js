/**
 * Liminal Backup Encryption.
 *
 * THREE on-disk formats. Going forward, only v5 is produced; v3 and v4 stay
 * readable for any pre-existing files in the wild.
 *
 *   v3 (legacy): plaintext-inside, password-only outer.
 *     [4 bytes:  "LMNL" magic]
 *     [1 byte:   0x03]
 *     [16 bytes: scrypt salt]
 *     [12 bytes: AES-GCM IV]
 *     [16 bytes: GCM auth tag]
 *     [rest:     ciphertext of plaintext JSON dump]
 *
 *   v4 (deprecated, briefly shipped): plaintext-inside, optionally YubiKey-
 *     mixed outer KDF. Same structural shape as v5's outer-only protection
 *     but the inner data was plaintext, which meant decrypting the outer
 *     layer exposed all entries. Replaced by v5 to close that bypass.
 *     [4 bytes:  "LMNL"]  [1 byte: 0x04]  [1 byte: flags]
 *     if (flags & 0x01) [2 bytes BE cred_len][cred_id][32 bytes prf_salt]
 *     [16 bytes: scrypt salt]  [12 IV]  [16 tag]  [ciphertext of plaintext]
 *
 *   v5 (current): ciphertext-inside, password-only outer. The inner JSON
 *     contains an envelope that includes the backup-time user_key WRAPPED
 *     by the original account's available wrappers (password-derived or
 *     yubikey-derived). All sensitive content (entries, notes, oracle
 *     messages, reflections, memories) stays encrypted with user_key. To
 *     read the entries, the restorer must produce the original user_key —
 *     which means tapping the original YubiKey or supplying the original
 *     password. Password alone on a yubikey-protected account no longer
 *     suffices.
 *
 *     [4 bytes: "LMNL"]
 *     [1 byte: 0x05]
 *     [16 bytes: outer scrypt salt]
 *     [12 bytes: outer AES-GCM IV]
 *     [16 bytes: outer GCM auth tag]
 *     [rest:    outer ciphertext (a JSON string) of the inner envelope]
 *
 *     Inner envelope (decrypted JSON) shape:
 *       {
 *         "inner_version": 1,
 *         "yubikey": null | {
 *             "credential_id": base64,
 *             "prf_salt":      base64,
 *             "user_key_wrapped": base64    // AES-GCM(prf-derived, user_key)
 *         },
 *         "password_wrap": null | {
 *             "salt": base64,                // backup-time password salt
 *             "user_key_wrapped": base64    // AES-GCM(scrypt(pw,salt), user_key)
 *         },
 *         "data": { entries, notes, ... }   // sensitive cols still lenc:v1:
 *       }
 *
 *     "password_wrap" is present iff the backup-time account had a working
 *     user_key_by_password — i.e. the account did NOT have YubiKey enabled.
 *     "yubikey" is present iff the backup-time account had YubiKey enabled.
 *     At least one of the two is present. Restore tries yubikey first if
 *     present (prompts for tap); falls through to password_wrap if not.
 *
 *     "data" carries the same field-encrypted blobs that exist in the live
 *     DB — they decrypt with the backup-time user_key, not the importing
 *     user's key. The import flow re-encrypts after decryption.
 */

const crypto = require('crypto');

const MAGIC = Buffer.from('LMNL', 'ascii');
const VERSION_V3 = 0x03;
const VERSION_V4 = 0x04;
const VERSION_V5 = 0x05;
const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;
const PRF_SALT_LEN = 32;
const KEY_LEN = 32;

// scrypt params — N=2^15, r=8, p=1 balances security and speed (~100ms on modern hardware)
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

const FLAG_YUBIKEY = 0x01; // v4 only

function deriveOuterKey(password, salt) {
  return crypto.scryptSync(password, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
}

// v4 only — outer key mixed with PRF output via HKDF. Kept for backward
// compatibility on read; v5 always uses plain scrypt(password, salt) outer
// because the protection now lives inside the envelope.
function deriveOuterKeyV4WithPrf(password, scryptSalt, prfOutput) {
  const passwordKek = deriveOuterKey(password, scryptSalt);
  const empty = Buffer.alloc(0);
  const ikm = Buffer.concat([passwordKek, Buffer.from(prfOutput)]);
  const info = Buffer.from('liminal-backup-yubi-v1', 'utf8');
  return Buffer.from(crypto.hkdfSync('sha256', ikm, empty, info, KEY_LEN));
}

// Used by v5 inner envelope to derive a wrapping key from the user's PRF
// output. Mirrors backend/services/yubikeyCrypto.js#deriveWrappingKey so the
// same physical key + same prf_salt produces the same 32-byte wrapping key
// in both contexts.
function derivePrfWrappingKey(prfOutput) {
  const empty = Buffer.alloc(0);
  const info = Buffer.from('liminal-yubikey-prf-wrap-v1', 'utf8');
  return Buffer.from(crypto.hkdfSync('sha256', Buffer.from(prfOutput), empty, info, KEY_LEN));
}

function aesGcmWrap(key, plaintext) {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ct, tag]);
}
function aesGcmUnwrap(key, wrapped) {
  const iv = wrapped.subarray(0, IV_LEN);
  const tag = wrapped.subarray(wrapped.length - TAG_LEN);
  const ct = wrapped.subarray(IV_LEN, wrapped.length - TAG_LEN);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

/**
 * Sniff the version byte and return a header descriptor. Doesn't decrypt
 * anything. Used by the restore endpoint to decide which code path to run.
 */
function parseHeader(buf) {
  if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf);
  if (buf.length < 5) throw new Error('File too small to be a valid Liminal backup');
  if (!buf.subarray(0, 4).equals(MAGIC)) {
    throw new Error('Not a Liminal encrypted backup (invalid header)');
  }
  const version = buf[4];

  if (version === VERSION_V3) {
    return { version, kind: 'v3', outerStart: 5 };
  }

  if (version === VERSION_V4) {
    const flags = buf[5];
    const yubikeyOuter = (flags & FLAG_YUBIKEY) !== 0;
    let cursor = 6;
    let credentialId = null;
    let prfSalt = null;
    if (yubikeyOuter) {
      const credIdLen = buf.readUInt16BE(cursor); cursor += 2;
      credentialId = buf.subarray(cursor, cursor + credIdLen); cursor += credIdLen;
      prfSalt = buf.subarray(cursor, cursor + PRF_SALT_LEN); cursor += PRF_SALT_LEN;
    }
    return {
      version,
      kind: 'v4',
      flags,
      yubikeyOuter,
      credentialId,
      prfSalt,
      outerStart: cursor,
    };
  }

  if (version === VERSION_V5) {
    return { version, kind: 'v5', outerStart: 5 };
  }

  throw new Error(`Unsupported backup version: ${version}`);
}

function readOuterStruct(buf, outerStart) {
  if (buf.length < outerStart + SALT_LEN + IV_LEN + TAG_LEN) {
    throw new Error('Backup truncated');
  }
  const salt = buf.subarray(outerStart, outerStart + SALT_LEN);
  const iv = buf.subarray(outerStart + SALT_LEN, outerStart + SALT_LEN + IV_LEN);
  const tag = buf.subarray(outerStart + SALT_LEN + IV_LEN, outerStart + SALT_LEN + IV_LEN + TAG_LEN);
  const ct = buf.subarray(outerStart + SALT_LEN + IV_LEN + TAG_LEN);
  return { salt, iv, tag, ct };
}

/**
 * Build a v5 backup. Takes the in-memory user_key + (optionally) the user's
 * yubikey enrollment data + password wrapping info. The caller is the backup
 * route, which has all of this available.
 *
 * inputs:
 *   data:           the export data object (entries: ciphertext, etc.)
 *   password:       outer file password
 *   userKey:        the backup-time account's 32-byte user_key, AS A BUFFER
 *   yubikeyInfo:    { credentialId: Buffer, prfSalt: Buffer, prfOutput: Buffer } or null
 *   passwordWrap:   { salt: Buffer, scryptOf: 'password' } or null
 *
 * Exactly one of yubikeyInfo / passwordWrap should be present (since the
 * account's user_key is wrapped by exactly one of those at any given time
 * — yubikey replaces password wrap at enrollment, recovery is a separate
 * wrapper not used in the backup file).
 */
function buildV5(data, password, userKey, yubikeyInfo, passwordWrap) {
  if (!Buffer.isBuffer(userKey) || userKey.length !== KEY_LEN) {
    throw new Error(`userKey must be ${KEY_LEN} bytes`);
  }

  const envelope = {
    inner_version: 1,
    yubikey: null,
    password_wrap: null,
    data,
  };

  if (yubikeyInfo) {
    const wrappingKey = derivePrfWrappingKey(yubikeyInfo.prfOutput);
    envelope.yubikey = {
      credential_id: Buffer.from(yubikeyInfo.credentialId).toString('base64'),
      prf_salt: Buffer.from(yubikeyInfo.prfSalt).toString('base64'),
      user_key_wrapped: aesGcmWrap(wrappingKey, userKey).toString('base64'),
    };
  }

  if (passwordWrap) {
    const passwordKek = deriveOuterKey(password, passwordWrap.salt);
    envelope.password_wrap = {
      salt: Buffer.from(passwordWrap.salt).toString('base64'),
      user_key_wrapped: aesGcmWrap(passwordKek, userKey).toString('base64'),
    };
  }

  if (!envelope.yubikey && !envelope.password_wrap) {
    throw new Error('Backup requires at least one of yubikey or password_wrap');
  }

  // Outer layer — password-only, simple scrypt.
  const outerSalt = crypto.randomBytes(SALT_LEN);
  const outerIv = crypto.randomBytes(IV_LEN);
  const outerKey = deriveOuterKey(password, outerSalt);
  const cipher = crypto.createCipheriv('aes-256-gcm', outerKey, outerIv);
  const envBuf = Buffer.from(JSON.stringify(envelope), 'utf8');
  const outerCt = Buffer.concat([cipher.update(envBuf), cipher.final()]);
  const outerTag = cipher.getAuthTag();

  return Buffer.concat([
    MAGIC,
    Buffer.from([VERSION_V5]),
    outerSalt,
    outerIv,
    outerTag,
    outerCt,
  ]);
}

/**
 * Decrypt the outer layer of a v5 backup with a password. Returns the parsed
 * envelope JSON object. Does NOT unwrap user_key — that's a second step the
 * restore route handles (with or without a YubiKey assertion).
 */
function decryptV5Outer(buf, password) {
  const header = parseHeader(buf);
  if (header.kind !== 'v5') throw new Error('Not a v5 backup');
  const { salt, iv, tag, ct } = readOuterStruct(buf, header.outerStart);
  const key = deriveOuterKey(password, salt);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  try {
    const decrypted = Buffer.concat([decipher.update(ct), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
  } catch {
    throw new Error('Decryption failed — wrong password or corrupted file');
  }
}

/**
 * Unwrap the backup-time user_key from a v5 envelope using a YubiKey PRF
 * output (the renderer just got from navigator.credentials.get()). Returns
 * a 32-byte Buffer.
 */
function unwrapUserKeyWithPrfFromEnvelope(envelope, prfOutput) {
  if (!envelope?.yubikey?.user_key_wrapped) return null;
  try {
    const wrappingKey = derivePrfWrappingKey(prfOutput);
    const wrapped = Buffer.from(envelope.yubikey.user_key_wrapped, 'base64');
    return aesGcmUnwrap(wrappingKey, wrapped);
  } catch {
    return null;
  }
}

/**
 * Unwrap the backup-time user_key from a v5 envelope using the original
 * account's password (which is the same password we used to open the outer
 * layer — non-yubikey accounts only). Returns a 32-byte Buffer.
 *
 * IMPORTANT: this uses PBKDF2-SHA512/600k to match userCrypto.deriveKek,
 * because envelope.password_wrap.user_key_wrapped is the live account's
 * user_key_by_password blob copied verbatim — it was originally wrapped
 * by userCrypto.wrap(deriveKek(password, salt), userKey) at registration
 * time. Using scrypt here (like the outer layer does) would produce a
 * different key and the GCM auth tag would fail.
 */
function unwrapUserKeyWithPasswordFromEnvelope(envelope, password) {
  if (!envelope?.password_wrap?.user_key_wrapped) return null;
  try {
    const salt = Buffer.from(envelope.password_wrap.salt, 'base64');
    const wrapped = Buffer.from(envelope.password_wrap.user_key_wrapped, 'base64');
    // Match userCrypto.deriveKek: PBKDF2-SHA512, 600k iterations, 32 bytes.
    const kek = crypto.pbkdf2Sync(password, salt, 600_000, KEY_LEN, 'sha512');
    return aesGcmUnwrap(kek, wrapped);
  } catch {
    return null;
  }
}

/**
 * Legacy v3 / v4 reader. Returns the decrypted JSON string. v4 with the
 * yubikey-outer flag requires a prfOutput in opts.
 *
 * Both formats embed PLAINTEXT inside the outer encryption — once the
 * outer layer is open, sensitive content is readable directly. (This is
 * the bypass v5 fixes.) The legacy reader is here so we can still restore
 * any backups the user already has lying around.
 */
function decryptLegacy(buf, password, opts = {}) {
  const header = parseHeader(buf);

  if (header.kind === 'v3') {
    const { salt, iv, tag, ct } = readOuterStruct(buf, header.outerStart);
    const key = deriveOuterKey(password, salt);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    try {
      return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
    } catch {
      throw new Error('Decryption failed — wrong password or corrupted file');
    }
  }

  if (header.kind === 'v4') {
    const { salt, iv, tag, ct } = readOuterStruct(buf, header.outerStart);
    let key;
    if (header.yubikeyOuter) {
      if (!opts.prfOutput) {
        const err = new Error('This backup is hardware-key protected. Tap your YubiKey to decrypt.');
        err.code = 'YUBIKEY_REQUIRED';
        err.credential_id = header.credentialId;
        err.prf_salt = header.prfSalt;
        throw err;
      }
      key = deriveOuterKeyV4WithPrf(password, salt, opts.prfOutput);
    } else {
      key = deriveOuterKey(password, salt);
    }
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    try {
      return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
    } catch {
      throw new Error('Decryption failed — wrong password, wrong hardware key, or corrupted file');
    }
  }

  throw new Error('decryptLegacy called on non-legacy format — use decryptV5Outer for v5');
}

/** Magic-bytes sniff. */
function isEncrypted(buf) {
  return Buffer.isBuffer(buf) && buf.length >= 4 && buf.subarray(0, 4).equals(MAGIC);
}

module.exports = {
  isEncrypted,
  parseHeader,
  // v5 (current)
  buildV5,
  decryptV5Outer,
  unwrapUserKeyWithPrfFromEnvelope,
  unwrapUserKeyWithPasswordFromEnvelope,
  // legacy reader
  decryptLegacy,
};
