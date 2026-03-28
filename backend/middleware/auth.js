const jwt = require('jsonwebtoken');
const crypto = require('crypto');

function getSecret() {
  const s = require('../services/settingsService');
  let secret = s.get('jwt_secret');
  if (!secret) {
    secret = crypto.randomBytes(32).toString('hex');
    s.set('jwt_secret', secret);
  }
  return secret;
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
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function signToken(userId, username) {
  return jwt.sign({ userId, username }, getSecret(), { expiresIn: '30d' });
}

module.exports = { requireAuth, signToken };
