// server.js — Fumbl backend.
// Express server hosting the Claude API proxy, Stripe checkout, and webhook.
// Privacy: never log request bodies on /proxy or /webhook routes.

require('dotenv').config();

const express = require('express');
const cors = require('cors');

const proxyRouter    = require('./routes/proxy');
const checkoutRouter = require('./routes/checkout');
const webhookRouter  = require('./routes/webhook');
const verifyProRouter = require('./routes/verify-pro');

const app = express();

// CORS — allow chrome-extension:// origins + localhost for dev tools.
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // curl/healthcheck/no-origin
    if (origin.startsWith('chrome-extension://')) return cb(null, true);
    if (origin.startsWith('http://localhost')) return cb(null, true);
    if (origin.startsWith('https://fumbl.com')) return cb(null, true);
    return cb(new Error('CORS: origin not allowed'));
  },
}));

// /webhook needs raw body for Stripe signature verification — mount BEFORE
// express.json so the JSON parser does not consume the stream.
app.use('/webhook', express.raw({ type: 'application/json' }), webhookRouter);

// JSON parser for everything else.
app.use(express.json({ limit: '256kb' }));

// Health check.
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/proxy', proxyRouter);
app.use('/checkout', checkoutRouter);
app.use('/verify-pro', verifyProRouter);

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'NOT_FOUND', path: req.path });
});

// Error handler. Never echoes back the request body.
app.use((err, _req, res, _next) => {
  console.error('[fumbl] error:', err.message);
  res.status(err.status || 500).json({ error: err.code || 'INTERNAL_ERROR' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[fumbl] listening on :${PORT}`);
});
