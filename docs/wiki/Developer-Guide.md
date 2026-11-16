# Developer Guide

```sh
npm test                 # core, tests, lib-a/b/c, fixtures, ui-static and syntax checks (each file exits 0 on this snapshot)
npm run test:browser     # headless Chromium with a mock Web MIDI device (not run here)
npm start                # Electron desktop app (not run here)
```

The app is static HTML, CSS and JavaScript. `midi-core.js` holds pure analysis functions and `app-v2.js` the UI. CI: `.github/workflows/ci.yml`; Pages deploys from `main` only after tests pass (README "Development").
