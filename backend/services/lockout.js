/**
 * Brute-force unlock lockout — single source of truth for failed-attempt
 * tracking and cooldown enforcement.
 *
 * Threat model: this is opportunistic-attack protection. Someone who finds
 * the device unattended and starts guessing passwords gets stopped after 5
 * wrong attempts. The real defence against an offline brute-force attack
 * (where the attacker has the SQLite file and can do whatever they want
 * with it) is the slow KDF wrapping the user key — Liminal uses bcrypt for
 * the password hash and userCrypto's argon-style stretching for the key
 * material, both of which are far stronger than this counter. The lockout
 * lives in the same database an attacker would already have, so it only
 * meaningfully slows down attackers who are using the LIVE app's UI to
 * guess. Don't rely on this as the primary line of defence.
 *
 * Schedule: 1h, 1h, 3h, 6h, 12h, 24h+. Resets on any successful unlock.
 */

const db = require('../database');

const MAX_ATTEMPTS = 5;
const COOLDOWN_HOURS = [1, 1, 3, 6, 12, 24];   // index 0 = first lockout, etc.
const HOUR = 3600;                              // seconds

// Pure helpers ─────────────────────────────────────────────────────────────

/** Number of seconds the next lockout should last, given how many lockouts
 *  have already happened in the current streak (0-indexed). Caps at 24h. */
function cooldownSecondsForStreak(streakIndex) {
  const idx = Math.min(Math.max(streakIndex, 0), COOLDOWN_HOURS.length - 1);
  return COOLDOWN_HOURS[idx] * HOUR;
}

/** Unix epoch seconds, used for lockout_until comparisons. */
function nowSec() {
  return Math.floor(Date.now() / 1000);
}

// State accessors ──────────────────────────────────────────────────────────

/**
 * Read lockout state for a user by username. Returns null if user doesn't
 * exist (so the caller can return a generic "invalid credentials" without
 * leaking which usernames exist).
 *
 * Returns:
 *   {
 *     userId,
 *     locked,                   // boolean — currently locked out
 *     secondsRemaining,         // 0 if not locked
 *     failed_attempts,          // 0..MAX_ATTEMPTS-1 (resets to 0 on lockout fire)
 *     attempts_before_lockout,  // MAX_ATTEMPTS - failed_attempts
 *     consecutive_lockouts,     // streak length, drives schedule
 *     lockout_until,            // unix sec, 0 / null if not locked
 *   }
 */
function getStateByUsername(username) {
  if (!username) return null;
  const row = db.prepare(
    'SELECT id, failed_attempts, consecutive_lockouts, lockout_until FROM users WHERE username = ?'
  ).get(String(username).trim());
  if (!row) return null;
  return formatState(row);
}

function getStateByUserId(userId) {
  const row = db.prepare(
    'SELECT id, failed_attempts, consecutive_lockouts, lockout_until FROM users WHERE id = ?'
  ).get(userId);
  if (!row) return null;
  return formatState(row);
}

function formatState(row) {
  const now = nowSec();
  const lockoutUntil = row.lockout_until || 0;
  const locked = lockoutUntil > now;
  return {
    userId: row.id,
    locked,
    secondsRemaining: locked ? lockoutUntil - now : 0,
    failed_attempts: row.failed_attempts || 0,
    attempts_before_lockout: Math.max(0, MAX_ATTEMPTS - (row.failed_attempts || 0)),
    consecutive_lockouts: row.consecutive_lockouts || 0,
    lockout_until: lockoutUntil || 0,
  };
}

// Mutations ────────────────────────────────────────────────────────────────

/**
 * Record a failed unlock attempt. If this trips the threshold, fires a
 * lockout with the appropriate cooldown. Returns the post-mutation state
 * so the caller can decide what to surface to the client.
 *
 * Caller is responsible for only invoking this when an attempt actually
 * failed (don't double-count, don't count locked-out attempts that were
 * refused outright before reaching credential validation).
 */
function recordFailure(userId) {
  const row = db.prepare(
    'SELECT failed_attempts, consecutive_lockouts FROM users WHERE id = ?'
  ).get(userId);
  if (!row) return null;
  const newFailed = (row.failed_attempts || 0) + 1;
  if (newFailed >= MAX_ATTEMPTS) {
    // Trip a lockout. Cooldown depends on how many lockouts have already
    // fired in this streak — `consecutive_lockouts` is 0-indexed for the
    // schedule (first lockout uses COOLDOWN_HOURS[0]).
    const cooldown = cooldownSecondsForStreak(row.consecutive_lockouts || 0);
    const until = nowSec() + cooldown;
    db.prepare(
      'UPDATE users SET failed_attempts = 0, consecutive_lockouts = consecutive_lockouts + 1, lockout_until = ? WHERE id = ?'
    ).run(until, userId);
  } else {
    db.prepare('UPDATE users SET failed_attempts = ? WHERE id = ?').run(newFailed, userId);
  }
  return getStateByUserId(userId);
}

/**
 * Reset on successful unlock — zero both counters and clear lockout_until.
 * Called from login/recover/wipe-with-recovery-key on success.
 */
function recordSuccess(userId) {
  db.prepare(
    'UPDATE users SET failed_attempts = 0, consecutive_lockouts = 0, lockout_until = NULL WHERE id = ?'
  ).run(userId);
}

module.exports = {
  MAX_ATTEMPTS,
  COOLDOWN_HOURS,
  cooldownSecondsForStreak,
  getStateByUsername,
  getStateByUserId,
  recordFailure,
  recordSuccess,
};
