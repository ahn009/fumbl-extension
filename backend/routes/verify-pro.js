// routes/verify-pro.js — extension polls this to learn its Pro status.

const express = require('express');
const db = require('../db/users');

const router = express.Router();

router.get('/', async (req, res) => {
  const { extensionId } = req.query;
  if (!extensionId || typeof extensionId !== 'string') {
    return res.status(400).json({ error: 'BAD_REQUEST' });
  }
  try {
    const isPro = await db.isPro(extensionId);
    res.json({ isPro: !!isPro });
  } catch (e) {
    console.error('[fumbl] verify-pro error:', e.message);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

module.exports = router;
