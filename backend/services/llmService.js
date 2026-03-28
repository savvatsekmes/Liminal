/**
 * LLM service — reads provider + credentials from settingsService on every
 * call so live changes in the UI take effect immediately.
 */

const fetch = require('node-fetch');

function getSettings() {
  // Lazy-require to avoid circular deps at startup
  const s = require('./settingsService');
  return {
    provider:         s.get('llm_provider') || 'claude',
    anthropicKey:     s.get('anthropic_api_key'),
    claudeModel:      s.get('claude_model') || 'claude-opus-4-6',
    openaiKey:        s.get('openai_api_key'),
    openaiModel:      s.get('openai_model') || 'gpt-4.1',
    ollamaUrl:        s.get('ollama_url') || 'http://localhost:11434',
    ollamaModel:      s.get('ollama_model') || 'llama3.1',
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
async function callOllama(systemPrompt, userMessage, options = {}) {
  const cfg = getSettings();
  const ollamaUrl = options.ollamaUrl || cfg.ollamaUrl;
  const model = options.model || cfg.ollamaModel;

  const response = await fetch(`${ollamaUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    if (response.status === 404) {
      throw new Error(`Model "${model}" not found in Ollama. Pull it first with: ollama pull ${model}`);
    }
    throw new Error(`Ollama request failed: ${response.status} ${response.statusText}${errText ? ' — ' + errText : ''}`);
  }

  const data = await response.json();
  return data.message.content;
}

// ── Public API ────────────────────────────────────────────────────────────────

async function call(systemPrompt, userMessage, options = {}) {
  const provider = options.provider || getSettings().provider;

  switch (provider) {
    case 'claude':  return callClaude(systemPrompt, userMessage, options);
    case 'openai':  return callOpenAI(systemPrompt, userMessage, options);
    case 'ollama':  return callOllama(systemPrompt, userMessage, options);
    default: throw new Error(`Unknown LLM provider: ${provider}`);
  }
}

async function* stream(systemPrompt, userMessage, options = {}) {
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
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Model "${model}" not found in Ollama. Pull it first with: ollama pull ${model}`);
      }
      throw new Error(`Ollama stream failed: ${response.status} ${response.statusText}`);
    }

    let buffer = '';
    for await (const rawChunk of response.body) {
      buffer += rawChunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.message?.content) yield parsed.message.content;
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
  const response = await fetch(`${ollamaUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    }),
  });
  if (!response.ok) throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
  const data = await response.json();
  return data.message.content;
}

module.exports = { call, stream, callWithHistory, testConnection };
