/**
 * Astrology calculation service — pure JS, no external packages.
 * Formulas from Meeus, "Astronomical Algorithms" (2nd ed.)
 */

const ZODIAC_SIGNS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
];

const CHINESE_ANIMALS = [
  'Rat', 'Ox', 'Tiger', 'Rabbit', 'Dragon', 'Snake',
  'Horse', 'Goat', 'Monkey', 'Rooster', 'Dog', 'Pig',
];

// 10-year cycle (2 years per element): Metal Water Wood Fire Earth
const CHINESE_ELEMENTS = [
  'Metal', 'Metal', 'Water', 'Water', 'Wood', 'Wood',
  'Fire', 'Fire', 'Earth', 'Earth',
];

// ── Utilities ─────────────────────────────────────────────────────────────────

function toRad(deg) { return deg * Math.PI / 180; }
function toDeg(rad) { return rad * 180 / Math.PI; }
function norm(deg) { return ((deg % 360) + 360) % 360; }

/** Julian Day Number for a given date/time (UT) */
function julianDay(year, month, day, hour = 12) {
  if (month <= 2) { year -= 1; month += 12; }
  const A = Math.floor(year / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (year + 4716))
       + Math.floor(30.6001 * (month + 1))
       + day + B - 1524.5 + hour / 24;
}

function signFrom(longitude) {
  return ZODIAC_SIGNS[Math.floor(norm(longitude) / 30)];
}

// ── Sun sign ──────────────────────────────────────────────────────────────────

function calcSunSign(year, month, day) {
  const jd = julianDay(year, month, day);
  const T  = (jd - 2451545.0) / 36525;
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  let   M  = norm(357.52911 + 35999.05029 * T - 0.0001537 * T * T);
  const Mr = toRad(M);
  const C  = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(Mr)
           + (0.019993 - 0.000101 * T) * Math.sin(2 * Mr)
           + 0.000289 * Math.sin(3 * Mr);
  return signFrom(L0 + C);
}

// ── Moon sign ─────────────────────────────────────────────────────────────────

function calcMoonSign(year, month, day, hour = 12) {
  const jd = julianDay(year, month, day, hour);
  const T  = (jd - 2451545.0) / 36525;

  const L  = 218.3164477 + 481267.88123421 * T - 0.0015786 * T * T;
  const D  = 297.8501921 + 445267.1114034  * T - 0.0018819 * T * T;
  const Ms = 357.5291092 + 35999.0502909   * T - 0.0001536 * T * T;
  const Mm = 134.9633964 + 477198.8675055  * T + 0.0087414 * T * T;
  const F  =  93.2720950 + 483202.0175233  * T - 0.0036539 * T * T;

  const Dr  = toRad(norm(D));
  const Msr = toRad(norm(Ms));
  const Mmr = toRad(norm(Mm));
  const Fr  = toRad(norm(F));

  // Main periodic terms (Meeus Table 47.A, abbreviated)
  const dLon =
      6.288774 * Math.sin(Mmr)
    - 1.274027 * Math.sin(2 * Dr - Mmr)
    + 0.658314 * Math.sin(2 * Dr)
    - 0.213618 * Math.sin(2 * Mmr)
    - 0.185116 * Math.sin(Msr)
    - 0.114332 * Math.sin(2 * Fr)
    + 0.058793 * Math.sin(2 * Dr - 2 * Mmr)
    + 0.057066 * Math.sin(2 * Dr - Msr - Mmr)
    + 0.053322 * Math.sin(2 * Dr + Mmr)
    + 0.045758 * Math.sin(2 * Dr - Msr)
    - 0.040923 * Math.sin(Msr - Mmr)
    - 0.034720 * Math.sin(Dr)
    - 0.030383 * Math.sin(Msr + Mmr)
    + 0.015327 * Math.sin(2 * Dr - 2 * Fr)
    - 0.012528 * Math.sin(2 * Fr + Mmr)
    + 0.010980 * Math.sin(2 * Fr - Mmr);

  return signFrom(L + dLon);
}

