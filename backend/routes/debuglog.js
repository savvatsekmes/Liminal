const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const DATA_DIR = process.env.LIMINAL_USER_DATA
  ? path.resolve(process.env.LIMINAL_USER_DATA)
  : path.join(__dirname, '..', 'data');
const LOG_PATH = path.join(DATA_DIR, 'lockbug.log');

router.post('/', (req, res) => {
  try {
    const line = `[${new Date().toISOString()}] ${JSON.stringify(req.body)}\n`;
    fs.appendFileSync(LOG_PATH, line);
  } catch (err) {
    // best-effort — never block the client on logging failures
  }
  res.status(204).end();
});

router.get('/path', (req, res) => {
  res.json({ path: LOG_PATH });
});

module.exports = router;
