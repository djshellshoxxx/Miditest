# MIDItest

**MIDItest by Circuit Drift Labs** is a local-first browser MIDI monitor, controller diagnostic bench and technician-oriented troubleshooting workspace.

Live site: https://djshellshoxxx.github.io/Miditest/

Circuit Drift Labs: https://djshellshoxxx.github.io/circuitdriftlabs/

## What it does

MIDItest uses Web MIDI to show what connected MIDI hardware actually sends. It is designed for musicians, developers and repair/diagnostic work where the useful question is not just “is MIDI arriving?” but “what is arriving, how consistently, on which channel, at what rate, and does the measured behavior change over time?”

Implemented diagnostics include live decoded/raw monitoring with search and filters; guided controller testing; automatic controller inventory; CC range, coverage, skipped/repeated values, jitter, jumps, reversals and dead-zone analysis; selected-control history graphs and histograms; encoder heuristics; keybed, held-note, duplicate/stuck-note and chord views; aggregate/per-key velocity statistics; channel/poly aftertouch; pitch-bend range/center analysis; mod/expression/sustain inspection; per-channel traffic; flood heuristics; MIDI Learn and editable mapping worksheets; MIDI clock/transport/song-position inspection; note timing measurements; 14-bit CC pair detection; RPN/NRPN tracking; MPE-like activity inspection; optional SysEx capture; device connection logging; controlled Note/CC/Program/Pitch output; channel/all-channel panic; deterministic loopback comparison; browser/MIDI round-trip latency measurements; local baselines; imported-report comparison; and JSON/CSV/print exports.

MIDItest reports measured observations. It does not turn one browser session into a definitive repair diagnosis.

## Interface

The modern workspace is organized into:

- Quick Test
- Monitor
- Controls
- Keyboard
- Timing
- Output
- Mapping
- Report

The full GUI contract is in `docs/specs/2026-10-06-modern-gui-spec.md`. Functional clarifications and acceptance criteria are in `docs/specs/2026-10-06-complete-functional-spec.md`.

## Browser support

Hardware access requires Web MIDI, user permission and a secure context. Current Chromium-based browsers are the primary target. The page remains usable as documentation if Web MIDI is unavailable.

Normal access is requested without SysEx. SysEx is a separate explicit permission action.

## Privacy

MIDI events, device names, mappings, baselines and diagnostic data remain in the browser. MIDItest has no MIDI telemetry backend.

## Related Circuit Drift Labs tools

- TrackStats: https://djshellshoxxx.github.io/trackstats/
- Transposition Calculator: https://djshellshoxxx.github.io/TranspositionCalc/
- LoudnessBatch: https://djshellshoxxx.github.io/loudnessbatch/

Experiments:

- Binaural Web Beats: https://djshellshoxxx.github.io/binerualwebeats/
- BabbleForge: https://djshellshoxxx.github.io/babbleforge/

## Windows desktop app

A Windows build (installer and portable `.exe`) is published on the [Releases page](https://github.com/djshellshoxxx/Miditest/releases). It packages the same static app in Electron, serves it from a secure local `app://` origin so Web MIDI works offline, and grants only MIDI, SysEx and clipboard permissions. External links open in your normal browser.

The beta builds are not code-signed, so Windows SmartScreen may warn on first launch (More info → Run anyway).

## Development

The app is static HTML/CSS/JavaScript; `midi-core.js` holds the pure analysis functions and `app-v2.js` the UI.

```bash
npm install                          # dev tooling: Playwright, Electron, electron-builder
npm test                             # core unit tests, static UI contract, module parse checks
npx playwright install chromium      # once, for browser tests
npm run test:browser                 # headless Chromium with a mock Web MIDI device
npm start                            # run the desktop app locally
npm run dist:win                     # build Windows installer + portable exe into dist/ (run on Windows)
```

GitHub Actions runs all tests on pull requests and on `main`. GitHub Pages deploys only from `main` after the tests pass. Pushing a tag starting with `v` builds the Windows exe on a Windows runner and publishes it as a GitHub release (`.github/workflows/release.yml`).

## Specifications

Primary design/specification sources:

- `docs/superpowers/specs/2026-10-01-miditest-design.md`
- `docs/specs/2026-10-06-modern-gui-spec.md`
- `docs/specs/2026-10-06-complete-functional-spec.md`
- `docs/superpowers/plans/2026-10-01-miditest-implementation.md`
