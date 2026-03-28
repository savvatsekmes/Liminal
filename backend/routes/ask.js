const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const llm = require('../services/llmService');
const memory = require('../services/memoryService');

router.use(requireAuth);

// POST /api/ask
// Body: { question, archetype }
router.post('/', async (req, res, next) => {
  console.log('[ask] POST received, userId:', req.userId, 'body:', JSON.stringify(req.body));
  try {
    const { question, archetype = 'Direct Friend' } = req.body || {};
    if (!question?.trim()) return res.status(400).json({ error: 'question is required' });

    const systemPrompt = await memory.buildAskSystemPrompt(req.userId, archetype);
    const answer = await llm.call(systemPrompt, question.trim(), { maxTokens: 900 });
    res.json({ answer: answer.trim(), archetype });
  } catch (err) {
    console.error('[ask] error:', err.message);
    res.status(500).json({ error: 'Failed to generate response', detail: err.message });
  }
});

module.exports = router;
