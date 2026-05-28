// routes/webhook.js — Stripe webhook handler.
// Mounted with express.raw() in server.js so the signature verifies.
// Always returns 200 — Stripe retries on non-2xx.

const express = require('express');
const db = require('../db/users');

const router = express.Router();

const DEV_MODE = process.env.NODE_ENV !== 'production';

router.post('/', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    if (DEV_MODE && (!sig || !secret)) {
      // Dev passthrough: accept JSON body without signature.
      event = JSON.parse(req.body.toString('utf8') || '{}');
    } else {
      const Stripe = require('stripe');
      const stripe = new Stripe(process.env.STRIPE_SECRET, { apiVersion: '2024-06-20' });
      event = stripe.webhooks.constructEvent(req.body, sig, secret);
    }
  } catch (e) {
    console.error('[fumbl] webhook signature failure:', e.message);
    return res.status(200).json({ received: false });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const extensionId = session.metadata && session.metadata.extensionId;
      if (extensionId) {
        await db.markPro(extensionId, {
          stripeCustomerId: session.customer || null,
        });
      }
    }
  } catch (e) {
    console.error('[fumbl] webhook handler error:', e.message);
  }

  res.status(200).json({ received: true });
});

module.exports = router;
