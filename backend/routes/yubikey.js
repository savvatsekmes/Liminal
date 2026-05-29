// YubiKey 2FA enrollment / disable / status endpoints.
//
// The actual WebAuthn ceremony happens in Chromium (the renderer process).
// We only:
//   - hand the renderer the parameters for navigator.credentials.create() and
//     .get() (challenge, prf_salt, credential_id)
//   - accept the prf_output the browser returned from the YubiKey tap, and
//     use it to wrap or unwrap user_key
//   - flip the yubikey_enabled flag on the users row
//
// We do NOT verify the WebAuthn signature server-side. In this single-user
// local app the threat model assumes the renderer and server are part of the
// same trust boundary (Electron app on one device, localhost-only traffic).
// The cryptographic check that the user actually possesses the right physical
// key is implicit: only the correct key can produce the prf_output that
// unwraps user_key_by_yubikey, and AES-GCM authentication catches any
// mismatch as a tag failure.

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../database');
const { requireAuth } = require('../middleware/auth');
const userCrypto = require('../services/userCrypto');
const yubikeyCrypto = require('../services/yubikeyCrypto');
const rowCrypto = require('../services/rowCrypto');
const yubikeyNative = require('../services/yubikeyNative');

router.use(requireAuth);

const KEY_FIELDS = `password_salt, recovery_salt, user_key_by_password, user_key_by_recovery, recovery_key_by_password, encryption_version, yubikey_enabled, yubikey_credential_id, yubikey_prf_salt, user_key_by_yubikey`;

