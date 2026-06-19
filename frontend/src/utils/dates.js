// Parse a SQLite CURRENT_TIMESTAMP string ("YYYY-MM-DD HH:MM:SS") as UTC.
//
// SQLite's CURRENT_TIMESTAMP is always UTC, but it's stored in a non-ISO format
// (space separator, no trailing Z). Chromium's `new Date(...)` parses that
// format as **local time**, which means a snapshot taken at 4:15 PM in Sydney
// (UTC+10) ends up rendered as "6:15 AM" — the UTC numbers interpreted as
// local-time numbers. Same bug bites every formatter that touches saved_at /
// created_at / updated_at fields coming straight from SQLite.
//
// This helper converts the SQLite string into a real ISO 8601 UTC string so
// `new Date(...)` parses it correctly. Pass-through for already-ISO inputs and
// for null/undefined.
export function parseSqliteUtc(s) {
  if (!s) return new Date(NaN);
  if (typeof s !== 'string') return new Date(s);
  // Already ISO with T and Z (or offset)? Trust it.
  if (/T.*(Z|[+-]\d{2}:?\d{2})$/.test(s)) return new Date(s);
  // SQLite default: "YYYY-MM-DD HH:MM:SS" (sometimes with fractional seconds)
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(s)) {
    return new Date(s.replace(' ', 'T') + 'Z');
  }
  return new Date(s);
}

// Today's date as a LOCAL "YYYY-MM-DD" string.
//
// `new Date().toISOString()` is UTC, which rolls the calendar date back a day
// for users east of UTC (e.g. Australia, UTC+10) all morning — so journal
// entries and notes get filed under "yesterday". Journaling dates are logical
// local days, so build the string from local-time getters.
export function todayLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
