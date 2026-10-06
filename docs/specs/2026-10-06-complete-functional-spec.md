# MIDItest Complete Functional Specification

Date: 2026-10-06
Status: normative supplement to the 2026-10-01 design specification

This supplement closes ambiguous implementation details and is additive to the original design specification.

## Event model

Each captured event stores monotonic timestamp, wall-clock ISO timestamp, device id/name, decoded kind, channel where applicable, data bytes, decimal string and hexadecimal string. Capture history is bounded. UI rendering may be more tightly bounded than report history.

## Guided test state machine

Guided Test has explicit ordered steps:
1. connection/device selection
2. key sweep
3. velocity soft/hard
4. continuous controls
5. pitch-bend travel/release
6. mod/expression
7. buttons
8. pedals
9. aftertouch if available
10. optional timing/loopback
11. review/report

The user can advance, skip, restart and end. Skipped/never-observed capabilities are reported as untested, not failed.

## Findings severity

Findings are evidence-oriented:
- info: observed capability/state
- attention: incomplete range, moderate jitter, duplicate triggers, unusual channel spread
- investigate: severe jitter, repeated disconnects, stuck notes, frequent abrupt jumps, loopback mismatch

Thresholds are heuristics and their measured values must be shown.

## Control analysis

Every CC stream records:
- count, last value
- min/max/range/coverage
- unique/skipped/repeated values
- rolling stationary jitter
- abrupt jumps
- reversals
- interior dead zones
- recent event rate
- encoder candidate
- bounded value/time samples

Control detail can be isolated into a capture window that resets metrics for that control without clearing the whole session.

## Keyboard expectations

Expected lowest/highest note and expected key count are optional. Missing keys are computed only when an expected range/count is provided or the user explicitly marks the sweep complete.

## Velocity

Aggregate and per-key statistics include count/min/max/mean/median/stdev/histogram. Repeated-strike tests use measured variation only.

## Aftertouch

Channel pressure and poly pressure streams receive the same range/jitter statistics as controls. Poly pressure is grouped by channel/note.

## Pitch bend

Track min/max, positive/negative travel, center samples, center mean, center spread and asymmetry. Repeated release sampling is user-triggered or inferred from values close to center.

## Flood detection

Detect and report high total rate, repeated identical CC streams, clock-heavy traffic and Active Sense-heavy traffic. Clock and Active Sense are not treated as faults by themselves.

## High-resolution CC

Detect MSB CC 0-31 paired with LSB CC 32-63 on same channel and expose a 14-bit value. Pairing is observational.

## RPN/NRPN

Maintain per-channel selector state for CC99/98 and CC101/100, Data Entry MSB/LSB and increment/decrement. Do not attach vendor semantics.

## MPE-like inspection

Maintain active note-to-channel relationships and summarize member-channel note activity, per-channel pitch bend, channel pressure/poly pressure and CC74. Label output as MPE-like traffic unless configured/confirmed.

## SysEx

Normal MIDI access uses sysex:false. A separate explicit action re-requests access with sysex:true. SysEx capture shows length, hex dump, repeat grouping and manufacturer ID bytes when present. No proprietary payload interpretation is attempted.

## Output

Output messages validate 7-bit/14-bit boundaries. Panic supports selected channel and all channels. Output event generation never occurs automatically except during a user-started loopback test.

## Loopback

A loopback run sends a deterministic sequence of Note, CC, Program and Pitch Bend messages with embedded sequence order. Incoming candidates are matched to transmitted bytes. Report sent/received/matched/altered/missing/extra/completion. Latency is measured from send timestamp to matching input timestamp.

## Persistence

Settings and baseline are stored locally. Report import validates shape/version before use. Clear Local Data removes MIDItest keys only.

## Exports

- capture JSON
- capture CSV
- mapping JSON
- mapping CSV
- report JSON
- report CSV summary
- printable report via browser print

## Browser support

The interface remains usable as documentation when Web MIDI is unavailable. Hardware controls are disabled until access is granted. Permission denial is recoverable with clear status text.

## Privacy

No captured MIDI-derived data is transmitted from application code. External navigation is limited to explicit user clicks on static Circuit Drift Labs links.

## Quality gates

- all core tests pass
- browser modules parse
- required DOM ids exist
- no inline event-handler JavaScript
- no missing import/export symbols
- no unbounded DOM growth
- no stale references to removed app.js
- README and specs match implementation
