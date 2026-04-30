// Per-language daily quote pools — canonical source is at
// /backend/data/quotes/*.json so the backend's reflect quote-bank can read
// the same data without us maintaining two separate copies. Vite inlines
// these JSON imports into the frontend bundle at build time.

import en from '../../../../backend/data/quotes/en.json';
import el from '../../../../backend/data/quotes/el.json';
import fr from '../../../../backend/data/quotes/fr.json';
import de from '../../../../backend/data/quotes/de.json';
import es from '../../../../backend/data/quotes/es.json';
import pt from '../../../../backend/data/quotes/pt.json';
import it from '../../../../backend/data/quotes/it.json';
import ja from '../../../../backend/data/quotes/ja.json';
import zh from '../../../../backend/data/quotes/zh.json';
import ko from '../../../../backend/data/quotes/ko.json';
import ru from '../../../../backend/data/quotes/ru.json';
import ar from '../../../../backend/data/quotes/ar.json';
import tr from '../../../../backend/data/quotes/tr.json';
import nl from '../../../../backend/data/quotes/nl.json';
import sv from '../../../../backend/data/quotes/sv.json';
import pl from '../../../../backend/data/quotes/pl.json';

const POOLS = { en, el, fr, de, es, pt, it, ja, zh, ko, ru, ar, tr, nl, sv, pl };

/**
 * Pick the daily quote for a given language. Same day-of-year index across
 * languages so the rotation is in sync — if you switch language mid-day,
 * you get the equivalent slot in the new language's pool, not a random one.
 *
 * `extras` is an optional array of user-authored quotes ({ text, author }) —
 * notes with type 'quote' from the user's own collection. They join the pool
 * so the daily rotation occasionally surfaces the user's own voice alongside
 * the curated authors.
 */
export function getDailyQuote(lang = 'en', extras = []) {
  const base = POOLS[lang] || en;
  const pool = extras.length ? base.concat(extras) : base;
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now - start) / 86400000);
  return pool[dayOfYear % pool.length];
}
