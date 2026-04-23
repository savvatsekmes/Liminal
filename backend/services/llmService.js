/**
 * LLM service — reads provider + credentials from settingsService on every
 * call so live changes in the UI take effect immediately.
 */

const fetch = require('node-fetch');

// ── Language injection ────────────────────────────────────────────────────────
// Centralised so every route benefits without touching individual prompts.
// Routes that read user-written content (entries, notes, chat messages) should
// pass `{ language: false }` to opt out — the LLM will then mirror whatever
// language the user typed in, rather than being forced into the UI language.

const LANG_NAMES = {
  en: 'English', el: 'Greek', es: 'Spanish', fr: 'French', de: 'German',
  pt: 'Portuguese', it: 'Italian', ja: 'Japanese', zh: 'Chinese', ko: 'Korean',
  ru: 'Russian', ar: 'Arabic', tr: 'Turkish', nl: 'Dutch', sv: 'Swedish', pl: 'Polish',
};

function withLanguage(systemPrompt, options = {}) {
  if (options.language === false) return systemPrompt;
  const code = options.language || require('./settingsService').get('language') || 'en';
  if (code === 'en') return systemPrompt;
  const name = LANG_NAMES[code] || 'English';
  return `${systemPrompt}\n\nIMPORTANT: Respond entirely in ${name}. All output must be in ${name}, not English.`;
}

