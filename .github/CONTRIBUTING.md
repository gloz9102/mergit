# Contributing to Mergit

Mergit is a minimal desktop Git client focused on staging, history, and conflict resolution. Contributions should keep that scope tight.

## Development setup

Requirements:

- Node.js 20+
- git

```bash
npm install
npm run dev
```

## Before opening a PR

Run the standard checks:

```bash
npm test
npm run typecheck
npm run build
```

For UI changes, include a screenshot or short recording.

## Scope guidelines

Good fits:

- staging, commit, branch, stash, remote, history, and conflict workflows
- safety improvements around destructive git operations
- performance improvements for large repositories
- small UX improvements that make common Git operations clearer

Usually out of scope:

- GitHub/GitLab issue or PR management
- GitFlow-specific workflows
- submodule management UI
- GPG/signing configuration UI
- full IDE features
- AI features that require account setup or hosted services

## Implementation guidelines

- Prefer native git commands and keep CLI compatibility.
- Keep renderer code behind the typed `window.api` bridge.
- Put shared parsers and pure logic in `src/shared` with tests.
- Keep user-facing text in both Korean and English locale files.
- Avoid new dependencies unless the problem is hard to solve safely without one.