// ── GET /api/yubikey/status ──────────────────────────────────────────────────
// Lightweight read for the Settings panel and the lock-screen banner. Returns
// enrollment state plus the parameters needed to re-run a PRF assertion (for
// disable). The credential_id and prf_salt are not secrets — they're useless
// without the physical key.
router.get('/status', (req, res) => {
  const user = db.prepare('SELECT yubikey_enabled, yubikey_credential_id, yubikey_prf_salt FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (!user.yubikey_enabled) return res.json({ enabled: false });
  res.json({
    enabled: true,
    credential_id: user.yubikey_credential_id ? Buffer.from(user.yubikey_credential_id).toString('base64') : null,
    prf_salt: user.yubikey_prf_salt ? Buffer.from(user.yubikey_prf_salt).toString('base64') : null,
  });
});

// ── POST /api/yubikey/enroll-options ────────────────────────────────────────
// Returns the parameters the renderer needs to call navigator.credentials.create()
// + a follow-up .get() to extract the prf_output. We also require the user to
// re-confirm their password here so an unattended unlocked app can't be used
// to silently enroll a key without the legitimate user's knowledge.
router.post('/enroll-options', async (req, res) => {
  const { currentPassword, recovery_ack } = req.body || {};
  if (!currentPassword) return res.status(400).json({ error: 'Current password required' });
  if (!recovery_ack) return res.status(400).json({ error: 'You must confirm your recovery key is saved' });

  const user = db.prepare(`SELECT id, username, password_hash, ${KEY_FIELDS} FROM users WHERE id = ?`).get(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.yubikey_enabled) return res.status(400).json({ error: 'YubiKey already enrolled. Disable it first.' });

  const valid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Password is incorrect' });

  const challenge = crypto.randomBytes(32);
  const prfSalt = yubikeyCrypto.generatePrfSalt();
  // Stash a short-lived enrollment ticket so /enroll-complete can correlate
  // the user's password verification with the credential being created. The
  // ticket also carries the prf_salt so it's the same one we hand the
  // renderer and the one we persist.
  res.json({
    challenge: challenge.toString('base64'),
    prf_salt: prfSalt.toString('base64'),
    rp: { id: 'localhost', name: 'Liminal' },
    user: {
      // 32 random bytes — WebAuthn user.id is meant to be opaque and not
      // contain PII. The numeric DB id would be fine too, but random is
      // cleaner.
      id: crypto.randomBytes(32).toString('base64'),
      name: user.username,
      displayName: user.username,
    },
  });
});

// ── POST /api/yubikey/enroll-complete ───────────────────────────────────────
// Renderer has just run navigator.credentials.create() + .get(). It posts
// the resulting credential_id + prf_output here. We wrap user_key with a
// key derived from prf_output, persist the credential, and DROP the
// password wrapper (true 2FA).
router.post('/enroll-complete', async (req, res) => {
  const { currentPassword, credential_id, prf_output, prf_salt } = req.body || {};
  if (!currentPassword || !credential_id || !prf_output || !prf_salt) {
    return res.status(400).json({ error: 'currentPassword, credential_id, prf_output and prf_salt required' });
  }

  const user = db.prepare(`SELECT id, password_hash, ${KEY_FIELDS} FROM users WHERE id = ?`).get(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.yubikey_enabled) return res.status(400).json({ error: 'YubiKey already enrolled. Disable it first.' });

  const valid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Password is incorrect' });

  if (user.encryption_version !== 1 || !user.user_key_by_password) {
    return res.status(400).json({ error: 'Account not in encrypted state — log out and back in to migrate first.' });
  }

  // Unwrap user_key the standard way (password) so we can rewrap with prf.
  const userKey = userCrypto.unlockWithPassword(currentPassword, user);
  if (!userKey) return res.status(500).json({ error: 'Could not unlock account key' });

  let prfBuf, credIdBuf, saltBuf;
  try {
    prfBuf = Buffer.from(prf_output, 'base64');
    credIdBuf = Buffer.from(credential_id, 'base64');
    saltBuf = Buffer.from(prf_salt, 'base64');
  } catch { return res.status(400).json({ error: 'Invalid base64 in payload' }); }
  if (prfBuf.length !== 32) return res.status(400).json({ error: 'Invalid prf_output length' });
  if (saltBuf.length !== 32) return res.status(400).json({ error: 'Invalid prf_salt length' });
  if (credIdBuf.length < 16 || credIdBuf.length > 1024) return res.status(400).json({ error: 'Invalid credential_id length' });

  const userKeyByYubikey = yubikeyCrypto.wrapUserKeyWithPrf(userKey, prfBuf);

  db.prepare(`
    UPDATE users SET
      yubikey_enabled = 1,
      yubikey_credential_id = ?,
      yubikey_prf_salt = ?,
      user_key_by_yubikey = ?,
      user_key_by_password = NULL
    WHERE id = ?
  `).run(credIdBuf, saltBuf, userKeyByYubikey, req.userId);

  res.json({ enabled: true });
});

// ── POST /api/yubikey/disable ───────────────────────────────────────────────
// Requires the current password + a fresh PRF assertion (caller passes the
// prf_output it just got from navigator.credentials.get()). We rewrap
// user_key with the password KEK to restore user_key_by_password, then clear
// the yubikey_* fields.
router.post('/disable', async (req, res) => {
  const { currentPassword, prf_output } = req.body || {};
  if (!currentPassword || !prf_output) {
    return res.status(400).json({ error: 'currentPassword and prf_output required' });
  }

  const user = db.prepare(`SELECT id, password_hash, ${KEY_FIELDS} FROM users WHERE id = ?`).get(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (!user.yubikey_enabled || !user.user_key_by_yubikey) {
    return res.status(400).json({ error: 'YubiKey is not enabled' });
  }

  const valid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Password is incorrect' });

  let prfBuf;
  try { prfBuf = Buffer.from(prf_output, 'base64'); } catch { prfBuf = null; }
  if (!prfBuf || prfBuf.length !== 32) {
    return res.status(400).json({ error: 'Invalid prf_output' });
  }

  const userKey = yubikeyCrypto.unwrapUserKeyWithPrf(user.user_key_by_yubikey, prfBuf);
  if (!userKey) return res.status(401).json({ error: 'Hardware key did not match the enrolled credential' });

  // Restore password wrapper.
  const rewrap = userCrypto.rewrapPassword(userKey, currentPassword,
    userCrypto.decryptRecoveryKey(currentPassword, user) || ''
  );

  db.prepare(`
    UPDATE users SET
      password_salt = ?,
      user_key_by_password = ?,
      recovery_key_by_password = ?,
      yubikey_enabled = 0,
      yubikey_credential_id = NULL,
      yubikey_prf_salt = NULL,
      user_key_by_yubikey = NULL
    WHERE id = ?
  `).run(
    rewrap.password_salt,
    rewrap.user_key_by_password,
    rewrap.recovery_key_by_password,
    req.userId,
  );

  // Refresh the in-memory user key (same value, but rotate so callers can't
  // hold a stale reference if the DB row was the source of truth).
  rowCrypto.setUserKey(req.userId, userKey);

  res.json({ enabled: false });
});

// ── POST /api/yubikey/native-enroll ─────────────────────────────────────────
// macOS-only enrollment path. Electron's Chromium can't surface the FIDO2
// PIN dialog, so we spawn the bundled yubikey_helper which talks CTAP2
// directly to the device. The helper does makeCredential + immediate
// assertion in one shot and returns credential_id + prf_salt + prf_output
// in a single response — the equivalent of enroll-options + enroll-complete
// combined. Frontend posts here once with the password + recovery
// acknowledgement, and (after the first attempt returns PIN_REQUIRED) again
// with the user-supplied PIN.
router.post('/native-enroll', async (req, res) => {
  const { currentPassword, recovery_ack, pin } = req.body || {};
  if (!currentPassword) return res.status(400).json({ error: 'Current password required' });
  if (!recovery_ack) return res.status(400).json({ error: 'You must confirm your recovery key is saved' });

  const user = db.prepare(`SELECT id, password_hash, ${KEY_FIELDS} FROM users WHERE id = ?`).get(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.yubikey_enabled) return res.status(400).json({ error: 'YubiKey already enrolled. Disable it first.' });

  const valid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Password is incorrect' });

  if (user.encryption_version !== 1 || !user.user_key_by_password) {
    return res.status(400).json({ error: 'Account not in encrypted state — log out and back in to migrate first.' });
  }

  // Unwrap user_key while we have the password — we need it to rewrap with prf.
  const userKey = userCrypto.unlockWithPassword(currentPassword, user);
  if (!userKey) return res.status(500).json({ error: 'Could not unlock account key' });

  let helperResult;
  try {
    helperResult = await yubikeyNative.enroll({ pin });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'YubiKey helper failed' });
  }

  if (helperResult.error_code === yubikeyNative.PIN_REQUIRED_CODE) {
    // Surface the sentinel so the frontend shows a PIN field and retries.
    return res.status(422).json({
      error: helperResult.error,
      error_code: yubikeyNative.PIN_REQUIRED_CODE,
    });
  }
  if (helperResult.error) {
    return res.status(400).json({ error: helperResult.error });
  }

  let prfBuf, credIdBuf, saltBuf;
  try {
    prfBuf = Buffer.from(helperResult.prf_output, 'base64');
    credIdBuf = Buffer.from(helperResult.credential_id, 'base64');
    saltBuf = Buffer.from(helperResult.prf_salt, 'base64');
  } catch {
    return res.status(500).json({ error: 'YubiKey helper returned invalid base64' });
  }
  if (prfBuf.length !== 32) return res.status(500).json({ error: 'Helper prf_output length wrong' });
  if (saltBuf.length !== 32) return res.status(500).json({ error: 'Helper prf_salt length wrong' });

  const userKeyByYubikey = yubikeyCrypto.wrapUserKeyWithPrf(userKey, prfBuf);

  db.prepare(`
    UPDATE users SET
      yubikey_enabled = 1,
      yubikey_credential_id = ?,
      yubikey_prf_salt = ?,
      user_key_by_yubikey = ?,
      user_key_by_password = NULL
    WHERE id = ?
  `).run(credIdBuf, saltBuf, userKeyByYubikey, req.userId);

  res.json({ enabled: true });
});

