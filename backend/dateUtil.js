// Local-day helpers.
//
// Liminal's backend runs locally on the user's own machine, so it shares the
// user's system timezone. Journaling dates are LOGICAL local days — the day the
// user was writing, in their own timezone — not UTC instants. Using
// `new Date().toISOString()` (which is UTC) rolls the date back a day for every
// user east of UTC (e.g. Australia, UTC+10) during their morning hours, so an
// entry written at 8am Tuesday gets filed under Monday. Always derive
// user-facing day strings from local time instead.

function localDateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

module.exports = { localDateStr };
