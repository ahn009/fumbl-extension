// routes/checkout.js — Stripe Checkout session creation.

const express = require('express');

const router = express.Router();

const DEV_MODE = process.env.NODE_ENV !== 'production';

router.post('/create-session', async (req, res) => {
  const { extensionId } = req.body || {};
  if (!extensionId || typeof extensionId !== 'string' || extensionId.length > 128) {
    return res.status(400).json({ error: 'BAD_REQUEST' });
  }

  // DEV stub. Real Stripe wiring goes live once STRIPE_SECRET is set in prod.
  if (DEV_MODE) {
    return res.json({ url: 'https://buy.stripe.com/test_placeholder' });
  }

  try {
    // Lazy-load so a missing secret doesn't crash the server in dev.
    const Stripe = require('stripe');
    const stripe = new Stripe(process.env.STRIPE_SECRET, { apiVersion: '2024-06-20' });

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      success_url: `${process.env.BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.BASE_URL}/cancel`,
      metadata: { extensionId },
    });
    res.json({ url: session.url });
  } catch (e) {
    console.error('[fumbl] checkout error:', e.message);
    res.status(500).json({ error: 'CHECKOUT_FAILED' });
  }
});

module.exports = router;
