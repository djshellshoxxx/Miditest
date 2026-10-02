# MIDItest Design Specification

Date: 2026-10-01
Repository: `djshellshoxxx/Miditest`
Brand: Circuit Drift Labs
Primary brand site: `https://circuitdriftlabs.djshellshoxxx.github.io`
Related tools: TrackStats, Transposition Calculator
Experiments: Binaural Web Beats, BabbleForge

## Purpose

MIDItest is a browser-based MIDI diagnostics and inspection bench for musicians, producers, technicians, and people troubleshooting MIDI controllers. It should do more than display messages: it should help identify failing keys, noisy controls, bad ranges, stuck notes, unstable pitch wheels, excessive MIDI traffic, timing issues, flaky device connections, and unknown control mappings.

The application must run entirely in the browser, be deployable on GitHub Pages, and use Web MIDI where supported.

## Circuit Drift Labs integration

MIDItest must visibly but unobtrusively identify itself as a Circuit Drift Labs tool.

Required:

- Small Circuit Drift Labs logo/mark in the header or footer.
- Direct link to `https://circuitdriftlabs.djshellshoxxx.github.io`.
- Shared dark navy, black, charcoal, gray, and restrained blue visual system.
- Related-tool links to TrackStats and Transposition Calculator.
- Separate `Experiments` section beneath the primary tools containing, in this order:
  1. Binaural Web Beats
  2. BabbleForge
- Repository README links to Circuit Drift Labs and related tools.

## Browser capability detection

Before requesting MIDI access, detect whether Web MIDI is available.

If unavailable:

- explain that the browser does not expose Web MIDI,
- avoid showing broken controls,
- provide short supported-browser guidance,
- leave help/documentation accessible.

SysEx access must be opt-in and requested separately from normal MIDI access.

## Primary modes

1. Guided Test
2. Live Monitor
3. Controls
4. Keyboard
5. Timing
6. Output Tools
7. Mapping
8. Report

## 1. Guided Controller Diagnostic

This is the main workflow.

Sequence:

1. Select MIDI input device.
2. Press every key once.
3. Move every knob through full travel.
4. Move every slider through full travel.
5. Move pitch bend fully both directions and release several times.
6. Move mod wheel/expression controls through full range.
7. Press every button.
8. Press connected pedals.
9. Optional timing/output/loopback tests.
10. Generate diagnostic report.

The workflow should automatically inventory observed controls instead of requiring users to know CC numbers in advance.

## 2. Live MIDI Monitor

Display incoming events in real time.

Required fields:

- timestamp
- device
- channel
- decoded message type
- note/control number
- note/control name where applicable
- value/velocity
- raw decimal bytes
- raw hexadecimal bytes

Supported common messages:

- Note On
- Note Off
- Polyphonic Key Pressure
- Control Change
- Program Change
- Channel Pressure
- Pitch Bend
- MIDI Clock
- Start
- Continue
- Stop
- Song Position Pointer where observable
- Active Sense
- System Reset
- SysEx when explicitly enabled and supported

Controls:

- pause/freeze
- clear
- search
- device filter
- channel filter
- message-type filter
- decoded/raw view toggle
- autoscroll toggle
- export captured events

## 3. Automatic Controller Inventory

Build an inventory from observed behavior.

Summary may include:

- notes/keys detected
- note range
- channels used
- continuous controllers detected
- likely absolute knobs/sliders
- likely relative encoders
- buttons/switches
- pitch bend
- modulation control
- sustain pedal
- other pedal CCs
- channel aftertouch
- polyphonic aftertouch
- program-change controls
- MIDI clock source activity

Describe only what was observed. Do not claim an unobserved hardware capability is absent.

## 4. Control Noise and Range Tester

Profile each continuous control.

Metrics:

- observed minimum
- observed maximum
- expected range where known
- percentage of expected range reached
- unique values
- skipped values
- repeated values
- stationary jitter
- sudden jumps
- direction reversals during otherwise monotonic movement
- dead zones
- event rate
- return-to-position repeatability where relevant

Use descriptive classifications such as:

- full range observed
- limited range observed
- low/moderate/high jitter
- sudden jumps observed
- possible dead zone

Do not declare hardware definitively failed from one measurement.

## 5. Knob / Slider Visualizer

For a selected control show:

- current value
- min/max seen
- value-over-time graph
- movement direction
- histogram of observed values
- event rate
- jitter while stationary

Allow isolated capture windows for a single movement test.

## 6. Encoder Type Detection

Attempt to classify encoder behavior from observed values.

Candidate behaviors:

- absolute 0-127
- relative binary offset
- two's complement
- sign/magnitude
- increment/decrement style
- paired high-resolution CC/MSB-LSB where detectable

When uncertain, show candidate interpretations and the observed pattern instead of forcing one result.

## 7. Keyboard / Keybed Test

Display a virtual keyboard matching the observed note range where practical.

Detect and report:

- notes observed
- notes never observed during guided sweep
- Note On without Note Off
- duplicate Note On
- duplicate Note Off
- suspicious repeated triggers
- stuck-note candidates
- note-number mismatches relative to user-defined expected mapping

