// Per-language daily quote pools.
// Each language file holds quotes from authors writing natively in that
// language. Languages without a curated pool fall back to the English pool.

import en from './en';
import el from './el';
import fr from './fr';
import de from './de';
import es from './es';
import pt from './pt';
import it from './it';
import ja from './ja';
import zh from './zh';
import ko from './ko';
import ru from './ru';
import ar from './ar';
import tr from './tr';
import nl from './nl';
import sv from './sv';
import pl from './pl';

const POOLS = { en, el, fr, de, es, pt, it, ja, zh, ko, ru, ar, tr, nl, sv, pl };

/**
 * Pick the daily quote for a given language. Same day-of-year index across
 * languages so the rotation is in sync — if you switch language mid-day,
 * you get the equivalent slot in the new language's pool, not a random one.
 */
export function getDailyQuote(lang = 'en') {
  const pool = POOLS[lang] || en;
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now - start) / 86400000);
  return pool[dayOfYear % pool.length];
}
