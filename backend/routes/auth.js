const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../database');
const { DATA_DIR } = require('../paths');
const { signToken, requireAuth } = require('../middleware/auth');
const userCrypto = require('../services/userCrypto');
const rowCrypto = require('../services/rowCrypto');
const { migrateLegacyUserRows } = require('../services/legacyRowMigration');

const avatarDir = path.join(DATA_DIR, 'avatars');
if (!fs.existsSync(avatarDir)) fs.mkdirSync(avatarDir, { recursive: true });

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: avatarDir,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.png';
      cb(null, `user_${req.userId}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|gif|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files allowed'));
  },
});

const SALT_ROUNDS = 12;

// Columns we load for crypto-sensitive paths. Kept narrow to avoid accidentally
// logging blobs elsewhere.
const KEY_FIELDS = `password_salt, recovery_salt, user_key_by_password, user_key_by_recovery, recovery_key_by_password, encryption_version`;

// ── GET /api/auth/status ─────────────────────────────────────────────────────
// Returns whether any users exist (for first-launch detection)
router.get('/status', (req, res) => {
  const count = db.prepare('SELECT COUNT(*) as n FROM users').get().n;
  res.json({ hasUsers: count > 0 });
});

// ── POST /api/auth/register ──────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  const { username, password, agreed_to_terms } = req.body;
  if (!username?.trim()) return res.status(400).json({ error: 'Username is required' });
  if (!password || password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });
  if (!agreed_to_terms) return res.status(400).json({ error: 'You must agree to the Terms of Service' });

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim());
  if (existing) return res.status(409).json({ error: 'Username already taken' });

  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  const { userKey, recoveryKey, fields } = userCrypto.createKeySlots(password);

  const result = db.prepare(`
    INSERT INTO users (
      username, password_hash, terms_accepted_at,
      password_salt, recovery_salt,
      user_key_by_password, user_key_by_recovery, recovery_key_by_password,
      encryption_version
    ) VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, 1)
  `).run(
    username.trim(), hash,
    fields.password_salt, fields.recovery_salt,
    fields.user_key_by_password, fields.user_key_by_recovery, fields.recovery_key_by_password,
  );
  const userId = result.lastInsertRowid;

  rowCrypto.setUserKey(userId, userKey);
  db.prepare('INSERT INTO portrait (user_id) VALUES (?)').run(userId);

  const token = signToken(userId, username.trim());
  // recovery_key is returned ONCE on registration — frontend must show it to
  // the user and make them confirm they've saved it before proceeding.
  res.json({ token, username: username.trim(), onboarding_complete: false, recovery_key: recoveryKey });
});

// ── POST /api/auth/login ─────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const user = db.prepare(`SELECT id, username, password_hash, onboarding_complete, ${KEY_FIELDS} FROM users WHERE username = ?`).get(username.trim());
  if (!user) return res.status(401).json({ error: 'Invalid username or password' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid username or password' });

  let recoveryKeyToShow = null;

  if (user.encryption_version === 1 && user.user_key_by_password) {
    // Standard case: unwrap user key.
    const userKey = userCrypto.unlockWithPassword(password, user);
    if (!userKey) {
      // Password matches bcrypt but key unwrap failed — shouldn't happen unless
      // the row is corrupted. Refuse to log in rather than silently break things.
      return res.status(500).json({ error: 'Account key could not be unlocked. Please contact support.' });
    }
    rowCrypto.setUserKey(user.id, userKey);
  } else {
    // Legacy user with no wrapped keys yet. Generate slots, encrypt existing
    // rows, and return the recovery key so the UI can show it.
    const { userKey, recoveryKey, fields } = userCrypto.createKeySlots(password);
    rowCrypto.setUserKey(user.id, userKey);
    try {
      migrateLegacyUserRows(user.id);
    } catch (err) {
      rowCrypto.clearUserKey(user.id);
      console.error('[auth] legacy row migration failed:', err);
      return res.status(500).json({ error: 'Could not migrate your journal to encrypted storage. Please try again.' });
    }
    db.prepare(`
      UPDATE users SET
        password_salt = ?, recovery_salt = ?,
        user_key_by_password = ?, user_key_by_recovery = ?, recovery_key_by_password = ?,
        encryption_version = 1
      WHERE id = ?
    `).run(
      fields.password_salt, fields.recovery_salt,
      fields.user_key_by_password, fields.user_key_by_recovery, fields.recovery_key_by_password,
      user.id,
    );
    recoveryKeyToShow = recoveryKey;
  }

  db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
  const token = signToken(user.id, user.username);
  res.json({
    token,
    username: user.username,
    onboarding_complete: !!user.onboarding_complete,
    recovery_key: recoveryKeyToShow,
  });
});

// ── POST /api/auth/change ────────────────────────────────────────────────────
router.post('/change', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'currentPassword and newPassword required' });
  if (newPassword.length < 4) return res.status(400).json({ error: 'New password must be at least 4 characters' });

  const user = db.prepare(`SELECT password_hash, ${KEY_FIELDS} FROM users WHERE id = ?`).get(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const valid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

  const userKey = userCrypto.unlockWithPassword(currentPassword, user);
  const currentRecoveryKey = userCrypto.decryptRecoveryKey(currentPassword, user);
  if (!userKey || !currentRecoveryKey) {
    return res.status(500).json({ error: 'Account key could not be read with current password' });
  }

  const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  const rewrap = userCrypto.rewrapPassword(userKey, newPassword, currentRecoveryKey);
  db.prepare(`
    UPDATE users SET
      password_hash = ?,
      password_salt = ?,
      user_key_by_password = ?,
      recovery_key_by_password = ?
    WHERE id = ?
  `).run(
    hash,
    rewrap.password_salt,
    rewrap.user_key_by_password,
    rewrap.recovery_key_by_password,
    req.userId,
  );
  rowCrypto.setUserKey(req.userId, userKey);
  res.json({ success: true });
});

// ── POST /api/auth/recover ──────────────────────────────────────────────────
// Forgot password flow: unlock via recovery key, then set a new password.
router.post('/recover', async (req, res) => {
  const { username, recovery_key, newPassword } = req.body;
  if (!username || !recovery_key || !newPassword) {
    return res.status(400).json({ error: 'username, recovery_key and newPassword required' });
  }
  if (newPassword.length < 4) return res.status(400).json({ error: 'New password must be at least 4 characters' });

  const user = db.prepare(`SELECT id, username, ${KEY_FIELDS} FROM users WHERE username = ?`).get(username.trim());
  if (!user || user.encryption_version !== 1) {
    return res.status(401).json({ error: 'Account not found or not recoverable' });
  }

  const userKey = userCrypto.unlockWithRecovery(recovery_key, user);
  if (!userKey) return res.status(401).json({ error: 'Recovery key did not match' });

  // Rewrap with the new password. The recovery key itself is unchanged — the
  // user may still have it written down. rewrapPassword needs the current
  // recovery key string; we have it from input (after normalizing).
  const normalizedRk = userCrypto.normalizeRecoveryKey(recovery_key);
  const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  const rewrap = userCrypto.rewrapPassword(userKey, newPassword, normalizedRk);
  db.prepare(`
    UPDATE users SET
      password_hash = ?,
      password_salt = ?,
      user_key_by_password = ?,
      recovery_key_by_password = ?,
      last_login = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    hash,
    rewrap.password_salt,
    rewrap.user_key_by_password,
    rewrap.recovery_key_by_password,
    user.id,
  );

  rowCrypto.setUserKey(user.id, userKey);
  const token = signToken(user.id, user.username);
  res.json({ token, username: user.username });
});

