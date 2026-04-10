/**
 * Liminal Backup Encryption — AES-256-GCM with scrypt key derivation.
 *
 * File format:
 *   [4 bytes: "LMNL" magic]
 *   [1 byte:  version 0x03]
 *   [16 bytes: scrypt salt]
 *   [12 bytes: AES-GCM IV]
 *   [16 bytes: GCM auth tag]
 *   [rest:     ciphertext]
 */

const crypto = require('crypto');

const MAGIC = Buffer.from('LMNL', 'ascii');
const VERSION = 0x03;
const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;
const HEADER_LEN = MAGIC.length + 1 + SALT_LEN + IV_LEN + TAG_LEN; // 49 bytes

// scrypt params — N=2^15, r=8, p=1 balances security and speed (~100ms on modern hardware)
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 32; // 256-bit key

function deriveKey(password, salt) {
  return crypto.scryptSync(password, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
}

/**
 * Encrypt a JSON string with AES-256-GCM.
 * @param {string} jsonString — the plaintext JSON to encrypt
 * @param {string} password — user's Liminal password
 * @returns {Buffer} — encrypted binary with LMNL header
 */
function encrypt(jsonString, password) {
  const salt = crypto.randomBytes(SALT_LEN);
  const iv = crypto.randomBytes(IV_LEN);
  const key = deriveKey(password, salt);

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(jsonString, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([
    MAGIC,
    Buffer.from([VERSION]),
    salt,
    iv,
    tag,
    encrypted,
  ]);
}

/**
 * Decrypt a .liminal backup file.
 * @param {Buffer} buf — the encrypted buffer (with LMNL header)
 * @param {string} password — user's Liminal password
 * @returns {string} — decrypted JSON string
 * @throws {Error} if magic bytes are wrong, version unsupported, or password incorrect
 */
function decrypt(buf, password) {
  if (buf.length < HEADER_LEN) {
    throw new Error('File too small to be a valid Liminal backup');
  }

  const magic = buf.subarray(0, 4);
  if (!magic.equals(MAGIC)) {
    throw new Error('Not a Liminal encrypted backup (invalid header)');
  }

  const version = buf[4];
  if (version !== VERSION) {
    throw new Error(`Unsupported backup version: ${version}`);
  }

  const salt = buf.subarray(5, 5 + SALT_LEN);
  const iv = buf.subarray(5 + SALT_LEN, 5 + SALT_LEN + IV_LEN);
  const tag = buf.subarray(5 + SALT_LEN + IV_LEN, HEADER_LEN);
  const ciphertext = buf.subarray(HEADER_LEN);

  const key = deriveKey(password, salt);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  try {
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    throw new Error('Decryption failed — wrong password or corrupted file');
  }
}

/**
 * Check if a buffer starts with the LMNL magic header.
 */
function isEncrypted(buf) {
  return buf.length >= 4 && buf.subarray(0, 4).equals(MAGIC);
}

module.exports = { encrypt, decrypt, isEncrypted };
