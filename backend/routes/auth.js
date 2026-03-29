const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../database');
const { signToken, requireAuth } = require('../middleware/auth');

const avatarDir = path.join(__dirname, '..', 'data', 'avatars');
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

// ── GET /api/auth/status ─────────────────────────────────────────────────────
// Returns whether any users exist (for first-launch detection)
router.get('/status', (req, res) => {
  const count = db.prepare('SELECT COUNT(*) as n FROM users').get().n;
  res.json({ hasUsers: count > 0 });
});

// ── POST /api/auth/register ──────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username?.trim()) return res.status(400).json({ error: 'Username is required' });
  if (!password || password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim());
  if (existing) return res.status(409).json({ error: 'Username already taken' });

  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  const result = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username.trim(), hash);
  const userId = result.lastInsertRowid;

  // Create portrait row for new user
  db.prepare('INSERT INTO portrait (user_id) VALUES (?)').run(userId);

  const token = signToken(userId, username.trim());
  res.json({ token, username: username.trim(), onboarding_complete: false });
});

// ── POST /api/auth/login ─────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim());
  if (!user) return res.status(401).json({ error: 'Invalid username or password' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid username or password' });

  db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
  const token = signToken(user.id, user.username);
  res.json({ token, username: user.username, onboarding_complete: !!user.onboarding_complete });
});

// ── POST /api/auth/change ────────────────────────────────────────────────────
router.post('/change', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'currentPassword and newPassword required' });
  if (newPassword.length < 4) return res.status(400).json({ error: 'New password must be at least 4 characters' });

  const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const valid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

  const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.userId);
  res.json({ success: true });
});

// ── GET /api/auth/me ─────────────────────────────────────────────────────────
router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT username, onboarding_complete, avatar_path FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({
    username: user.username,
    onboarding_complete: !!user.onboarding_complete,
    avatar_url: user.avatar_path ? `/api/auth/avatar/${req.userId}?t=${Date.now()}` : null,
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
  const filePath = path.join(__dirname, '..', 'data', user.avatar_path);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  res.sendFile(filePath);
});

// ── POST /api/auth/complete-onboarding ──────────────────────────────────────
router.post('/complete-onboarding', requireAuth, (req, res) => {
  db.prepare('UPDATE users SET onboarding_complete = 1 WHERE id = ?').run(req.userId);
  res.json({ success: true });
});

// ── DELETE /api/auth/account ─────────────────────────────────────────────────
// Permanently delete the user's account and ALL associated data.
router.delete('/account', requireAuth, async (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'Password required' });

  const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Incorrect password' });

  // Delete all user data — child tables first
  const uid = req.userId;
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
  db.prepare('DELETE FROM settings WHERE key LIKE ?').run(`%_${uid}`);
  db.prepare('DELETE FROM users WHERE id = ?').run(uid);

  // Clean vectra index
  const path = require('path');
  const fs = require('fs');
  const vectraDir = path.join(__dirname, '..', 'data', 'vectra');
  if (fs.existsSync(vectraDir)) {
    fs.rmSync(vectraDir, { recursive: true, force: true });
  }

  res.json({ success: true });
});

module.exports = router;
