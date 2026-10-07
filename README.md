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

## Device Tests and device database

The **Device Tests** tab loads a per-device test database from `devices/` (one JSON file per device, listed in `devices/index.json`). Each entry records:
- drivers
- user and service manual availability
- known failure modes
- guided tests grouped by section

Device MIDI tests that the software can verify run automatically, by learning each control's message live, so you don't need a published CC map. Assisted tests send MIDI, run DIN loopbacks, or play/meter audio. Manual tests are checklists you mark Pass or Fail. Results are saved locally per device and export as JSON.

Initial devices:
- Native Instruments Maschine MK1
- Novation 25 SL MkII
- M-Audio Ozone
- Focusrite Scarlett 2i2
- Rane TWELVE MKII
- Pioneer DJ PLX-CRSS12
- Pioneer DJ DJM-A9

To add a device, drop a new JSON file into `devices/`, add it to `index.json`, then run `npm test` to validate it.

## Desktop build (Windows)

`npm install && npm run dist:win` builds a portable `MIDItest-<version>-portable.exe`. The Electron shell serves the app on `127.0.0.1` and grants MIDI and audio permissions. Pushing a `v*` tag makes GitHub Actions build the exe and attach it to a pre-release.

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

## Development

The app is static HTML/CSS/JavaScript.

```bash
node tests/core.test.mjs
node tests/ui-static.test.mjs
node tests/device-tests.test.mjs
node --input-type=module --check < app-v2.js
node --input-type=module --check < midi-core.js
```

GitHub Actions runs the core tests, static UI contract and module syntax checks. GitHub Pages deploys only from `main` after the test job succeeds.

## Specifications

Primary design/specification sources:

- `docs/superpowers/specs/2026-10-01-miditest-design.md`
- `docs/specs/2026-10-06-modern-gui-spec.md`
- `docs/specs/2026-10-06-complete-functional-spec.md`
- `docs/superpowers/plans/2026-10-01-miditest-implementation.md`
