# Backend Documentation

The backend is an Express server used by the Chrome extension for AI rewrites, Pro-plan checks, Stripe checkout, and Stripe webhooks.

## Files

```text
backend/
├── server.js                 # Express app, middleware, route mounting
├── .env                      # Local environment variables, not for commits
├── .env.example              # Safe environment template
├── db/users.js               # In-memory dev user store
└── routes/
    ├── proxy.js              # OpenRouter humanize endpoint
    ├── checkout.js           # Stripe checkout session endpoint
    ├── webhook.js            # Stripe webhook receiver
    └── verify-pro.js         # Pro status endpoint
```

## Install and run

```bash
cd backend
npm install
npm start
```

The default port is `3000`.

Health check:

```bash
curl http://localhost:3000/health
```

## Environment variables

Copy `.env.example` to `.env` if needed and fill values:

```env
OPENROUTER_API_KEY=sk-or-your-key-here
OPENROUTER_MODEL=anthropic/claude-3.5-sonnet
OPENROUTER_CLASSIFIER_MODEL=anthropic/claude-3-haiku
OPENROUTER_SITE_URL=http://localhost:3000
OPENROUTER_APP_NAME=Fumbl
STRIPE_SECRET=sk_test_your-key-here
STRIPE_PRICE_ID=price_your-price-id
STRIPE_WEBHOOK_SECRET=whsec_your-secret
BASE_URL=http://localhost:3000
DATABASE_URL=postgresql://user:pass@localhost/fumbl
PORT=3000
```

### OpenRouter variables

| Variable | Required | Description |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | Yes for real AI calls | OpenRouter secret key. Leave empty for local mock responses. |
| `OPENROUTER_MODEL` | No | Main rewrite model. Defaults to `anthropic/claude-3.5-sonnet`. |
| `OPENROUTER_CLASSIFIER_MODEL` | No | Tone Guard classification model. Defaults to classifier model or main model. |
| `OPENROUTER_SITE_URL` | No | Sent to OpenRouter as `HTTP-Referer`. |
| `OPENROUTER_APP_NAME` | No | Sent to OpenRouter as `X-Title`. |

### Stripe variables

| Variable | Required for production | Description |
| --- | --- | --- |
| `STRIPE_SECRET` | Yes | Stripe secret key. |
| `STRIPE_PRICE_ID` | Yes | Subscription price ID. |
| `STRIPE_WEBHOOK_SECRET` | Yes | Webhook signing secret. |
| `BASE_URL` | Yes | Public URL used in checkout success/cancel URLs. |

## API routes

### `GET /health`

Returns backend status.

Response:

```json
{
  "status": "ok",
  "timestamp": "2026-05-28T20:00:00.000Z"
}
```

### `POST /proxy/humanize`

Humanizes email text using OpenRouter.

Request body:

```json
{
  "text": "I am writing to follow up about our meeting.",
  "mode": "subtle",
  "voiceProfile": null,
  "force": false
}
```

`mode` must be one of:

- `subtle`
- `human`
- `ceo`

Success response:

```json
{
  "result": "I'm following up about our meeting.",
  "provider": "openrouter",
  "model": "anthropic/claude-3.5-sonnet"
}
```

Sensitive-email warning response:

```json
{
  "warning": "SENSITIVE_EMAIL",
  "emailType": "LEGAL"
}
```

If `OPENROUTER_API_KEY` is empty, the route returns a mock response so UI development still works.

Common errors:

| Status | Error | Meaning |
| --- | --- | --- |
| `400` | `BAD_REQUEST` | `text` is missing or not a string. |
| `400` | `BAD_MODE` | Invalid rewrite mode. |
| `413` | `TEXT_TOO_LONG` | Text exceeds 10,000 characters. |
| `429` | `RATE_LIMITED` | More than 10 requests per IP per minute. |
| `502` | `UPSTREAM_ERROR` | OpenRouter failed or returned an invalid response. |

### `POST /checkout/create-session`

Creates a Stripe Checkout session.

Request body:

```json
{
  "extensionId": "chrome-extension-id-or-generated-id"
}
```

Development response:

```json
{
  "url": "https://buy.stripe.com/test_placeholder"
}
```

Production response:

```json
{
  "url": "https://checkout.stripe.com/..."
}
```

### `POST /webhook`

Receives Stripe webhook events. It marks a user as Pro when `checkout.session.completed` includes an `extensionId` in metadata.

Important:

- Mounted with `express.raw()` before `express.json()`.
- Always returns 200 to avoid repeated Stripe retries on handled failures.
- Does not log webhook bodies.

### `GET /verify-pro?extensionId=...`

Checks whether an extension/user is Pro.

Response:

```json
{
  "isPro": true
}
```

## Rate limiting

`/proxy/humanize` uses a simple in-memory limiter:

- 10 requests per IP
- 60 second window

This is fine for development or one server. For production, replace it with Redis, Upstash, Cloudflare, or platform-level rate limiting.

## Privacy and security rules

- Do not log `req.body.text`.
- Keep `OPENROUTER_API_KEY` only in backend `.env` or deployment secrets.
- Do not expose backend `.env` in frontend code.
- Use HTTPS in production.
- Validate deployment CORS origins in `server.js`.
- Replace in-memory `db/users.js` before production.

## Production checklist

- [ ] Deploy backend to HTTPS.
- [ ] Set `OPENROUTER_API_KEY` in deployment secrets.
- [ ] Set Stripe secrets in deployment secrets.
- [ ] Replace `db/users.js` with persistent database storage.
- [ ] Replace dev checkout placeholder with real Stripe flow.
- [ ] Set strict CORS origins.
- [ ] Update extension `BACKEND_BASE_URL`.
- [ ] Update extension host permissions.
- [ ] Test `/proxy/humanize` with real OpenRouter.
- [ ] Test Stripe webhook with Stripe CLI.