// ── POST /api/auth/recovery-key/view ────────────────────────────────────────
// Requires password. Returns the current recovery key string.
router.post('/recovery-key/view', requireAuth, async (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'Password required' });

  const user = db.prepare(`SELECT password_hash, ${KEY_FIELDS} FROM users WHERE id = ?`).get(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Password is incorrect' });

  const rk = userCrypto.decryptRecoveryKey(password, user);
  if (!rk) return res.status(500).json({ error: 'Could not read recovery key' });
  res.json({ recovery_key: rk });
});

// ── POST /api/auth/recovery-key/regenerate ──────────────────────────────────
// Requires password. Generates a new recovery key (old one stops working).
router.post('/recovery-key/regenerate', requireAuth, async (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'Password required' });

  const user = db.prepare(`SELECT password_hash, ${KEY_FIELDS} FROM users WHERE id = ?`).get(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Password is incorrect' });

  const userKey = userCrypto.unlockWithPassword(password, user);
  if (!userKey) return res.status(500).json({ error: 'Could not unlock account key' });

  const { recoveryKey, fields } = userCrypto.rotateRecoveryKey(userKey, password, user.password_salt);
  db.prepare(`
    UPDATE users SET
      recovery_salt = ?,
      user_key_by_recovery = ?,
      recovery_key_by_password = ?
    WHERE id = ?
  `).run(
    fields.recovery_salt,
    fields.user_key_by_recovery,
    fields.recovery_key_by_password,
    req.userId,
  );
  res.json({ recovery_key: recoveryKey });
});

// ── GET /api/auth/me ─────────────────────────────────────────────────────────
router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT username, onboarding_complete, avatar_path FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({
    user_id: req.userId,
    username: user.username,
    onboarding_complete: !!user.onboarding_complete,
    avatar_url: user.avatar_path ? `/api/auth/avatar/${req.userId}?t=${Date.now()}` : null,
    key_loaded: rowCrypto.hasUserKey(req.userId),
  });
});

// ── POST /api/auth/avatar ───────────────────────────────────────────────────
router.post('/avatar', requireAuth, avatarUpload.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const relativePath = `avatars/${req.file.filename}`;
  db.prepare('UPDATE users SET avatar_path = ? WHERE id = ?').run(relativePath, req.userId);
  res.json({ success: true, avatar_url: `/api/auth/avatar/${req.userId}?t=${Date.now()}` });
});

