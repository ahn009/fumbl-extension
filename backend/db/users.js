// db/users.js — user persistence.
// TODO: replace with Supabase before prod.
//
// Production schema:
//   CREATE TABLE users (
//     extension_id TEXT PRIMARY KEY,
//     is_pro BOOLEAN DEFAULT FALSE,
//     created_at TIMESTAMPTZ DEFAULT NOW(),
//     stripe_customer_id TEXT
//   );

const devDb = {};

async function createUser(extensionId) {
  if (!extensionId) throw new Error('extensionId required');
  if (devDb[extensionId]) return devDb[extensionId];
  devDb[extensionId] = {
    extension_id: extensionId,
    is_pro: false,
    created_at: new Date().toISOString(),
    stripe_customer_id: null,
  };
  return devDb[extensionId];
}

async function markPro(extensionId, opts = {}) {
  if (!extensionId) throw new Error('extensionId required');
  if (!devDb[extensionId]) await createUser(extensionId);
  devDb[extensionId].is_pro = true;
  if (opts.stripeCustomerId) devDb[extensionId].stripe_customer_id = opts.stripeCustomerId;
  return devDb[extensionId];
}

async function isPro(extensionId) {
  return !!(devDb[extensionId] && devDb[extensionId].is_pro);
}

module.exports = { createUser, markPro, isPro };
