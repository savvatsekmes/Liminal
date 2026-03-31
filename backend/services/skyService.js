/**
 * Sky calculation service — moon phases, planetary positions, retrogrades, upcoming events.
 * All calculations are local using the astronomia package (VSOP87).
 */

const path = require('path');
const { julian, solar, moonposition, moonphase, solstice, planetposition } = require('astronomia');
const dataDir = path.join(path.dirname(require.resolve('astronomia')), 'data');

// ── Planet data ──────────────────────────────────────────────────────────────

function loadPlanet(name) {
  return new planetposition.Planet(require(path.join(dataDir, 'vsop87B' + name + '.cjs')).default);
}

const PLANETS = {
  mercury: loadPlanet('mercury'),
  venus: loadPlanet('venus'),
  earth: loadPlanet('earth'),
  mars: loadPlanet('mars'),
  jupiter: loadPlanet('jupiter'),
  saturn: loadPlanet('saturn'),
};

// ── Zodiac signs ─────────────────────────────────────────────────────────────

const ZODIAC_SIGNS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
];

function lonToSign(lonDeg) {
  let d = lonDeg % 360;
  if (d < 0) d += 360;
  return ZODIAC_SIGNS[Math.floor(d / 30)];
}

// ── Julian date helpers ──────────────────────────────────────────────────────

function dateToJD(date) {
  return julian.CalendarGregorianToJD(date.getFullYear(), date.getMonth() + 1, date.getDate() + date.getHours() / 24);
}

function jdToDate(jd) {
  return julian.JDToDate(jd);
}

function formatDate(d) {
  return d.toISOString().slice(0, 10);
}

// ── Geocentric longitude ────────────────────────────────────────────────────

function getGeocentricLon(planetName, jd) {
  if (planetName === 'earth') return null;
  const planet = PLANETS[planetName];
  const earth = PLANETS.earth;
  const pPos = planet.position(jd);
  const ePos = earth.position(jd);
  // Convert heliocentric to geocentric via cartesian
  const pR = pPos.range;
  const pLon = pPos.lon;
  const pLat = pPos.lat;
  const eR = ePos.range;
  const eLon = ePos.lon;
  const eLat = ePos.lat;

  const px = pR * Math.cos(pLat) * Math.cos(pLon) - eR * Math.cos(eLat) * Math.cos(eLon);
  const py = pR * Math.cos(pLat) * Math.sin(pLon) - eR * Math.cos(eLat) * Math.sin(eLon);

  let geoLon = Math.atan2(py, px) * 180 / Math.PI;
  if (geoLon < 0) geoLon += 360;
  return geoLon;
}

// ── Heliocentric longitude (for orbital diagram) ────────────────────────────

function getHeliocentricPositions(date) {
  const jd = dateToJD(date);
  const result = {};
  for (const [name, planet] of Object.entries(PLANETS)) {
    const pos = planet.position(jd);
    result[name] = {
      lon: pos.lon * 180 / Math.PI,
      lat: pos.lat * 180 / Math.PI,
      range: pos.range, // AU
    };
  }
  // Add moon relative to earth
  const moonPos = moonposition.position(jd);
  result.moon = {
    lon: moonPos.lon * 180 / Math.PI,
    lat: moonPos.lat * 180 / Math.PI,
    range: moonPos.range / 149597870.7, // km to AU (approximate)
  };
  return result;
}

// ── Moon phase ──────────────────────────────────────────────────────────────

const MOON_PHASE_NAMES = [
  'New Moon',
  'Waxing Crescent',
  'First Quarter',
  'Waxing Gibbous',
  'Full Moon',
  'Waning Gibbous',
  'Last Quarter',
  'Waning Crescent',
];

const MOON_PHASE_MEANINGS = {
  'New Moon':        'A time for setting intentions, beginning new projects, planting seeds.',
  'Waxing Crescent': 'Energy building. Good for taking first steps on intentions set at the new moon.',
  'First Quarter':   'Push through resistance. Decisions and action are supported now.',
  'Waxing Gibbous':  'Refine and adjust. What you started is gaining momentum.',
  'Full Moon':       'Culmination and release. Emotions are heightened. Things come to the surface.',
  'Waning Gibbous':  'Gratitude and sharing. Reflect on what the full moon revealed.',
  'Last Quarter':    'Release and forgive. Let go of what is no longer working.',
  'Waning Crescent': 'Rest, surrender, and prepare. The cycle is completing.',
};

