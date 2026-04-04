const fetch = require('node-fetch');

let cache = { data: null, ts: 0 };
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

function getCondition(code) {
  if (code === 0) return { label: 'Clear', icon: '☀️' };
  if (code <= 2) return { label: 'Partly cloudy', icon: '🌤' };
  if (code === 3) return { label: 'Overcast', icon: '☁️' };
  if (code <= 49) return { label: 'Foggy', icon: '🌫' };
  if (code <= 59) return { label: 'Drizzle', icon: '🌦' };
  if (code <= 69) return { label: 'Rainy', icon: '🌧' };
  if (code <= 79) return { label: 'Snowy', icon: '❄️' };
  if (code <= 84) return { label: 'Showers', icon: '🌦' };
  if (code <= 99) return { label: 'Stormy', icon: '⛈' };
  return { label: 'Clear', icon: '☀️' };
}

function getDescription(code) {
  if (code === 0) return 'clear skies';
  if (code <= 2) return 'partly cloudy';
  if (code === 3) return 'overcast and grey';
  if (code <= 49) return 'foggy';
  if (code <= 59) return 'light drizzle';
  if (code <= 69) return 'rainy';
  if (code <= 79) return 'snowing';
  if (code <= 84) return 'scattered showers';
  if (code <= 99) return 'stormy';
  return 'clear';
}

async function getWeather(lat, lng, city) {
  if (!lat || !lng) return null;

  // Return cache if fresh
  if (cache.data && Date.now() - cache.ts < CACHE_TTL) return cache.data;

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code,wind_speed_10m&timezone=auto`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();

    const condition = getCondition(data.current.weather_code);
    const result = {
      temp: Math.round(data.current.temperature_2m),
      condition: condition.label,
      icon: condition.icon,
      description: getDescription(data.current.weather_code),
      city: city || '',
    };

    cache = { data: result, ts: Date.now() };
    return result;
  } catch {
    return null;
  }
}

function getWeatherContext(weather) {
  if (!weather) return '';
  const h = new Date().getHours();
  const timeOfDay = h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 21 ? 'evening' : 'night';
  return `Weather: ${weather.description} in ${weather.city}, ${timeOfDay}.\n(Note: weather is background context only — do not mention it directly or reference it in responses unless the user explicitly brings it up themselves.)`;
}

module.exports = { getWeather, getWeatherContext, getCondition, getDescription };