Allow expected key count or expected lowest/highest note to be set when needed.

## 8. Velocity Diagnostics

Provide per-key and aggregate velocity analysis.

Metrics:

- minimum
- maximum
- average
- median
- standard deviation
- histogram/distribution
- repeated-strike consistency
- comparison between selected keys

Guided tests:

- strike one key repeatedly at similar force
- play progressively soft to hard

Do not judge performance quality; report measured variation only.

## 9. Aftertouch Diagnostics

If channel or polyphonic aftertouch is observed, show:

- live value
- min/max
- range coverage
- jitter
- release behavior
- per-note pressure activity for poly aftertouch

## 10. Pitch Bend Tester

Display pitch-bend range centered on neutral.

Metrics:

- observed minimum
- observed maximum
- resting center
- center jitter
- return-to-center consistency
- asymmetry between negative/positive travel
- dead zones

Allow repeated release tests and summarize center-return spread.

## 11. Mod Wheel / Expression / Pedal Testing

Provide dedicated diagnostics for:

- mod wheel
- expression pedal
- sustain pedal
- half-damper/continuous sustain
- arbitrary user-selected CC

For switch-type pedals, show state transitions and unexpected bounce/repeat messages.

## 12. MIDI Channel Inspector

Show activity by MIDI channel and message class.

Views:

- total event count by channel
- note count by channel
- CC count by channel
- pitch-bend activity by channel
- channel-pressure activity by channel

Useful for identifying accidental multi-channel transmission.

## 13. Message Statistics and Flood Detection

Track:

- Note On count
- Note Off count
- CC count
- pitch-bend count
- aftertouch count
- program-change count
- MIDI clock count
- Active Sense count
- SysEx count when enabled
- messages per second
- peak messages per second
- average message rate

Detect patterns such as:

- repeated identical CC spam
- excessive Active Sense traffic
- clock-heavy streams
- stuck controls generating continuous messages
- anomalous bursts

## 14. MIDI Learn Inspector

Touch one hardware control and display:

- device
- channel
- message type
- CC/note number
- current value
- min/max observed
- copyable mapping summary

Example output:

`CC74 / Channel 1 / range 0-127`

## 15. Mapping Worksheet

Allow observed controls to be labeled by the user.

Example:

- CC21 / Knob 1 / Filter Cutoff
- CC22 / Knob 2 / Resonance
- CC41 / Slider 1 / Volume

Export:

- CSV
- JSON
- printable mapping sheet

## 16. MIDI Output Tester

Where output access is available, allow controlled sending of:

- Note On
- Note Off
- CC
- Program Change
- Pitch Bend

This helps distinguish input problems from output/synth-routing problems.

## 17. MIDI Panic

Provide one-click sending of:

- All Notes Off
- All Sound Off
- Reset All Controllers

Support selected channel or all channels.

## 18. Device Connection Monitor

Track MIDI ports appearing/disappearing.

Log:

- connection timestamp
- disconnection timestamp
- device name
- repeated reconnects

Highlight unexpected disconnect/reconnect events in the diagnostic report.

## 19. MIDI Loopback Test

With MIDI OUT physically or virtually connected to MIDI IN:

- send known note/CC/pitch/program messages
- compare transmitted vs received messages
- count missing messages
- count extra messages
- count altered/corrupt messages
- calculate completion percentage

Results should state measured counts, not a vague health score.

## 20. MIDI Latency Test

With loopback configured, measure round-trip timing.

Report:

- sample count
- minimum
- median
- mean
- maximum
- standard deviation/jitter
- histogram

Clearly label this as browser-to-MIDI-loopback round-trip timing, not a DAW driver latency measurement.

## 21. MIDI Clock Analyzer

When MIDI clock is present:

- derive measured BPM
- show rolling BPM
- interval distribution
- average jitter
- peak jitter
- detect Start/Stop/Continue
- detect Song Position Pointer where available

## 22. Note Timing / Performance Measurement

Record short incoming performances and measure:

- Note On timestamps
- Note Off timestamps
- note duration
- velocity
- inter-onset intervals
- simultaneous-note groups/chords
- timing spread around repeated events

Provide measurement only, not quality judgement.

## 23. Held-Note / Chord Display

Show currently held notes and attempt straightforward chord naming where unambiguous.

This is secondary to diagnostics but useful during testing.

## 24. High-Resolution MIDI / CC Pair Inspector

Where applicable, detect and display:

- CC MSB/LSB pairs
- 14-bit controller values
- high-resolution pitch-bend values
- NRPN/RPN sequences where reliably identifiable

Show raw messages alongside interpreted values.

## 25. NRPN / RPN Inspector

Track common NRPN/RPN controller sequences and expose:

- parameter number
- data entry values
- increment/decrement messages
- channel

Do not assume vendor meaning unless the user supplies a mapping.

## 26. SysEx Inspector

Optional advanced feature requiring separate SysEx permission.

Display:

- timestamp
- byte length
- manufacturer ID where identifiable
- hex dump
- repeated-message grouping