// Find the nearest lunation events (new, first quarter, full, last quarter)
function findLunationEvents(jd) {
  const year = 2000 + (jd - 2451545.0) / 365.25;
  const events = {};

  // moonphase functions snap to the nearest event for a given decimal year.
  // Use fine steps (0.01 year ~ 3.6 days) over a wide range to find all nearby events.
  const phaseFns = [
    ['New', moonphase.new],
    ['First', moonphase.first],
    ['Full', moonphase.full],
    ['Last', moonphase.last],
  ];

  for (const [name, fn] of phaseFns) {
    const lastKey = 'last' + name;
    const nextKey = 'next' + name;
    const seen = new Set();

    for (let offset = -0.2; offset <= 0.2; offset += 0.01) {
      try {
        const evJD = fn(year + offset);
        const key = Math.round(evJD * 10); // deduplicate
        if (seen.has(key)) continue;
        seen.add(key);

        if (evJD <= jd && (!events[lastKey] || evJD > events[lastKey])) {
          events[lastKey] = evJD;
        }
        if (evJD > jd && (!events[nextKey] || evJD < events[nextKey])) {
          events[nextKey] = evJD;
        }
      } catch (e) { /* skip */ }
    }
  }
  return events;
}

function getMoonPhase(date) {
  const jd = dateToJD(date);
  const T = (jd - 2451545.0) / 36525;
  const sunLon = solar.apparentLongitude(T);
  const moonPos = moonposition.position(jd);

  let elongation = moonPos.lon - sunLon;
  if (elongation < 0) elongation += 2 * Math.PI;

  const illumination = (1 - Math.cos(elongation)) / 2;

  // Moon sign (geocentric ecliptic longitude)
  let moonLonDeg = moonPos.lon * 180 / Math.PI;
  if (moonLonDeg < 0) moonLonDeg += 360;
  const moonSign = lonToSign(moonLonDeg);

  // Find exact lunation events to determine phase name precisely
  const ev = findLunationEvents(jd);
  const THRESHOLD = 1.0; // days — only call it "Full Moon" etc if within 1 day of exact event

  let phaseName;
  if (ev.nextNew && (ev.nextNew - jd) < THRESHOLD) {
    phaseName = 'New Moon';
  } else if (ev.lastNew && (jd - ev.lastNew) < THRESHOLD) {
    phaseName = 'New Moon';
  } else if (ev.nextFull && (ev.nextFull - jd) < THRESHOLD) {
    phaseName = 'Full Moon';
  } else if (ev.lastFull && (jd - ev.lastFull) < THRESHOLD) {
    phaseName = 'Full Moon';
  } else if (ev.nextFirst && (ev.nextFirst - jd) < THRESHOLD) {
    phaseName = 'First Quarter';
  } else if (ev.lastFirst && (jd - ev.lastFirst) < THRESHOLD) {
    phaseName = 'First Quarter';
  } else if (ev.nextLast && (ev.nextLast - jd) < THRESHOLD) {
    phaseName = 'Last Quarter';
  } else if (ev.lastLast && (jd - ev.lastLast) < THRESHOLD) {
    phaseName = 'Last Quarter';
  } else {
    // Between major events — determine waxing/waning crescent/gibbous
    const daysSinceNew = ev.lastNew ? (jd - ev.lastNew) : 15;
    const daysUntilNew = ev.nextNew ? (ev.nextNew - jd) : 15;
    const daysSinceFull = ev.lastFull ? (jd - ev.lastFull) : 15;

    const waxing = daysSinceNew < daysUntilNew;
    if (waxing) {
      phaseName = illumination < 0.5 ? 'Waxing Crescent' : 'Waxing Gibbous';
    } else {
      phaseName = illumination < 0.5 ? 'Waning Crescent' : 'Waning Gibbous';
    }
  }

  // Full moon sign — the sign the moon will be in at the exact full moon
  let nextFullSign = null;
  if (ev.nextFull) {
    const fmMoon = moonposition.position(ev.nextFull);
    let fmLon = fmMoon.lon * 180 / Math.PI;
    if (fmLon < 0) fmLon += 360;
    nextFullSign = lonToSign(fmLon);
  }

  return {
    phase: phaseName,
    illumination: Math.round(illumination * 100),
    moonSign,
    moonLonDeg: moonLonDeg % 360,
    meaning: MOON_PHASE_MEANINGS[phaseName],
    daysSinceNewMoon: ev.lastNew ? Math.round(jd - ev.lastNew) : null,
    daysUntilNewMoon: ev.nextNew ? Math.round(ev.nextNew - jd) : null,
    daysSinceFullMoon: ev.lastFull ? Math.round(jd - ev.lastFull) : null,
    daysUntilFullMoon: ev.nextFull ? Math.round(ev.nextFull - jd) : null,
    lastNewMoonDate: ev.lastNew ? formatDate(jdToDate(ev.lastNew)) : null,
    nextNewMoonDate: ev.nextNew ? formatDate(jdToDate(ev.nextNew)) : null,
    nextFullMoonDate: ev.nextFull ? formatDate(jdToDate(ev.nextFull)) : null,
    nextFullMoonSign: nextFullSign,
  };
}

