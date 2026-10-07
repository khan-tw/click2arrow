# Contributing

Use synthetic frames, labels and fixtures. Do not submit screenshots of private documents, account-specific plugin IDs, access tokens or personal paths.

Before opening a pull request:

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run benchmark
```

Stage only the intended public files, then run `npm run verify:public`. New public files must be added deliberately to the allowlist in that script. Keep `manifest.local.json` and generated `native-plugin/` files untracked.

Describe the interaction change, how it was verified, and which native Figma behaviors remain unverified. A mock-based test must not be presented as evidence of native frame rate or editor interaction.
