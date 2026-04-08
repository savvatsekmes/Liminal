// Per-language home-screen strings (greetings, quick-ask prompts, question pool).
// Languages without a curated set fall back to English.

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

const STRINGS = { en, el, fr, de, es, pt, it, ja, zh, ko, ru, ar, tr, nl, sv, pl };

export function getHomeStrings(lang = 'en') {
  return STRINGS[lang] || en;
}
