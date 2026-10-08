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

// The session itself was rejected (missing, expired or for a deleted
// account). The frontend logs out only on this header — a 401 from a route's
// own password check ("Current password is incorrect") must not.
function rejectSession(res, error) {
  res.set('X-Session-Invalid', '1');
  return res.status(401).json({ error });
}

// Lazy: database.js isn't loaded until the first authenticated request.
let userExistsStmt = null;
function userExists(userId) {
  if (!userExistsStmt) userExistsStmt = require('../database').prepare('SELECT 1 FROM users WHERE id = ?');
  return !!userExistsStmt.get(userId);
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return rejectSession(res, 'Not authenticated');
  }
  let decoded;
  try {
    decoded = jwt.verify(header.slice(7), getSecret());
  } catch {
    return rejectSession(res, 'Invalid or expired token');
  }
  // A deleted account's token stops working straight away.
  if (!userExists(decoded.userId)) return rejectSession(res, 'Account no longer exists');
  req.userId = decoded.userId;
  req.username = decoded.username;
  // Run the rest of the handler chain inside this user's settings context
  // so any s.get/s.set during the request automatically uses the per-user
  // namespace (e.g. chatterbox_voice::5 instead of the global key).
  runWithUserContext(decoded.userId, () => next());
}

function signToken(userId, username) {
  return jwt.sign({ userId, username }, getSecret(), { expiresIn: '30d' });
}

module.exports = { requireAuth, signToken, getSecret };