// ── Rising / Ascendant ────────────────────────────────────────────────────────

/**
 * @param {number} lat  geographic latitude in degrees
 * @param {number} lon  geographic longitude in degrees (east positive)
 */
function calcRisingSign(year, month, day, hour, lat, lon) {
  if (hour == null || lat == null || lon == null) return null;

  const jd  = julianDay(year, month, day, hour);
  const T   = (jd - 2451545.0) / 36525;

  // Greenwich Mean Sidereal Time (degrees)
  const JD0 = Math.floor(jd - 0.5) + 0.5;
  const T0  = (JD0 - 2451545.0) / 36525;
  const GMST0 = 100.4606184 + 36000.77004 * T0 + 0.000387933 * T0 * T0;
  const UT    = (jd - JD0) * 24;
  const GMST  = norm(GMST0 + 360.98564724 * UT / 24);

  // Local Sidereal Time → RAMC in radians
  const RAMC = toRad(norm(GMST + lon));

  // Mean obliquity
  const e    = toRad(23.4397 - 0.0130 * T);
  const latr = toRad(lat);

  // Ascendant
  const y   = -Math.cos(RAMC);
  const x   = Math.sin(e) * Math.tan(latr) + Math.cos(e) * Math.sin(RAMC);
  const asc = norm(toDeg(Math.atan2(y, x)));

  return signFrom(asc);
}

// ── Chinese zodiac ────────────────────────────────────────────────────────────

/**
 * Approximation: if born before ~Feb 4 (Start of Spring / Lìchūn),
 * the Chinese year is still the previous one.
 */
function calcChineseZodiac(year, month, day) {
  let y = year;
  if (month === 1 || (month === 2 && day < 4)) {
    y = year - 1;
  }
  const animalIdx  = ((y - 1900) % 12 + 12) % 12;
  const elementIdx = ((y - 1900) % 10 + 10) % 10;

  return {
    animal:  CHINESE_ANIMALS[animalIdx],
    element: CHINESE_ELEMENTS[elementIdx],
  };
}

// ── Geocode (Nominatim / OpenStreetMap) ───────────────────────────────────────

async function geocode(locationString) {
  const fetch = require('node-fetch');
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(locationString)}&format=json&limit=1`;
  const res  = await fetch(url, {
    headers: { 'User-Agent': 'Liminal-Journal/1.0' },
    signal:  AbortSignal.timeout(5000),
  });
  const data = await res.json();
  if (!data || !data[0]) return null;
  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Calculate all astrological values for a birth date/time/location.
 * @param {string} birth_date     'YYYY-MM-DD'
 * @param {string} [birth_time]   'HH:MM'
 * @param {string} [birth_location] City name
 */
async function calculate({ birth_date, birth_time, birth_location }) {
  const [year, month, day] = birth_date.split('-').map(Number);

  let hour = null;
  if (birth_time) {
    const [h, m] = birth_time.split(':').map(Number);
    hour = h + (m || 0) / 60;
  }

  const result = {
    sun_sign:       calcSunSign(year, month, day),
    moon_sign:      hour != null ? calcMoonSign(year, month, day, hour) : null,
    rising_sign:    null,
    chinese_zodiac: null,
    chinese_element: null,
  };

  // Rising needs time + location (geocoded)
  if (hour != null && birth_location) {
    try {
      const coords = await geocode(birth_location);
      if (coords) {
        result.rising_sign = calcRisingSign(year, month, day, hour, coords.lat, coords.lon);
      }
    } catch {
      // Geocode failed — rising stays null
    }
  }

  const { animal, element } = calcChineseZodiac(year, month, day);
  result.chinese_zodiac   = animal;
  result.chinese_element  = element;

  return result;
}

module.exports = { calculate };