// ── POST /api/yubikey/native-disable ────────────────────────────────────────
// macOS counterpart of /disable — the existing /disable expects a prf_output
// from a prior WebAuthn assertion. Here we run the helper directly using the
// stored credential_id + prf_salt, then do the same rewrap+clear the
// /disable endpoint does.
router.post('/native-disable', async (req, res) => {
  const { currentPassword, pin } = req.body || {};
  if (!currentPassword) return res.status(400).json({ error: 'Current password required' });

  const user = db.prepare(`SELECT id, password_hash, ${KEY_FIELDS} FROM users WHERE id = ?`).get(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (!user.yubikey_enabled || !user.user_key_by_yubikey) {
    return res.status(400).json({ error: 'YubiKey is not enabled' });
  }

  const valid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Password is incorrect' });

  let helperResult;
  try {
    helperResult = await yubikeyNative.assert({
      credentialId: Buffer.from(user.yubikey_credential_id).toString('base64'),
      salt: Buffer.from(user.yubikey_prf_salt).toString('base64'),
      pin,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'YubiKey helper failed' });
  }

  if (helperResult.error_code === yubikeyNative.PIN_REQUIRED_CODE) {
    return res.status(422).json({
      error: helperResult.error,
      error_code: yubikeyNative.PIN_REQUIRED_CODE,
    });
  }
  if (helperResult.error) {
    return res.status(400).json({ error: helperResult.error });
  }

  let prfBuf;
  try { prfBuf = Buffer.from(helperResult.prf_output, 'base64'); } catch { prfBuf = null; }
  if (!prfBuf || prfBuf.length !== 32) {
    return res.status(500).json({ error: 'Helper returned invalid prf_output' });
  }

  const userKey = yubikeyCrypto.unwrapUserKeyWithPrf(user.user_key_by_yubikey, prfBuf);
  if (!userKey) return res.status(401).json({ error: 'Hardware key did not match the enrolled credential' });

  const rewrap = userCrypto.rewrapPassword(userKey, currentPassword,
    userCrypto.decryptRecoveryKey(currentPassword, user) || ''
  );

  db.prepare(`
    UPDATE users SET
      password_salt = ?,
      user_key_by_password = ?,
      recovery_key_by_password = ?,
      yubikey_enabled = 0,
      yubikey_credential_id = NULL,
      yubikey_prf_salt = NULL,
      user_key_by_yubikey = NULL
    WHERE id = ?
  `).run(
    rewrap.password_salt,
    rewrap.user_key_by_password,
    rewrap.recovery_key_by_password,
    req.userId,
  );

  rowCrypto.setUserKey(req.userId, userKey);
  res.json({ enabled: false });
});

module.exports = router;