// Qwen and similar safety-trained local models sometimes leak meta-reasoning
// into their visible (non-<think>-tagged) output — typically a bolded
// "**Wait! Before I continue, let me verify whether the user is at risk...**"
// block that talks about the safety policy instead of answering. Two harms:
//   1. Jarring/confusing for the user (they see the model arguing with itself).
//   2. CrisisGate's output banner scans for "suicide" / "self-harm" — and
//      these words appear in the meta block purely in the context of the
//      model checking whether a policy applies, not because the conversation
//      is actually about crisis. Result: false-positive crisis banner on
//      benign or sexual conversations.
// Strip the obvious meta patterns before returning to callers.
function stripModelMeta(text) {
  if (!text || typeof text !== 'string') return text;
  let out = text;

  // Bolded leading or standalone meta blocks ("**Wait! ...**", "**Note:...**").
  out = out.replace(
    /(^|\n\n)\*\*(?:Wait|Note|Safety check|Safety note|Pause|Checking|Verifying|Verify|Hold on|Hmm|Actually|Important)[^*]{0,500}\*\*\s*/gi,
    (m, sep) => sep || ''
  );

  // "Let me verify / check / confirm ... [suicide|self-harm|risk|policy|rails]" sentences.
  out = out.replace(
    /(?:^|(?<=[.!?\n]))\s*[^.!?\n]{0,40}?\b(?:let me (?:verify|check|confirm|make sure|see whether|see if|first (?:verify|check|confirm))|i (?:need|have) to (?:verify|check|confirm|consider whether|first (?:verify|check|confirm))|i(?:'?m| am) going to (?:verify|check|consider whether))\b[^.!?\n]{0,200}\b(?:suicide|self[\s-]?harm|crisis|at\s+risk|safety\s+policy|safety\s+(?:rail|guardrail|protocol)s?|guideline|policy applies)\b[^.!?\n]*[.!?]?\s*/gi,
    ''
  );

  // Self-referential safety-rail lecture sentences ("I'm built with safety
  // rails that hard-stop me from..."). Different from a refusal — refusal
  // is "I won't do X"; this is the model lecturing about its own architecture.
  out = out.replace(
    /(?:^|(?<=[.!?\n]))\s*[^.!?\n]{0,40}?\b(?:i(?:'?m| am)|i have|i was|i(?:'?ve| have))\b[^.!?\n]{0,80}\b(?:built with|trained with|designed with|equipped with|programmed with|configured with|come with|operate under)\b[^.!?\n]{0,120}\b(?:safety|content)[\s-]+(?:rail|guardrail|protocol|policy|policies|filter|restriction|guideline)s?\b[^.!?\n]*[.!?]?\s*/gi,
    ''
  );

  const cleaned = out.replace(/\n{3,}/g, '\n\n').trim();
  // If the strip ate everything, the response was nothing but meta — return
  // the original so callers can decide what to do (oracle.js retries; reflect
  // falls back to a single block). Empty-from-strip would otherwise trigger
  // false "empty response" errors for benign-but-overly-verbose models.
  return cleaned || text.trim();
}

function getSettings() {
  // Lazy-require to avoid circular deps at startup
  const s = require('./settingsService');
  return {
    provider:         s.get('llm_provider') || 'ollama',
    anthropicKey:     s.get('anthropic_api_key'),
    claudeModel:      s.get('claude_model') || 'claude-opus-4-6',
    openaiKey:        s.get('openai_api_key'),
    openaiModel:      s.get('openai_model') || 'gpt-4.1',
    ollamaUrl:        s.get('ollama_url') || 'http://localhost:11434',
    ollamaModel:      s.get('ollama_model') || 'llama3.1',
    ollamaThink:      s.get('ollama_think') === 'true',
  };
}

// ── Claude ────────────────────────────────────────────────────────────────────
async function callClaude(systemPrompt, userMessage, options = {}) {
  const { anthropicKey } = getSettings();
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: options.apiKey || anthropicKey });

  const response = await client.messages.create({
    model: options.model || getSettings().claudeModel,
    max_tokens: options.maxTokens || 2048,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  return response.content[0].text;
}

// ── OpenAI ────────────────────────────────────────────────────────────────────
async function callOpenAI(systemPrompt, userMessage, options = {}) {
  const cfg = getSettings();
  const OpenAI = require('openai');
  const client = new OpenAI({ apiKey: options.apiKey || cfg.openaiKey });

  const response = await client.chat.completions.create({
    model: options.model || cfg.openaiModel,
    max_tokens: options.maxTokens || 2048,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
  });

  return response.choices[0].message.content;
}

// ── Ollama ────────────────────────────────────────────────────────────────────
const OLLAMA_TIMEOUT = 5 * 60 * 1000; // 5 minutes for large models

async function callOllama(systemPrompt, userMessage, options = {}) {
  const cfg = getSettings();
  const ollamaUrl = options.ollamaUrl || cfg.ollamaUrl;
  const model = options.model || cfg.ollamaModel;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT);

  let response;
  try {
    response = await fetch(`${ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        think: options.think ?? cfg.ollamaThink ?? false,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        options: {
          num_ctx: options.numCtx || 8192,
        },
      }),
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    if (response.status === 404) {
      throw new Error(`Model "${model}" not found in Ollama. Pull it first with: ollama pull ${model}`);
    }
    throw new Error(`Ollama request failed: ${response.status} ${response.statusText}${errText ? ' — ' + errText : ''}`);
  }

  const data = await response.json();
  // Strip any <think>...</think> tags that reasoning models may include,
  // then strip any safety meta-reasoning that leaked outside <think>.
  const noThink = (data.message?.content || '').replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim();
  return stripModelMeta(noThink);
}

// ── Public API ────────────────────────────────────────────────────────────────

async function call(systemPrompt, userMessage, options = {}) {
  systemPrompt = withLanguage(systemPrompt, options);
  const provider = options.provider || getSettings().provider;

  switch (provider) {
    case 'claude':  return callClaude(systemPrompt, userMessage, options);
    case 'openai':  return callOpenAI(systemPrompt, userMessage, options);
    case 'ollama':  return callOllama(systemPrompt, userMessage, options);
    default: throw new Error(`Unknown LLM provider: ${provider}`);
  }
}

async function* stream(systemPrompt, userMessage, options = {}) {
  systemPrompt = withLanguage(systemPrompt, options);
  const provider = options.provider || getSettings().provider;

  if (provider === 'claude') {
    const { anthropicKey } = getSettings();
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: options.apiKey || anthropicKey });

    const streamResponse = client.messages.stream({
      model: options.model || getSettings().claudeModel,
      max_tokens: options.maxTokens || 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    for await (const chunk of streamResponse) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        yield chunk.delta.text;
      }
    }

  } else if (provider === 'openai') {
    const cfg = getSettings();
    const OpenAI = require('openai');
    const client = new OpenAI({ apiKey: options.apiKey || cfg.openaiKey });

    const streamResponse = await client.chat.completions.create({
      model: options.model || cfg.openaiModel,
      max_tokens: options.maxTokens || 2048,
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    });

    for await (const chunk of streamResponse) {
      const text = chunk.choices[0]?.delta?.content;
      if (text) yield text;
    }

  } else if (provider === 'ollama') {
    const cfg = getSettings();
    const ollamaUrl = options.ollamaUrl || cfg.ollamaUrl;
    const model = options.model || cfg.ollamaModel;

    const response = await fetch(`${ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: true,
        think: options.think ?? cfg.ollamaThink ?? false,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        options: {
          num_ctx: options.numCtx || 8192,
        },
      }),
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Model "${model}" not found in Ollama. Pull it first with: ollama pull ${model}`);
      }
      throw new Error(`Ollama stream failed: ${response.status} ${response.statusText}`);
    }

    let buffer = '';
    let inThink = false;
    for await (const rawChunk of response.body) {
      buffer += rawChunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.message?.content) {
            let text = parsed.message.content;
            // Filter out <think>...</think> tags from streaming
            if (text.includes('<think>')) inThink = true;
            if (inThink) {
              if (text.includes('</think>')) {
                text = text.split('</think>').pop();
                inThink = false;
              } else {
                continue;
              }
            }
            if (text) yield text;
          }
        } catch {}
      }
    }
  }
}

/**
 * Test a provider connection. Returns { ok: bool, error?: string, model?: string }
 */
async function testConnection(provider, overrides = {}) {
  try {
    const result = await call(
      'You are a helpful assistant.',
      'Reply with exactly: ok',
      { provider, maxTokens: 10, ...overrides }
    );
    return { ok: true, response: result.trim() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ── Multi-turn conversation ───────────────────────────────────────────────────
// messages: [{ role: 'user'|'assistant', content: string }, ...]

async function callWithHistory(systemPrompt, messages, options = {}) {
  systemPrompt = withLanguage(systemPrompt, options);
  const cfg = getSettings();
  const provider = options.provider || cfg.provider;

  if (provider === 'claude') {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: options.apiKey || cfg.anthropicKey });
    const response = await client.messages.create({
      model: options.model || cfg.claudeModel,
      max_tokens: options.maxTokens || 2048,
      system: systemPrompt,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });
    return response.content[0].text;
  }

  if (provider === 'openai') {
    const OpenAI = require('openai');
    const client = new OpenAI({ apiKey: options.apiKey || cfg.openaiKey });
    const response = await client.chat.completions.create({
      model: options.model || cfg.openaiModel,
      max_tokens: options.maxTokens || 2048,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    });
    return response.choices[0].message.content;
  }

  // Ollama
  const ollamaUrl = options.ollamaUrl || cfg.ollamaUrl;
  const model = options.model || cfg.ollamaModel;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT);
  let response;
  try {
    response = await fetch(`${ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        think: options.think ?? cfg.ollamaThink ?? false,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.map((m) => ({ role: m.role, content: m.content })),
        ],
        options: {
          num_ctx: options.numCtx || 8192,
        },
      }),
    });
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
  const data = await response.json();
  const raw = data.message?.content || '';
  const stripped = stripModelMeta(raw.replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim());
  if (stripped) return stripped;
  // Model spent the whole token budget "thinking" and never got to an answer.
  // Rather than surface "Model returned an empty response", return the thinking
  // content minus the tags so the user sees something.
  return stripModelMeta(raw.replace(/<\/?think>/g, '').trim());
}

