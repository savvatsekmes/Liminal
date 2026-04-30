// Streaming reflection helper.
//
// Wraps llmService.stream() with an incremental JSON parser so reflect routes
// (journal + notes) can emit blocks to the frontend as the model produces
// them, instead of waiting 25s for the full response. The parser watches the
// streamed token buffer for:
//   - the top-level "opening" field (string) — emitted when its closing quote
//     arrives at object depth 1
//   - each element of the top-level "blocks": [...] array — emitted when the
//     element's outermost { } pair closes
//
// Quoting / escaping inside strings is tracked so a `"` or `}` inside an
// opening or block body doesn't trigger a false event.
//
// Usage from a route handler:
//   const stream = require('../services/reflectStream');
//   await stream.run(systemPrompt, userMessage, options, {
//     onOpening: (text) => { ... emit SSE ... },
//     onBlock:   (block) => { ... post-process + emit SSE ... },
//     onDone:    (final) => { ... echo + save + emit done ... },
//     onError:   (err) => { ... emit error ... },
//   });
//
// The `final` argument to onDone has shape { opening, blocks, raw } — `blocks`
// is the array of every block that streamed successfully (so callers can run
// echo / save), and `raw` is the full accumulated text in case the parser
// missed something and the salvage path is needed.

const llm = require('./llmService');

function createReflectStreamParser() {
  let buffer = '';
  let openingEmitted = false;
  let blocksArrayStarted = false;
  let blocksArrayEnded = false;
  // Once blocksArrayStarted is true, this is the cursor we resume scanning from
  // each feed() — set just past the opening `[` of the blocks array, then
  // advanced past every successfully-emitted block's closing `}`.
  let scanIdx = 0;
  const blocks = [];

  function tryExtractOpening() {
    // Match top-level "opening": "..." with proper escape handling. We anchor
    // on the literal `"opening"` key; the value is the next string literal.
    const keyIdx = buffer.indexOf('"opening"');
    if (keyIdx < 0) return null;
    // Find the colon, then the opening quote of the string value.
    let i = keyIdx + '"opening"'.length;
    while (i < buffer.length && /\s/.test(buffer[i])) i++;
    if (buffer[i] !== ':') return null;
    i++;
    while (i < buffer.length && /\s/.test(buffer[i])) i++;
    if (buffer[i] !== '"') return null;
    // Walk the string with escape handling.
    const start = i + 1;
    let j = start;
    let esc = false;
    while (j < buffer.length) {
      const ch = buffer[j];
      if (esc) { esc = false; j++; continue; }
      if (ch === '\\') { esc = true; j++; continue; }
      if (ch === '"') break;
      j++;
    }
    if (j >= buffer.length) return null; // string not yet complete
    // Decode JSON-style escapes by re-parsing through JSON.parse on a wrapped string.
    try {
      return JSON.parse('"' + buffer.slice(start, j) + '"');
    } catch {
      return null;
    }
  }

  function ensureBlocksArrayStart() {
    if (blocksArrayStarted) return true;
    const keyIdx = buffer.indexOf('"blocks"');
    if (keyIdx < 0) return false;
    const bracketIdx = buffer.indexOf('[', keyIdx);
    if (bracketIdx < 0) return false;
    blocksArrayStarted = true;
    scanIdx = bracketIdx + 1;
    return true;
  }

  function scanBlocks() {
    if (!blocksArrayStarted || blocksArrayEnded) return [];
    const events = [];
    let i = scanIdx;
    let inStr = false;
    let esc = false;
    let depth = 0;
    let objStart = -1;
    let cursor = scanIdx; // last fully-consumed position (start of this block if mid-object)

    while (i < buffer.length) {
      const ch = buffer[i];
      if (inStr) {
        if (esc) { esc = false; i++; continue; }
        if (ch === '\\') { esc = true; i++; continue; }
        if (ch === '"') { inStr = false; i++; continue; }
        i++;
        continue;
      }
      if (ch === '"') { inStr = true; i++; continue; }
      if (ch === '{') {
        if (depth === 0) objStart = i;
        depth++;
        i++;
        continue;
      }
      if (ch === '}') {
        depth--;
        if (depth === 0 && objStart >= 0) {
          const candidate = buffer.slice(objStart, i + 1);
          try {
            const block = JSON.parse(candidate);
            blocks.push(block);
            events.push(block);
            cursor = i + 1;
          } catch {
            // Unfinished or malformed — try the lenient repair pass.
            try {
              const repaired = repairTrailingComma(candidate);
              const block = JSON.parse(repaired);
              blocks.push(block);
              events.push(block);
              cursor = i + 1;
            } catch {
              // Skip this candidate; salvage may catch it at end of stream.
              cursor = i + 1;
            }
          }
          objStart = -1;
        }
        i++;
        continue;
      }
      if (ch === ']' && depth === 0) {
        blocksArrayEnded = true;
        cursor = i + 1;
        break;
      }
      i++;
    }

    // If we're in the middle of an object when buffer ends, leave scanIdx at
    // the start of that object so next feed() picks up where we left off.
    scanIdx = depth > 0 && objStart >= 0 ? objStart : cursor;
    return events;
  }

  function repairTrailingComma(s) {
    // Strip a trailing comma before } or ] outside of strings.
    let out = '';
    let inStr = false, esc = false;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (!inStr && ch === ',') {
        let p = i + 1;
        while (p < s.length && /\s/.test(s[p])) p++;
        if (s[p] === '}' || s[p] === ']') continue;
      }
      out += ch;
      if (inStr) {
        if (esc) { esc = false; continue; }
        if (ch === '\\') { esc = true; continue; }
        if (ch === '"') { inStr = false; continue; }
      } else {
        if (ch === '"') inStr = true;
      }
    }
    return out;
  }

  return {
    feed(chunk) {
      buffer += chunk;
      const events = { opening: null, blocks: [] };
      if (!openingEmitted) {
        const opening = tryExtractOpening();
        if (opening !== null) {
          events.opening = opening;
          openingEmitted = true;
        }
      }
      if (ensureBlocksArrayStart()) {
        events.blocks = scanBlocks();
      }
      return events;
    },
    finalize() {
      // Last-ditch: if no blocks streamed, return the raw buffer for the
      // route's salvage path to handle. Otherwise return what we accumulated.
      return { blocks, raw: buffer };
    },
  };
}

