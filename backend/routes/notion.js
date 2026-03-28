const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const os = require('os');
const { importFromNotion, embedAllEntries, generateInitialSummary } = require('../services/notionImport');

// Store upload in temp dir
const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/zip' || file.originalname.endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('Only ZIP files are accepted'));
    }
  },
});

// Track ongoing import progress in memory
const importState = {
  running: false,
  done: 0,
  total: 0,
  phase: 'idle',       // idle | importing | embedding | summarising | complete | error
  message: '',
  result: null,
};

// ── GET /api/notion/status ───────────────────────────────────────────────────
router.get('/status', (req, res) => {
  res.json(importState);
});

// ── POST /api/notion/import ──────────────────────────────────────────────────
// Accepts a multipart ZIP upload or a JSON body with { folderPath }
router.post('/import', upload.single('file'), async (req, res) => {
  if (importState.running) {
    return res.status(409).json({ error: 'Import already in progress' });
  }

  let sourcePath;

  if (req.file) {
    // Rename to .zip so the importer can identify it
    const zipPath = req.file.path + '.zip';
    const fs = require('fs');
    fs.renameSync(req.file.path, zipPath);
    sourcePath = zipPath;
  } else if (req.body?.folderPath) {
    sourcePath = req.body.folderPath;
  } else {
    return res.status(400).json({ error: 'Provide a ZIP file or folderPath' });
  }

  // Acknowledge immediately — import runs in background
  res.json({ started: true, message: 'Import started. Poll /api/notion/status for progress.' });

  // Run asynchronously
  setImmediate(async () => {
    importState.running = true;
    importState.phase = 'importing';
    importState.done = 0;
    importState.total = 0;
    importState.message = 'Starting import...';
    importState.result = null;

    try {
      const result = await importFromNotion(sourcePath, (done, total, message) => {
        importState.done = done;
        importState.total = total;
        importState.message = message;
      });

      importState.result = result;
      importState.phase = 'embedding';
      importState.message = 'Building memory index...';

      await embedAllEntries((done, total) => {
        importState.done = done;
        importState.total = total;
        importState.message = `Indexing entries: ${done}/${total}`;
      });

      importState.phase = 'summarising';
      importState.message = 'Generating initial memory summary...';

      await generateInitialSummary();

      importState.phase = 'complete';
      importState.message = `Done! ${result.imported} entries imported.`;
    } catch (err) {
      console.error('[notion-import] Fatal error:', err);
      importState.phase = 'error';
      importState.message = err.message;
    } finally {
      importState.running = false;

      // Clean up the uploaded ZIP
      try {
        if (sourcePath.includes(os.tmpdir())) {
          require('fs').unlinkSync(sourcePath);
        }
      } catch {}
    }
  });
});

module.exports = router;
