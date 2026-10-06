# MIDItest Modern GUI Specification

Date: 2026-10-06
Status: implementation contract
Target: responsive browser application on GitHub Pages

## Research basis

The redesign follows current diagnostic-tool patterns visible in Windows MIDI Monitor/Troubleshooter, MIDI-OX workflows, Snoize MIDI Monitor, and contemporary MIDI 2.0 monitor concepts: device/status controls are always discoverable; high-volume message capture is table-first; filters are adjacent to capture controls; findings are presented in plain language before raw detail; raw bytes remain one click away; reports can be copied/saved; and advanced protocol inspection does not obscure the basic “is this control sending MIDI?” workflow.

## Information architecture

The application uses a persistent top application bar plus a compact session/device bar. The main workspace is divided into eight tab-like views:

1. Quick Test
2. Monitor
3. Controls
4. Keyboard
5. Timing
6. Output
7. Mapping
8. Report

Tabs change the visible workspace without destroying diagnostic state. Raw capture continues unless paused.

## Header

The top bar contains:
- Circuit Drift Labs mark and MIDItest product name
- global MIDI status indicator
- connection button
- navigation to Circuit Drift Labs
- Help button

The header must remain compact and sticky. It must not consume more than roughly 72px vertical space on desktop.

## Session/device bar

Always visible beneath the header on desktop and at top of workspace on mobile:
- input selector
- output selector
- test preset selector
- SysEx permission toggle/action
- elapsed session time
- pause/resume
- clear/reset session

Connection states use text + icon/shape, never color alone.

## Quick Test view

Primary technician workflow.

Top row:
- Start Guided Test
- guided step indicator
- current instruction
- skip/restart controls

Summary cards:
- total events
- current message rate / peak
- keys observed
- CCs observed
- channels observed
- disconnect count

Findings panel:
- highest priority observations first
- each finding includes category, measured evidence, and neutral wording
- no definitive failure claims

Inventory panel:
- notes/key range
- continuous controls
- buttons/switch-like CCs
- pitch bend
- pedals
- aftertouch
- program changes
- clock
- high resolution pairs
- parameter messages

## Monitor view

A dense diagnostic table optimized for scanning.

Toolbar:
- search
- device filter
- channel filter
- message-type filter
- decoded/raw display selector
- autoscroll toggle
- pause
- clear
- export capture CSV
- export capture JSON

Columns:
- timestamp
- device
- channel
- type
- number/name
- value
- decimal bytes
- hexadecimal bytes

Rows have stable height. Raw bytes use monospace. Keyboard focus must expose the same information.

## Controls view

Left column: detected control list with channel, CC, last value and classification.

Right diagnostic detail:
- current value
- min/max
- range coverage
- unique/skipped/repeated values
- jitter
- jumps
- direction reversals
- dead zones
- event rate
- value-over-time mini graph
- value histogram
- isolated capture button

Dedicated sub-panels summarize:
- Mod Wheel CC1
- Sustain CC64
- Expression CC11
- arbitrary selected CC
- aftertouch
- NRPN/RPN
- 14-bit CC pairs

## Keyboard view

- virtual keybed spanning expected or observed range
- expected lowest/highest note controls
- expected key count
- notes observed / never observed within expected range
- held notes and chord name
- stuck-note candidates
- duplicate Note On/Off counts
- velocity aggregate statistics
- per-key velocity table
- repeated-strike consistency
- soft-to-hard range view
- polyphonic pressure per note

## Timing view

Sections:
- MIDI clock: BPM, rolling BPM, interval, mean jitter, peak jitter, transport state, song position
- performance timing: note durations, inter-onset statistics, simultaneous-note groups
- message flood findings
- loopback: configure/start/stop, sent/received/matched/altered/missing/extra/completion
- round-trip latency: sample count/min/median/mean/max/stdev and histogram

Latency must be labeled browser/MIDI loopback round trip.

## Output view

Controlled MIDI transmit tools:
- channel selector
- Note On/Off
- CC number/value
- Program Change
- Pitch Bend
- Panic selected channel
- Panic all channels

Loopback test may use the same selected output.

## Mapping view

- most recent message / MIDI Learn summary
- copy mapping summary
- label field
- mapping table
- remove/edit rows
- export CSV
- export JSON
- printable mapping sheet

## Report view

Top:
- human-readable findings
- untested areas
- baseline comparison summary

Actions:
- save baseline locally
- import prior report
- compare baseline
- clear local data
- export JSON
- export CSV
- print report

Raw report JSON is available in a collapsible/details area, not the first thing presented.

## Help

In-app help explains:
- browser support / secure context
- MIDI permission
- SysEx opt-in
- how to run each guided step
- meaning of jitter/range/jumps/dead zones
- loopback wiring concept
- limits of browser latency measurement
- privacy/local-only behavior

## Visual system

- near-black page background
- navy/charcoal surfaces
- restrained blue accent
- off-white primary text
- muted slate secondary text
- success/warning/danger states are low-saturation and always paired with labels/icons
- 8px base spacing rhythm
- 10-12px panel radius
- 14-16px primary body size
- monospace only for protocol/raw data
- no decorative gradients except subtle surface depth
- no neon/glow/3D treatments

## Responsive behavior

Desktop >= 1100px:
- fixed tab rail or horizontal tab row
- 2-column diagnostic layouts where useful
- monitor uses full width

Tablet 700-1099px:
- horizontal scrollable tab row
- mostly single-column content
- summary cards in 3-column grid

Mobile <700px:
- one-column controls
- sticky compact connection/status row
- monitor table horizontally scrollable, never hides data permanently
- action groups wrap
- minimum touch target 44px

## Accessibility

- visible :focus-visible state
- semantic buttons/labels/table headers
- status text in aria-live region
- tabs expose role/tab semantics or equivalent accessible buttons
- no color-only states
- charts include numeric text equivalents
- reduced-motion media query disables nonessential transitions
- contrast suitable for dark UI
- keyboard-only use supported for all actions

## Performance

- bounded in-memory event history
- monitor DOM virtualization/bounding (maximum rendered rows)
- render throttling for high-frequency streams
- expensive derived analysis computed from bounded windows
- no network telemetry

## Acceptance criteria

A first-time user can connect a controller, select a device, follow the guided workflow, identify what was observed, inspect raw events, isolate a suspicious control, send safe output tests, run an optional loopback/latency test, label mappings, compare a baseline, and export/print a complete report without leaving the page or reading source documentation.