Do not decode proprietary payload semantics unless a known mapping is explicitly supported.

## 27. MPE Inspector

When MPE-like traffic is observed, provide a view for:

- member channels
- per-note pitch bend
- per-note pressure
- per-note CC74/timbre
- active note/channel relationships

Avoid claiming full MPE conformance from passive observation alone.

## 28. Device Snapshot / Baseline Comparison

Allow a completed diagnostic report to be saved locally as a baseline.

On a later session compare:

- control ranges
- jitter levels
- pitch-wheel center
- missing keys
- reconnect events
- latency results
- message rates

This can reveal gradual hardware deterioration.

## 29. Test Presets

Provide quick test profiles such as:

- Keyboard Controller
- Pad Controller
- DJ Controller
- Foot Controller
- Hardware Synth
- Generic MIDI Device

Presets only change which tests are emphasized; they should not hide raw monitoring capability.

## 30. Diagnostic Report

Generate a clear report containing:

- device name
- test duration
- detected controls
- keybed findings
- velocity findings
- noisy/limited-range controls
- pitch-bend findings
- pedal findings
- message rates
- channel usage
- disconnect/reconnect events
- optional loopback/latency/clock results
- untested areas

Export:

- JSON
- CSV where meaningful
- printable HTML/PDF-friendly view

Reports should use findings such as `limited range observed` or `high jitter observed`, not definitive repair diagnoses.

## 31. Local Session Persistence

Store settings and optional previous reports in IndexedDB/local storage.

Support:

- clear all local data
- export a report
- import a prior MIDItest report
- compare current session with prior baseline

No backend required.

## 32. Privacy

No MIDI events, device names, mappings, or diagnostic data should leave the browser during normal use.

If generic site analytics are ever introduced, do not transmit MIDI-derived values.

## UI structure

Suggested navigation:

- Quick Test
- Monitor
- Controls
- Keyboard
- Timing
- Output
- Mapping
- Report

Suggested home screen:

1. Small Circuit Drift Labs masthead
2. Web MIDI capability/status
3. Device selector
4. `Start Guided Test` primary action
5. Live device summary
6. Recent findings
7. Related Circuit Drift Labs tools
8. Separate Experiments section
9. Footer with Circuit Drift Labs link

## Visual direction

Use the Circuit Drift Labs dark technical style:

- near-black background
- dark navy surfaces
- charcoal/slate borders
- gray secondary text
- off-white primary text
- restrained blue accents

Avoid glossy, 3D, neon-gradient, or busy AI-generated imagery.

Use the simple 2D Circuit Drift Labs mark unobtrusively at roughly 24-32 px in the interface.

## Accessibility

- keyboard-accessible controls
- visible focus states
- text equivalents for visual meters
- do not rely on color alone
- reduced-motion support
- responsive layout
- accessible live-region updates for test state where useful

## Testing

Unit tests should cover:

- MIDI message decoding
- channel decoding
- Note On velocity-zero handling
- pitch-bend conversion
- CC statistics
- jitter calculations
- sudden-jump detection
- monotonic-direction reversal detection
- dead-zone/range calculations
- velocity statistics
- note-on/off pairing
- stuck-note detection
- message-rate calculations
- clock BPM calculation
- latency statistics
- loopback comparison
- encoder interpretation heuristics
- NRPN/RPN state machine
- report serialization
- baseline comparison

Browser integration tests should cover:

- Web MIDI unavailable state
- permission denied state
- input device connection/disconnection
- input selection
- mock MIDI message streams
- report generation
- local persistence

## Deployment

Primary deployment target is GitHub Pages from `djshellshoxxx/Miditest`.

The app must work correctly from a repository subpath.

README must include:

- what MIDItest does
- browser/Web MIDI requirements
- privacy/local-processing statement
- feature overview
- development instructions
- deployment instructions
- Circuit Drift Labs link
- TrackStats link
- Transposition Calculator link
- Binaural Web Beats and BabbleForge under an `Experiments` section

## V1 scope

V1 should include:

- capability detection
- device selection
- Guided Controller Diagnostic
- Live MIDI Monitor
- Automatic Controller Inventory
- Control Noise/Range Tester
- Knob/Slider Visualizer
- Encoder Type Detection
- Keybed Test
- Velocity Diagnostics
- Aftertouch Diagnostics
- Pitch Bend Tester
- Mod/Pedal testing
- Channel Inspector
- Message Statistics/Flood Detection
- MIDI Learn
- Mapping Worksheet
- Device Connection Monitor
- Diagnostic Report
- local report persistence/export
- Circuit Drift Labs branding and links

If implementation remains straightforward, include output testing, panic, clock analysis, loopback, latency, high-resolution CC, NRPN/RPN, SysEx, and MPE in the same release; otherwise keep them as isolated next-stage modules without blocking the core diagnostic workflow.

## Success criteria

A user should be able to connect a MIDI controller, see exactly what it sends, perform a guided hardware test, identify suspicious keys or controls, document MIDI mappings, export a useful diagnostic report, and do all of this locally from a GitHub Pages application with clear Circuit Drift Labs branding and navigation.