/**
 * Run a streaming reflect call. Calls callbacks as opening / blocks / done /
 * error events fire. Always resolves once the stream is fully consumed OR an
 * error occurred — never throws. The route handler is responsible for any
 * post-processing (quote bank, echo, save) inside onDone.
 *
 * @param {string} systemPrompt
 * @param {string} userMessage
 * @param {object} options — passed to llm.stream (maxTokens, numCtx, etc.)
 * @param {{onOpening?: (text:string)=>void, onBlock?: (block:object)=>(void|Promise), onDone: (final:{opening:string|null, blocks:object[], raw:string})=>(void|Promise), onError?: (err:Error)=>void}} callbacks
 */
async function run(systemPrompt, userMessage, options, callbacks) {
  const parser = createReflectStreamParser();
  let opening = null;
  try {
    for await (const chunk of llm.stream(systemPrompt, userMessage, options)) {
      const events = parser.feed(chunk);
      if (events.opening !== null && callbacks.onOpening) {
        opening = events.opening;
        try { await callbacks.onOpening(events.opening); } catch (e) { console.warn('[reflectStream] onOpening threw:', e.message); }
      }
      for (const block of events.blocks) {
        if (callbacks.onBlock) {
          try { await callbacks.onBlock(block); } catch (e) { console.warn('[reflectStream] onBlock threw:', e.message); }
        }
      }
    }
    const final = parser.finalize();
    await callbacks.onDone({ opening, blocks: final.blocks, raw: final.raw });
  } catch (err) {
    console.error('[reflectStream] stream failed:', err.message);
    if (callbacks.onError) {
      try { callbacks.onError(err); } catch {}
    }
  }
}

module.exports = { run, createReflectStreamParser };