// ── Retrograde detection ────────────────────────────────────────────────────

const RETROGRADE_DESCRIPTIONS = {
  mercury: 'Traditionally associated with communication disruptions and technology hiccups. Good for revisiting, revising, and reflecting rather than launching new things.',
  venus:   'A period for reassessing relationships and values. What matters to you is worth examining.',
  mars:    'Energy turns inward. Frustration can arise from blocked action. Good for inner work over outer effort.',
  jupiter: 'Expansion slows and turns inward. A time for inner growth and philosophical reflection.',
  saturn:  'A review of structures, responsibilities and long-term goals. What needs to be rebuilt?',
};

function isRetrograde(planetName, jd) {
  const lon1 = getGeocentricLon(planetName, jd);
  const lon2 = getGeocentricLon(planetName, jd - 1);
  let delta = lon1 - lon2;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  return delta < 0;
}

function findRetrogradeTransition(planetName, jdStart, forward, maxDays = 365) {
  // Binary search for when retrograde status changes
  const startRetro = isRetrograde(planetName, jdStart);
  let lo = jdStart;
  let hi = jdStart + (forward ? maxDays : -maxDays);

  // First, find a point where status differs
  let step = forward ? 5 : -5;
  let found = false;
  for (let jd = jdStart; forward ? jd < jdStart + maxDays : jd > jdStart - maxDays; jd += step) {
    if (isRetrograde(planetName, jd) !== startRetro) {
      lo = jd - step;
      hi = jd;
      found = true;
      break;
    }
  }
  if (!found) return null;

  // Binary search to narrow down
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (isRetrograde(planetName, mid) === startRetro) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}

function getPlanetaryConditions(date) {
  const jd = dateToJD(date);
  const conditions = [];

  for (const name of ['mercury', 'venus', 'mars', 'jupiter', 'saturn']) {
    const retro = isRetrograde(name, jd);
    const geoLon = getGeocentricLon(name, jd);
    const sign = lonToSign(geoLon);
    const displayName = name.charAt(0).toUpperCase() + name.slice(1);

    const condition = {
      planet: displayName,
      sign,
      retrograde: retro,
      description: retro ? RETROGRADE_DESCRIPTIONS[name] : null,
    };

    if (retro) {
      // Find when retrograde ends
      const endJD = findRetrogradeTransition(name, jd, true);
      if (endJD) condition.retrogradeEnds = formatDate(jdToDate(endJD));
    } else {
      // Find when next retrograde starts
      const startJD = findRetrogradeTransition(name, jd, true);
      if (startJD) condition.nextRetrograde = formatDate(jdToDate(startJD));
    }

    // Find when planet changes sign
    const currentSign = sign;
    for (let d = 1; d <= 90; d++) {
      const futureSign = lonToSign(getGeocentricLon(name, jd + d));
      if (futureSign !== currentSign) {
        condition.signChangeDate = formatDate(jdToDate(jd + d));
        condition.nextSign = futureSign;
        break;
      }
    }

    conditions.push(condition);
  }

  return conditions;
}

// ── Upcoming events ─────────────────────────────────────────────────────────

const FULL_MOON_NAMES = {
  1:  'Wolf Moon',
  2:  'Snow Moon',
  3:  'Worm Moon',
  4:  'Pink Moon',
  5:  'Flower Moon',
  6:  'Strawberry Moon',
  7:  'Buck Moon',
  8:  'Sturgeon Moon',
  9:  'Harvest Moon',
  10: 'Hunter\'s Moon',
  11: 'Beaver Moon',
  12: 'Cold Moon',
};

