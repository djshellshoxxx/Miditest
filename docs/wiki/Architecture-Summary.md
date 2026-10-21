# Architecture Summary

From the README and the source layout.

- **Pure analysis core.** `midi-core.js` holds the analysis functions; `app-v2.js` is the UI; `features.js`, `lib/` and `midi-tests.js` provide features, active tests and test logic.
- **Desktop wrapper.** `desktop/` (Electron main, preload and Windows scanning) wraps the same web app; `winscan.cjs` covers Windows log analysis.
- **Measured, not diagnosed.** The tool reports observations and says it does not produce a definitive repair diagnosis (README).
- **Local first.** Data stays in the browser or the desktop app (README "Privacy").
