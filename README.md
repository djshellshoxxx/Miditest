# MIDItest

**MIDItest by Circuit Drift Labs** is a browser-based MIDI monitor and controller diagnostic bench.

Live site: https://djshellshoxxx.github.io/Miditest/

Circuit Drift Labs: https://circuitdriftlabs.djshellshoxxx.github.io/

## What it does

MIDItest uses the Web MIDI API to inspect what connected hardware actually sends. It is intended for diagnosing controllers, keyboards, knobs, sliders, wheels, pedals, flaky connections and unexpected MIDI traffic without installing a DAW utility.

Current features include:

- live decoded + raw MIDI monitor
- device input/output selection
- message counts and messages/second
- channel activity
- automatic CC inventory
- CC range, distinct-value, jitter, jump and direction-change measurements
- simple encoder-behaviour hints
- keybed/held-note display
- pitch-bend range and near-center measurements
- incoming MIDI-clock BPM measurement
- MIDI Learn and user-labelled mapping worksheet
- output Note On/Off tests
- MIDI panic across all channels
- connection/disconnection log
- guided controller-test mode
- local baseline save/compare
- JSON diagnostic report export

MIDItest reports what it observed. It does not claim that a control is definitively defective based on one browser session.

## Browser support

Hardware access requires a browser exposing Web MIDI and explicit permission from the user. The page detects unsupported browsers and leaves the documentation/interface accessible rather than failing silently.

## Privacy

MIDI events, device names and diagnostic data remain in the browser. There is no account or remote diagnostic service.

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
```

The existing GitHub Pages workflow deploys the repository root.

## Specification

See `docs/superpowers/specs/2026-10-01-miditest-design.md` and `docs/superpowers/plans/2026-10-01-miditest-implementation.md`.
