# Developer Guide

This guide contains common development, testing, packaging, and release tasks for Fumbl.

## Quick commands

From the project root:

```bash
npm test
node --check background.js
node --check popup/popup.js
node --check tests/test-prompts.js
```

From the backend folder:

```bash
cd backend
npm install
npm start
```

## OpenRouter setup

The backend reads OpenRouter settings from `backend/.env`.

Minimum local setup:

```env
OPENROUTER_API_KEY=sk-or-your-key-here
PORT=3000
```

Recommended setup:

```env
OPENROUTER_API_KEY=sk-or-your-key-here
OPENROUTER_MODEL=anthropic/claude-3.5-sonnet
OPENROUTER_CLASSIFIER_MODEL=anthropic/claude-3-haiku
OPENROUTER_SITE_URL=http://localhost:3000
OPENROUTER_APP_NAME=Fumbl
PORT=3000
```

After editing `.env`, restart the backend.

## Local smoke tests

### Backend health

```bash
curl http://localhost:3000/health
```

### Humanize endpoint

```bash
curl -X POST http://localhost:3000/proxy/humanize \
  -H 'content-type: application/json' \
  -d '{"text":"I am writing to follow up about the meeting.","mode":"subtle"}'
```

If `OPENROUTER_API_KEY` is empty, this returns a mock response. If a key is present, it calls OpenRouter.

## Extension reload workflow

1. Start backend with `cd backend && npm start`.
2. Open `chrome://extensions`.
3. Click reload on Fumbl.
4. Reload Gmail.
5. Open a compose window.
6. Test `Fumbl it` in each mode.

## Manual QA checklist

### Popup

- [ ] Popup opens without console errors.
- [ ] Mode buttons show active state.
- [ ] Clicking a mode persists it.
- [ ] Usage meter updates after rewrites.
- [ ] Clear privacy snapshots button works.
- [ ] Upgrade button opens checkout URL.

### Gmail toolbar

- [ ] Toolbar appears in compose window.
- [ ] Toolbar does not duplicate in the same compose window.
- [ ] Subtle/Human/CEO buttons switch active state.
- [ ] Empty compose shows a helpful toast.
- [ ] Selected text rewrite works.
- [ ] Full body rewrite works.
- [ ] Preview modal shows original and rewritten text.
- [ ] Reject closes modal without changes.
- [ ] Accept applies rewrite.
- [ ] Undo restores original text.

### Context menu

- [ ] Right-click selected text shows `Fumbl — Humanize selection`.
- [ ] Selection rewrite replaces selected content.
- [ ] Errors show toasts instead of failing silently.

### Backend

- [ ] `/health` returns OK.
- [ ] `/proxy/humanize` returns mock when key is empty.
- [ ] `/proxy/humanize` returns real rewrite when key is present.
- [ ] Invalid mode returns `BAD_MODE`.
- [ ] Long text returns `TEXT_TOO_LONG`.
- [ ] Rate limit returns `RATE_LIMITED` after repeated calls.

## Packaging extension

Before packaging:

1. Set `BACKEND_BASE_URL` in `background.js` to production backend.
2. Update `manifest.json` host permissions.
3. Remove local-only permissions if not needed.
4. Reload and test extension.
5. Remove temporary files if any.

Create zip:

```bash
zip -r fumbl-v1.0.0.zip \
  manifest.json background.js prompts.js imperfections.js \
  content popup icons \
  -x '*.DS_Store'
```

Do not include:

- `backend/.env`
- `backend/node_modules`
- local logs
- secret keys

## Deployment checklist

### Backend

- [ ] Deploy backend to HTTPS.
- [ ] Set `OPENROUTER_API_KEY` as a deployment secret.
- [ ] Set OpenRouter model variables.
- [ ] Configure Stripe secrets.
- [ ] Replace dev DB with persistent DB.
- [ ] Set strict CORS origins.
- [ ] Validate `/health`.
- [ ] Validate `/proxy/humanize`.

### Extension

- [ ] Update `BACKEND_BASE_URL`.
- [ ] Update `manifest.json` host permissions.
- [ ] Confirm no secrets in extension source.
- [ ] Test Gmail injection on a clean browser profile.
- [ ] Test all rewrite modes.
- [ ] Package extension zip.

## Coding conventions

- Keep email text out of logs.
- Do not store API keys in Chrome storage.
- Prefer backend proxy for all model calls.
- Keep content script DOM writes safe.
- Use `textContent` or `document.execCommand('insertText')` when inserting user/model text into Gmail.
- Keep extension UI small and fast.
- Run tests after changing prompts or imperfections.

## Current technical debt

- `preview-modal.js` is empty while modal logic lives in `gmail-inject.js`.
- Backend user DB is in-memory only.
- Stripe checkout uses a development placeholder in dev mode.
- Backend URL is hard-coded in `background.js`.
- Gmail selectors are brittle by nature and may need maintenance.

## Suggested next improvements

- Add a small config file for backend URL.
- Move preview modal logic from `gmail-inject.js` into `preview-modal.js`.
- Add integration tests for backend `/proxy/humanize`.
- Add persistent database storage for Pro users.
- Add production deploy config for Render/Fly/Railway/Vercel.
- Add Chrome Web Store submission notes and screenshots.