// ── GET /api/auth/avatar/:userId ────────────────────────────────────────────
router.get('/avatar/:userId', (req, res) => {
  const user = db.prepare('SELECT avatar_path FROM users WHERE id = ?').get(req.params.userId);
  if (!user?.avatar_path) return res.status(404).json({ error: 'No avatar' });
  const filePath = path.join(DATA_DIR, user.avatar_path);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  res.sendFile(filePath);
});

// ── POST /api/auth/complete-onboarding ──────────────────────────────────────
router.post('/complete-onboarding', requireAuth, (req, res) => {
  db.prepare('UPDATE users SET onboarding_complete = 1 WHERE id = ?').run(req.userId);
  res.json({ success: true });
});

// Wipe all data for a user. Shared between password-authenticated delete and
// recovery-key-authenticated wipe (the latter exists so a user who forgets
// their password can still satisfy Apple 5.1.1(v) / Google account-deletion
// requirements).
function wipeUserData(uid) {
  const avatarRow = db.prepare('SELECT avatar_path FROM users WHERE id = ?').get(uid);

  db.prepare('DELETE FROM reflections WHERE entry_id IN (SELECT id FROM entries WHERE user_id = ?)').run(uid);
  db.prepare('DELETE FROM entry_embeddings WHERE entry_id IN (SELECT id FROM entries WHERE user_id = ?)').run(uid);
  db.prepare('DELETE FROM entry_versions WHERE entry_id IN (SELECT id FROM entries WHERE user_id = ?)').run(uid);
  db.prepare('DELETE FROM note_reflections WHERE note_id IN (SELECT id FROM notes WHERE user_id = ?)').run(uid);
  db.prepare('DELETE FROM note_versions WHERE note_id IN (SELECT id FROM notes WHERE user_id = ?)').run(uid);
  db.prepare('DELETE FROM oracle_messages WHERE session_id IN (SELECT id FROM oracle_sessions WHERE user_id = ?)').run(uid);
  db.prepare('DELETE FROM entries WHERE user_id = ?').run(uid);
  db.prepare('DELETE FROM notes WHERE user_id = ?').run(uid);
  db.prepare('DELETE FROM oracle_sessions WHERE user_id = ?').run(uid);
  db.prepare('DELETE FROM memories WHERE user_id = ?').run(uid);
  db.prepare('DELETE FROM memory WHERE user_id = ?').run(uid);
  db.prepare('DELETE FROM portrait WHERE user_id = ?').run(uid);
  db.prepare('DELETE FROM home_layouts WHERE user_id = ?').run(uid);
  // thread_nodes is ON DELETE CASCADE on thread_id
  db.prepare('DELETE FROM threads WHERE user_id = ?').run(uid);
  // Per-user scoped settings live as `key::userId` (see settingsService).
  db.prepare("DELETE FROM settings WHERE key LIKE ?").run(`%::${uid}`);
  db.prepare('DELETE FROM users WHERE id = ?').run(uid);

  rowCrypto.clearUserKey(uid);

  if (avatarRow?.avatar_path) {
    try {
      const avatarFile = path.join(DATA_DIR, avatarRow.avatar_path);
      if (fs.existsSync(avatarFile)) fs.unlinkSync(avatarFile);
    } catch (err) {
      console.warn('[delete-account] avatar unlink failed:', err.message);
    }
  }

  // Clean vectra index (single-user app — index belongs to the deleted user)
  const vectraDir = path.join(DATA_DIR, 'vectra');
  if (fs.existsSync(vectraDir)) {
    fs.rmSync(vectraDir, { recursive: true, force: true });
  }
}

// ── DELETE /api/auth/account ─────────────────────────────────────────────────
// Password-authenticated deletion.
router.delete('/account', requireAuth, async (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'Password required' });

  const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Incorrect password' });

  wipeUserData(req.userId);
  res.json({ success: true });
});

// ── POST /api/auth/wipe-with-recovery-key ────────────────────────────────────
// Recovery-key-authenticated deletion. For users who forgot their password
// and want to wipe everything rather than recover. Required by Apple 5.1.1(v)
// and Google account-deletion guidance: a forgotten-password user must still
// be able to delete their data.
router.post('/wipe-with-recovery-key', (req, res) => {
  const { username, recovery_key } = req.body || {};
  if (!username || !recovery_key) {
    return res.status(400).json({ error: 'username and recovery_key required' });
  }

  const user = db.prepare(`SELECT id, ${KEY_FIELDS} FROM users WHERE username = ?`).get(username.trim());
  if (!user || user.encryption_version !== 1) {
    return res.status(401).json({ error: 'Account not found or not recoverable' });
  }

  const userKey = userCrypto.unlockWithRecovery(recovery_key, user);
  if (!userKey) return res.status(401).json({ error: 'Recovery key did not match' });

  wipeUserData(user.id);
  res.json({ success: true });
});

module.exports = router;