// ── Tool-calling conversation (web search) ──────────────────────────────────

const WEB_SEARCH_TOOL = {
  name: 'web_search',
  description: 'Search the web for current information. Use when the user asks about recent events, facts you are unsure about, or anything that benefits from up-to-date data.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The search query' },
    },
    required: ['query'],
  },
};

async function executeToolCall(toolName, args) {
  if (toolName === 'web_search') {
    const searchService = require('./searchService');
    const result = await searchService.search(args.query);
    return searchService.formatResults(result);
  }
  return 'Unknown tool';
}

async function callWithHistoryAndTools(systemPrompt, messages, options = {}) {
  systemPrompt = withLanguage(systemPrompt, options);
  const searchService = require('./searchService');
  if (!searchService.isEnabled()) {
    return callWithHistory(systemPrompt, messages, options);
  }

  const cfg = getSettings();
  const provider = options.provider || cfg.provider;

  // Claude/OpenAI: use native tool calling (works reliably)
  if (provider === 'claude') {
    return callClaudeWithTools(systemPrompt, messages, cfg, options);
  }
  if (provider === 'openai') {
    return callOpenAIWithTools(systemPrompt, messages, cfg, options);
  }

  // Ollama (and any other): prompt injection fallback
  // Most Ollama models don't support tool calling reliably, so we detect
  // search-worthy queries and inject results directly into the system prompt.
  const lastMsg = messages[messages.length - 1];
  if (lastMsg?.role === 'user' && searchService.needsSearch(lastMsg.content)) {
    console.log('[web-search] Triggered for:', lastMsg.content);
    const results = await searchService.search(lastMsg.content);
    console.log('[web-search] Results:', results.results?.length || 0, results.error || '');
    const formatted = searchService.formatResults(results);
    if (results.results?.length > 0) {
      const searchBlock = '\n\nWeb search results:\n' + formatted +
        '\n\nUse these search results to inform your response where relevant.';
      // If adding search would push past 20K, trim the system prompt to make room
      // (keeps search quality intact for capable models, trims context for smaller ones)
      const MAX_PROMPT = 20000;
      if (systemPrompt.length + searchBlock.length > MAX_PROMPT) {
        systemPrompt = systemPrompt.substring(0, MAX_PROMPT - searchBlock.length);
      }
      systemPrompt += searchBlock;
    }
  }
  return callWithHistory(systemPrompt, messages, options);
}

