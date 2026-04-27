const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { runWithUserContext } = require('../services/settingsService');

// Fresh per-process JWT secret. Intentionally NOT persisted: rotating the
// secret on every backend restart invalidates all existing tokens, so closing
// and reopening Liminal forces the user back through PasswordGate. This is the
// desired behaviour for a single-user, locally-stored journal — the cost of
// re-typing a password on launch is worth not leaving the app silently
// authenticated for 30 days after a single login.
const SESSION_SECRET = crypto.randomBytes(32).toString('hex');

function getSecret() {
  return SESSION_SECRET;
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, getSecret());
    req.userId = decoded.userId;
    req.username = decoded.username;
    // Run the rest of the handler chain inside this user's settings context
    // so any s.get/s.set during the request automatically uses the per-user
    // namespace (e.g. chatterbox_voice::5 instead of the global key).
    runWithUserContext(decoded.userId, () => next());
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function signToken(userId, username) {
  return jwt.sign({ userId, username }, getSecret(), { expiresIn: '30d' });
}

module.exports = { requireAuth, signToken, getSecret };
