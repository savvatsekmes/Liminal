// Static serve of entry media (images, etc.) copied in from Notion imports.
//
// Files live at DATA_DIR/journal-media/<entry_id>/<filename> and are written
// during import. Served under /api/media/<entry_id>/<filename> so the Tiptap
// body HTML can reference them with a stable URL after restore/reimport.

const express = require('express');
const path = require('path');
const fs = require('fs');
const { DATA_DIR } = require('../paths');

const MEDIA_ROOT = path.join(DATA_DIR, 'journal-media');
if (!fs.existsSync(MEDIA_ROOT)) fs.mkdirSync(MEDIA_ROOT, { recursive: true });

const router = express.Router();
router.use(express.static(MEDIA_ROOT, { fallthrough: false, maxAge: '30d' }));

module.exports = router;
module.exports.MEDIA_ROOT = MEDIA_ROOT;