async function callClaudeWithTools(systemPrompt, messages, cfg, options) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: options.apiKey || cfg.anthropicKey });

  const claudeTool = {
    name: WEB_SEARCH_TOOL.name,
    description: WEB_SEARCH_TOOL.description,
    input_schema: WEB_SEARCH_TOOL.parameters,
  };

  const mapped = messages.map((m) => ({ role: m.role, content: m.content }));

  const response = await client.messages.create({
    model: options.model || cfg.claudeModel,
    max_tokens: options.maxTokens || 2048,
    system: systemPrompt,
    tools: [claudeTool],
    messages: mapped,
  });

  // Check if the model wants to use a tool
  const toolBlock = response.content.find((b) => b.type === 'tool_use');
  if (!toolBlock) {
    const textBlock = response.content.find((b) => b.type === 'text');
    return textBlock ? textBlock.text : '';
  }

  // Execute tool and re-call
  const toolResult = await executeToolCall(toolBlock.name, toolBlock.input);

  const followUp = await client.messages.create({
    model: options.model || cfg.claudeModel,
    max_tokens: options.maxTokens || 2048,
    system: systemPrompt,
    messages: [
      ...mapped,
      { role: 'assistant', content: response.content },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolBlock.id, content: toolResult }] },
    ],
  });

  const finalText = followUp.content.find((b) => b.type === 'text');
  return finalText ? finalText.text : '';
}

async function callOpenAIWithTools(systemPrompt, messages, cfg, options) {
  const OpenAI = require('openai');
  const client = new OpenAI({ apiKey: options.apiKey || cfg.openaiKey });

  const model = options.model || cfg.openaiModel;
  // Reasoning models (o1, o3) don't support function calling
  const isReasoning = /^o[13]/.test(model);

  const mapped = [
    { role: 'system', content: systemPrompt },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const reqParams = {
    model,
    max_tokens: options.maxTokens || 2048,
    messages: mapped,
  };
  if (!isReasoning) {
    reqParams.tools = [{
      type: 'function',
      function: {
        name: WEB_SEARCH_TOOL.name,
        description: WEB_SEARCH_TOOL.description,
        parameters: WEB_SEARCH_TOOL.parameters,
      },
    }];
  }

  const response = await client.chat.completions.create(reqParams);
  const msg = response.choices[0].message;

  if (!msg.tool_calls || msg.tool_calls.length === 0) {
    return msg.content || '';
  }

  // Execute tool and re-call
  const tc = msg.tool_calls[0];
  const args = JSON.parse(tc.function.arguments);
  const toolResult = await executeToolCall(tc.function.name, args);

  const followUp = await client.chat.completions.create({
    model,
    max_tokens: options.maxTokens || 2048,
    messages: [
      ...mapped,
      msg,
      { role: 'tool', tool_call_id: tc.id, content: toolResult },
    ],
  });

  return followUp.choices[0].message.content || '';
}

async function callOllamaWithTools(systemPrompt, messages, cfg, options) {
  const ollamaUrl = options.ollamaUrl || cfg.ollamaUrl;
  const model = options.model || cfg.ollamaModel;

  const mapped = [
    { role: 'system', content: systemPrompt },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const response = await fetch(`${ollamaUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      messages: mapped,
      tools: [{
        type: 'function',
        function: {
          name: WEB_SEARCH_TOOL.name,
          description: WEB_SEARCH_TOOL.description,
          parameters: WEB_SEARCH_TOOL.parameters,
        },
      }],
    }),
  });

  if (!response.ok) throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
  const data = await response.json();

  // If no tool calls, return text response
  if (!data.message.tool_calls || data.message.tool_calls.length === 0) {
    return (data.message.content || '').replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim();
  }

  // Execute tool and re-call
  const tc = data.message.tool_calls[0];
  const args = tc.function.arguments;
  const toolResult = await executeToolCall(tc.function.name, typeof args === 'string' ? JSON.parse(args) : args);

  const followUp = await fetch(`${ollamaUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        ...mapped,
        data.message,
        { role: 'tool', content: toolResult },
      ],
    }),
  });

  if (!followUp.ok) throw new Error(`Ollama follow-up failed: ${followUp.status}`);
  const followUpData = await followUp.json();
  return followUpData.message.content || '';
}

module.exports = { call, stream, callWithHistory, callWithHistoryAndTools, testConnection };
