# Changelog

All notable changes to Fumbl will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.0] - 2026-05-28

### Added

- Gmail compose toolbar with Subtle, Human, and CEO rewrite modes.
- Preview modal with sentence-level diff before applying changes.
- Undo last rewrite from local storage.
- Daily free rewrite quota (2 per day for free users).
- Tone Guard: classifies sensitive emails (apology, legal, HR, medical) and warns before rewriting.
- Right-click context menu to humanize selected text.
- Post-processing imperfection library (17 typo/humanizing functions).
- OpenRouter backend proxy for AI rewrites.
- Multi-model support via OpenRouter (configurable model slugs).
- Stripe checkout and webhook stubs for Pro plan.
- Pro status verification endpoint.
- Extension popup with mode selection, usage meter, and privacy controls.
- Backend rate limiting (10 req/IP/min).
- Dev mock mode when no OpenRouter key is configured.
- Full documentation: README, backend API docs, extension architecture, developer guide.
- MIT License.
- Contributing guidelines.
- Security policy.
- Code of Conduct.

### Security

- API keys are stored only in backend environment, never in Chrome storage.
- Email text is never logged by backend or extension.
- Undo snapshots are stored locally only and can be cleared by the user.
