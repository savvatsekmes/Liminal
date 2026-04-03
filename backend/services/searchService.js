/**
 * Web search service — DuckDuckGo (default, zero-config) or Tavily (premium).
 */

const fetch = require('node-fetch');

const MAX_RESULTS = 5;
const MAX_CONTENT_CHARS = 2000;

function getSettings() {
  return require('./settingsService');
}

function isEnabled() {
  const s = getSettings();
  return s.get('web_search_enabled') === 'true';
}

function getProvider() {
  const s = getSettings();
  if (s.hasSecret('tavily_api_key')) return 'tavily';
  return 'duckduckgo';
}

async function search(query) {
  const provider = getProvider();
  if (provider === 'tavily') return searchTavily(query);
  return searchDuckDuckGo(query);
}

// ── DuckDuckGo (lite HTML scrape, no API key) ───────────────────────────────

async function searchDuckDuckGo(query) {
  try {
    const res = await fetch('https://lite.duckduckgo.com/lite/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Liminal/1.0',
      },
      body: `q=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return { results: [], error: `DuckDuckGo returned ${res.status}` };
    }

    const html = await res.text();
    const results = parseDDGLite(html);
    return { results, query };
  } catch (err) {
    return { results: [], error: `DuckDuckGo search failed: ${err.message}` };
  }
}

/** Parse DuckDuckGo lite HTML into structured results. */
function parseDDGLite(html) {
  const results = [];
  // DDG lite: <a rel="nofollow" href="URL" class='result-link'>Title</a>
  //           <td class='result-snippet'>snippet</td>
  // href comes before class, attributes use mixed quote styles
  const linkRegex = /<a[^>]*href=["']([^"']*)["'][^>]*class=['"]result-link['"][^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRegex = /<td[^>]*class=['"]result-snippet['"][^>]*>([\s\S]*?)<\/td>/gi;

  const links = [];
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    links.push({ url: match[1], title: stripTags(match[2]).trim() });
  }

  const snippets = [];
  while ((match = snippetRegex.exec(html)) !== null) {
    snippets.push(stripTags(match[1]).trim());
  }

  for (let i = 0; i < Math.min(links.length, MAX_RESULTS); i++) {
    results.push({
      title: links[i].title,
      url: links[i].url,
      content: snippets[i] || '',
    });
  }

  return results;
}

function stripTags(html) {
  return html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
}

// ── Tavily (premium, needs API key) ──────────────────────────────────────────

async function searchTavily(query) {
  const s = getSettings();
  const apiKey = s.get('tavily_api_key');
  if (!apiKey) return { results: [], error: 'No Tavily API key configured' };

  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'basic',
        max_results: MAX_RESULTS,
        include_answer: false,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { results: [], error: `Tavily API error: ${res.status} ${errText}` };
    }

    const data = await res.json();
    const results = (data.results || []).map(r => ({
      title: r.title || '',
      url: r.url || '',
      content: r.content || '',
    }));

    return { results, query };
  } catch (err) {
    return { results: [], error: `Search failed: ${err.message}` };
  }
}

// ── Shared ───────────────────────────────────────────────────────────────────

/** Format search results into a string suitable for LLM context injection. */
function formatResults(searchResult) {
  if (searchResult.error) return `Web search unavailable: ${searchResult.error}`;
  if (!searchResult.results.length) return 'No web results found.';

  let total = 0;
  const parts = [];
  for (const r of searchResult.results) {
    const entry = `**${r.title}**\n${r.url}\n${r.content}`;
    if (total + entry.length > MAX_CONTENT_CHARS && parts.length > 0) break;
    parts.push(entry);
    total += entry.length;
  }
  return parts.join('\n---\n');
}

/** Check if a user message likely needs a web search. */
function needsSearch(message) {
  const lower = message.toLowerCase();
  const patterns = [
    /\b(weather|forecast)\b/,
    /\b(news|headlines)\b/,
    /\b(search|look\s*up|google|find\s*out)\b/,
    /\b(price|cost|stock)\s+(of|for)?\b/,
    /\b(score|results?)\s+(of|for)?\b/,
    /\b(who is|what is|where is|when is|how much)\b/,
    /\b(today|right now|currently|latest|recent|this week)\b/,
    /\b(can you check|can you find|can you look)\b/,
  ];
  return patterns.some(p => p.test(lower));
}

module.exports = { isEnabled, getProvider, search, formatResults, needsSearch };
