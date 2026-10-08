// Static serve of entry media (images, etc.) that older Notion imports
// copied in. Nothing writes here any more; existing entries still link to it.
//
// Files live at DATA_DIR/journal-media/<entry_id>/<filename>. Served under /api/media/<entry_id>/<filename> so the Tiptap
// body HTML can reference them with a stable URL after restore/reimport.

const express = require('express');
const path = require('path');
const fs = require('fs');
const { DATA_DIR } = require('../paths');

const MEDIA_ROOT = path.join(DATA_DIR, 'journal-media');
if (!fs.existsSync(MEDIA_ROOT)) fs.mkdirSync(MEDIA_ROOT, { recursive: true });

const router = express.Router();
// Never let a stored file run as a page on the app's origin (an .svg or
// .html opened directly would otherwise execute its scripts).
router.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox",
  });
  next();
});
router.use(express.static(MEDIA_ROOT, { fallthrough: false, maxAge: '30d' }));

module.exports = router;
module.exports.MEDIA_ROOT = MEDIA_ROOT;
