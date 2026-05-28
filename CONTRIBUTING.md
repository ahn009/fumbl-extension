# Contributing to Fumbl

Thanks for your interest in contributing to Fumbl! Here's how to get started.

## Getting started

1. Fork the repository.
2. Clone your fork locally.
3. Install dependencies:

```bash
npm install
cd backend && npm install
```

4. Copy the backend environment file:

```bash
cp backend/.env.example backend/.env
```

5. Add your OpenRouter API key to `backend/.env`.
6. Start the backend:

```bash
cd backend && npm start
```

7. Load the extension in Chrome (see [README.md](README.md)).

## Development workflow

1. Create a branch for your change:

```bash
git checkout -b feature/your-feature-name
```

2. Make your changes.
3. Run tests:

```bash
npm test
```

4. Run syntax checks:

```bash
node --check background.js
node --check popup/popup.js
node --check backend/routes/proxy.js
```

5. Commit with a clear message:

```bash
git commit -m "feat: description of what you changed"
```

6. Push and open a pull request.

## Commit message format

Use conventional commit prefixes:

- `feat:` new feature
- `fix:` bug fix
- `docs:` documentation only
- `style:` formatting, CSS, no logic change
- `refactor:` code restructuring without behavior change
- `test:` adding or updating tests
- `chore:` build, config, dependency updates

## Code guidelines

- Do not log email text or user content to console or files.
- Do not store API keys in Chrome storage or extension source.
- Keep content script DOM writes safe (use `textContent` or `execCommand`).
- Run `npm test` before submitting.
- Keep changes focused. One feature or fix per PR.

## What to work on

Check the issues tab or look for `TODO` comments in the codebase:

```bash
grep -rn "TODO" --include="*.js" .
```

Current areas that need work:

- Persistent database for Pro users (replace `backend/db/users.js`)
- Move preview modal logic from `gmail-inject.js` to `preview-modal.js`
- Backend deploy configs (Render, Fly, Railway)
- Chrome Web Store listing assets and screenshots
- Integration tests for backend routes
- Voice profile creation UI

## Reporting bugs

Open an issue with:

- Steps to reproduce
- Expected behavior
- Actual behavior
- Browser version and OS
- Console errors (if any)

## Security

If you find a security vulnerability, please report it privately. Do not open a public issue. See [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