function getUpcomingEvents(date, days = 90) {
  const jd = dateToJD(date);
  const year = date.getFullYear();
  const events = [];

  // Search moon phases across the range
  for (let m = -1; m <= (days / 28) + 2; m++) {
    const y = year + (date.getMonth() + m) / 12;
    try {
      // New moons
      const nm = moonphase.new(y);
      if (nm >= jd && nm <= jd + days) {
        const d = jdToDate(nm);
        const moonLon = moonposition.position(nm).lon * 180 / Math.PI;
        events.push({
          date: formatDate(d),
          jd: nm,
          type: 'New Moon',
          sign: lonToSign(moonLon < 0 ? moonLon + 360 : moonLon),
        });
      }
      // Full moons
      const fm = moonphase.full(y);
      if (fm >= jd && fm <= jd + days) {
        const d = jdToDate(fm);
        const month = d.getMonth() + 1;
        const moonLon = moonposition.position(fm).lon * 180 / Math.PI;
        events.push({
          date: formatDate(d),
          jd: fm,
          type: 'Full Moon',
          sign: lonToSign(moonLon < 0 ? moonLon + 360 : moonLon),
          name: FULL_MOON_NAMES[month] || null,
        });
      }
    } catch (e) { /* skip invalid */ }
  }

  // Solstices and equinoxes for current and next year
  for (const yr of [year, year + 1]) {
    try {
      const marchEq = solstice.march(yr);
      if (marchEq >= jd && marchEq <= jd + days) {
        events.push({ date: formatDate(jdToDate(marchEq)), jd: marchEq, type: 'Vernal Equinox' });
      }
    } catch (e) { /* skip */ }
    try {
      const juneSol = solstice.june(yr);
      if (juneSol >= jd && juneSol <= jd + days) {
        events.push({ date: formatDate(jdToDate(juneSol)), jd: juneSol, type: 'Summer Solstice' });
      }
    } catch (e) { /* skip */ }
    try {
      const septEq = solstice.september(yr);
      if (septEq >= jd && septEq <= jd + days) {
        events.push({ date: formatDate(jdToDate(septEq)), jd: septEq, type: 'Autumnal Equinox' });
      }
    } catch (e) { /* skip */ }
    try {
      const decSol = solstice.december(yr);
      if (decSol >= jd && decSol <= jd + days) {
        events.push({ date: formatDate(jdToDate(decSol)), jd: decSol, type: 'Winter Solstice' });
      }
    } catch (e) { /* skip */ }
  }

  // Mercury retrograde start/end within range
  for (const name of ['mercury']) {
    let searchJD = jd;
    for (let i = 0; i < 4; i++) {
      const transition = findRetrogradeTransition(name, searchJD, true, days + 30);
      if (!transition || transition > jd + days) break;
      const wasRetro = isRetrograde(name, transition - 1);
      events.push({
        date: formatDate(jdToDate(transition)),
        jd: transition,
        type: wasRetro ? 'Mercury Retrograde ends' : 'Mercury Retrograde begins',
      });
      searchJD = transition + 5;
    }
  }

  // Sort by date
  events.sort((a, b) => a.jd - b.jd);

  // Deduplicate (same date + type)
  const seen = new Set();
  return events.filter(e => {
    const key = e.date + e.type;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Sky context string for Mirror prompts ───────────────────────────────────

function getSkyContext(date = new Date()) {
  const moon = getMoonPhase(date);
  const jd = dateToJD(date);

  const retrogrades = [];
  for (const name of ['mercury', 'venus', 'mars', 'jupiter', 'saturn']) {
    if (isRetrograde(name, jd)) {
      retrogrades.push(name.charAt(0).toUpperCase() + name.slice(1));
    }
  }

  let ctx = `${moon.phase} moon (${moon.illumination}%) in ${moon.moonSign}.`;
  if (retrogrades.length > 0) {
    ctx += ` ${retrogrades.join(', ')} ${retrogrades.length === 1 ? 'is' : 'are'} retrograde.`;
  }
  return ctx;
}

// ── Sky notes string for entry tagging ──────────────────────────────────────

function getSkyNotes(date = new Date()) {
  const jd = dateToJD(date);
  const retrogrades = [];
  for (const name of ['mercury', 'venus', 'mars', 'jupiter', 'saturn']) {
    if (isRetrograde(name, jd)) {
      retrogrades.push(name.charAt(0).toUpperCase() + name.slice(1));
    }
  }
  return retrogrades.length > 0 ? retrogrades.join(', ') + ' retrograde' : '';
}

module.exports = {
  getMoonPhase,
  getPlanetaryConditions,
  getUpcomingEvents,
  getHeliocentricPositions,
  getSkyContext,
  getSkyNotes,
  lonToSign,
  dateToJD,
  jdToDate,
};
