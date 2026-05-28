# Security Policy

## Reporting a vulnerability

If you discover a security vulnerability in Fumbl, please report it responsibly.

**Do not open a public GitHub issue for security vulnerabilities.**

Instead, email: **mt6992266@gmail.com**

Include:

- Description of the vulnerability.
- Steps to reproduce.
- Impact assessment.
- Suggested fix (if any).

You will receive a response within 48 hours acknowledging your report.

## Supported versions

| Version | Supported |
| --- | --- |
| 1.0.x | Yes |

## Security design

### API keys

- The OpenRouter API key is stored only in the backend `.env` file.
- The extension does not store or transmit API keys.
- `backend/.env` is gitignored and must never be committed.

### Email privacy

- Email text is sent only to the backend proxy and OpenRouter for rewriting.
- Backend routes do not log request bodies or email content.
- The extension stores undo snapshots in `chrome.storage.local` only.
- Users can clear all local snapshots from the popup.

### Network

- The extension communicates only with the configured backend URL.
- The backend communicates only with OpenRouter and Stripe APIs.
- CORS is restricted to Chrome extension origins and configured domains.
- Production deployments should use HTTPS.

### Dependencies

- Backend dependencies are minimal: Express, CORS, dotenv, Stripe.
- Keep dependencies updated. Run `npm audit` periodically.

## Best practices for deployers

- Use HTTPS for the backend in production.
- Set strict CORS origins in `backend/server.js`.
- Rotate the OpenRouter API key if compromised.
- Use environment variables or secret managers for all keys.
- Do not expose `backend/.env` in Docker images or public repos.
- Review Stripe webhook signatures in production.
