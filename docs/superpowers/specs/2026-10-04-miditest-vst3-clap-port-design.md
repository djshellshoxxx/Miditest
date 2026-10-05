# MIDItest VST3/CLAP Port Design Specification

Date: 2026-10-04
Repository: `djshellshoxxx/Miditest`
Branch: `port/vst3-clap`
Brand: Circuit Drift Labs

## Purpose

Port MIDItest from its current browser-only Web MIDI implementation into a native DAW plugin while preserving the existing browser application.

The plugin is a MIDI diagnostic utility with transparent stereo audio passthrough. Its primary purpose is to inspect, measure, visualize, and report the MIDI data a DAW routes through the plugin without modifying the audio signal and without altering MIDI unless a future explicit transformation feature is enabled.

The first native release must build as both VST3 and CLAP from the same codebase.

## Core user outcome

A user should be able to insert MIDItest on a DAW track, route a controller or MIDI source through it, hear audio unchanged, and inspect exactly what MIDI is being sent. The plugin should expose the same core diagnostic capabilities as the browser version while adapting the workflow to plugin-host constraints.

Success means the plugin can be used as an always-available MIDI troubleshooting bench directly inside a DAW.

## Scope

### Included in the first plugin milestone

- VST3 target
- CLAP target
- transparent stereo audio passthrough
- MIDI input monitoring
- MIDI passthrough
- decoded MIDI event display
- raw hexadecimal and decimal MIDI display
- note activity and held-note tracking
- CC inventory and diagnostics
- control range measurement
- jitter measurement
- sudden-jump detection
- direction-reversal measurement
- likely encoder-mode classification
- pitch-bend range and center-return diagnostics
- aftertouch observation
- program-change observation
- per-channel activity
- message-rate statistics
- MIDI clock measurement and BPM derivation
- Start / Stop / Continue observation
- MIDI Learn
- mapping worksheet
- session reset / clear
- bounded capture history
- JSON diagnostic report export
- resizable GUI
- Circuit Drift Labs styling
- unit tests for native diagnostic logic
- CI builds for supported plugin targets

### Explicitly deferred from the first milestone

- direct hardware MIDI device enumeration from inside the plugin
- opening operating-system MIDI devices independently of the DAW host
- SysEx hardware permission flows
- standalone application target
- active MIDI filtering or transformation
- MIDI generation beyond host-safe test utilities
- audio analysis or audio processing
- cloud services
- telemetry

These may be added later as isolated modules.

## Framework and build system

Use JUCE with CMake as the primary native framework.

Use `clap-juce-extensions` for CLAP integration rather than maintaining a separate hand-written CLAP implementation.

The VST3 and CLAP formats must share:

- processor implementation
- diagnostic engine
- UI implementation
- session/report model
- testable MIDI decoding logic

Format-specific glue should be minimized.

## Repository layout

The browser application remains at the repository root and continues to deploy independently.

Add a new native plugin subtree:

```text
plugin/
  CMakeLists.txt
  cmake/
  src/
    PluginProcessor.h
    PluginProcessor.cpp
    PluginEditor.h
    PluginEditor.cpp
    core/
      MidiMessageDecoder.h
      MidiMessageDecoder.cpp
      DiagnosticEngine.h
      DiagnosticEngine.cpp
      ControlAnalyzer.h
      ControlAnalyzer.cpp
      PitchAnalyzer.h
      PitchAnalyzer.cpp
      ClockAnalyzer.h
      ClockAnalyzer.cpp
      SessionModel.h
      SessionModel.cpp
      ReportBuilder.h
      ReportBuilder.cpp
    ui/
      MainView.h
      MainView.cpp
      MonitorView.h
      MonitorView.cpp
      ControlsView.h
      ControlsView.cpp
      KeyboardView.h
      KeyboardView.cpp
      TimingView.h
      TimingView.cpp
      MappingView.h
      MappingView.cpp
      ReportView.h
      ReportView.cpp
  tests/
    CMakeLists.txt
    test_decoder.cpp
    test_controls.cpp
    test_pitch.cpp
    test_clock.cpp
    test_session.cpp
```

Exact filenames may change during implementation if a cleaner decomposition emerges, but the architectural separation between host processing, analysis, UI, and report generation must remain.

## Plugin identity

Product name: `MIDItest`

Vendor: `Circuit Drift Labs`

Primary targets:

- `MIDItest.vst3`
- `MIDItest.clap`

The plugin must use stable plugin identifiers from the first public build onward.

## Audio behavior

The plugin is an effect-style utility with transparent audio passthrough.

Required behavior:

1. Accept stereo input where the host provides it.
2. Produce matching stereo output.
3. Copy or preserve samples unchanged.
4. Introduce no intentional gain, filtering, latency, panning, dynamics, or coloration.
5. Report zero processing latency unless a future feature requires otherwise.
6. Never block the audio thread for UI or file operations.

Mono and other host bus layouts may be supported where straightforward, but stereo is the required baseline.

The plugin must not depend on audio being present to analyze MIDI.

## MIDI behavior

Incoming host MIDI is both observed and passed through.

Default behavior:

- preserve message content
- preserve event ordering
- preserve sample offsets/timing as provided by the host
- do not filter messages
- do not remap channels
- do not quantize
- do not inject controller data

Analysis must operate on a copy or immutable interpretation of the incoming event stream.

The diagnostic engine must not mutate the host's MIDI stream.

## Real-time safety

The audio/MIDI processing callback is real-time critical.

Forbidden on the real-time thread:

- file I/O
- JSON serialization
- heap-heavy unbounded allocation
- mutex waits that can block
- GUI updates
- logging to disk
- network access
- report generation
- large sorting operations

Use fixed-capacity or otherwise bounded structures for event transfer from the processor to the UI/analysis layer.

Preferred architecture:

```text
Host processBlock()
    |
    +--> audio passthrough
    |
    +--> MIDI passthrough
    |
    +--> lightweight event normalization
              |
              v
       bounded lock-free queue
              |
              v
        analysis/session layer
              |
              v
             UI
```

If complete analysis is cheap enough for selected metrics, small constant-time counters may be updated directly in the process callback using atomics. More complex calculations should occur off the audio thread.

## Event model

Normalize observed MIDI into an internal event structure with fields comparable to the browser implementation.

Minimum fields:

- host timestamp or relative session timestamp
- sample offset
- status byte
- channel where applicable
- message type
- data byte 1
- data byte 2
- decoded numeric value
- note or CC number where applicable
- decoded label
- raw bytes

The native decoder should intentionally mirror the behavior of `midi-core.js` where the browser logic is already correct.

## Message support

First milestone must decode at least:

- Note On
- Note Off
- Note On velocity zero as Note Off
- Polyphonic Aftertouch
- Control Change
- Program Change
- Channel Aftertouch
- Pitch Bend
- MIDI Clock
- Start
- Continue
- Stop
- Active Sense
- System Reset

Where the host supplies additional supported MIDI system messages, the decoder may display them as generic system events rather than discarding them.

## Session model

A plugin session stores diagnostic state while the plugin instance remains loaded.

Track at minimum:

- session start time
- total event count
- event counts by type
- channels used
- currently held notes
- note-on/off state
- observed controls
- CC history summaries
- pitch-bend history summaries
- clock timestamps and rolling BPM
- message rate
- peak message rate
- user mappings
- diagnostic findings

The full event log must be bounded.

Recommended default retained event count: 5,000 events.

When capacity is exceeded, discard the oldest retained display event while continuing aggregate statistics.

## Control diagnostics

For each observed CC track:

- event count
- observed minimum
- observed maximum
- range
- unique-value count
- recent values
- event rate
- jitter estimate
- sudden jumps
- direction reversals
- likely encoder type

The initial native implementation should match the current browser heuristics before introducing more sophisticated algorithms.

Classifications should remain descriptive rather than asserting hardware failure.

Examples:

- `Full range observed`
- `Limited range observed`
- `High jitter observed`
- `Sudden jumps observed`
- `Likely relative encoder`
- `Absolute 0-127`
- `Unknown / mixed`

## Pitch-bend diagnostics

Track:

- event count
- minimum observed value
- maximum observed value
- near-center samples
- estimated resting center
- center spread
- return-to-center consistency

Pitch bend is interpreted as signed 14-bit data centered around zero.

## MIDI clock diagnostics

Track MIDI clock intervals and derive BPM from 24 pulses per quarter note.

Display:

- current rolling BPM
- recent interval stability
- clock message rate
- Start
- Stop
- Continue

Clock analysis must tolerate short outlier intervals and insufficient-data states.

## MIDI Learn

A learn mode waits for the next meaningful user-generated control event and exposes:

- channel
- message type
- CC or note number
- current value
- observed min/max where known

Clock, Active Sense, and other high-frequency system traffic should not automatically satisfy MIDI Learn unless the user explicitly chooses to learn those message classes.

## Mapping worksheet

Allow users to label detected controls.

Example:

```text
CC21  Channel 1  Knob 1  Filter Cutoff
CC22  Channel 1  Knob 2  Resonance
```

Mappings should be stored in plugin state so DAW session save/restore preserves them.

## Plugin state persistence

Use JUCE plugin state serialization for DAW project persistence.

Persist:

- user mappings
- GUI preferences
- selected filters
- diagnostic settings
- capture-limit settings where configurable

Do not persist the entire high-volume live event history by default.

Aggregate session summaries may be persisted only if the size remains bounded and host-safe.

## Report export

Export diagnostic reports as JSON from the GUI thread or a worker thread.

Minimum report fields:

- MIDItest version
- plugin format where discoverable
- session duration
- event count
- channels observed
- message counts
- controls and control statistics
- pitch-bend statistics
- clock statistics
- held/stuck-note candidates
- user mappings
- findings

The report must not claim definitive hardware failure.

Use language such as:

- `limited range observed`
- `high jitter observed`
- `unexpected repeated events observed`
- `return-to-center spread observed`

## GUI design

The plugin UI should visually correspond to the current Circuit Drift Labs style without copying the browser page mechanically.

Visual direction:

- near-black background
- dark navy panels
- charcoal/slate separators
- off-white primary text
- muted gray secondary text
- restrained blue accents
- flat 2D controls
- no glossy or faux-3D treatment

The editor must be resizable.

Suggested default size: approximately 1000 x 700 pixels.

Reasonable minimum size: approximately 720 x 480 pixels.

## Primary plugin views

### Monitor

Display recent MIDI events with:

- timestamp
- channel
- decoded type
- note/CC identifier
- value
- raw bytes

Controls:

- pause display
- clear retained events
- message-type filter
- channel filter
- search
- autoscroll

Pausing the visual display must not stop aggregate diagnostics unless the user explicitly pauses the session.

### Controls

Show detected CC controls and statistics.

For a selected control show:

- current value
- min/max
- range
- event count
- jitter
- jump count
- reversal count
- encoder classification
- recent value graph

### Keyboard

Display:

- currently held notes
- observed note range
- Note On count
- Note Off count
- note mismatch / stuck-note candidates
- velocity observations where available

### Timing

Display:

- messages per second
- peak message rate
- MIDI clock status
- measured BPM
- Start/Stop/Continue activity

### Mapping

Display learned controls and user labels.

### Report

Display a compact diagnostic summary and provide JSON export.

## Thread communication

The GUI must never read mutable audio-thread containers unsafely.

Use one or more of:

- lock-free FIFO
- atomics for scalar counters
- immutable snapshots
- message-thread copies of bounded data

Avoid a single coarse mutex shared between `processBlock()` and paint/update routines.

## Browser/native parity

The native port is not required to duplicate browser-specific device-management features.

It should preserve behavioral parity for reusable diagnostic algorithms.

At minimum, create matching test vectors for:

- note-name conversion
- Note On
- Note Off
- velocity-zero Note On
- CC decoding
- program change
- channel aftertouch
- poly aftertouch
- pitch-bend conversion
- clock decoding
- CC range metrics
- jitter metrics
- jump detection
- reversal detection
- encoder classification
- pitch center statistics
- BPM calculation
- message rate

Where native and browser results intentionally differ, document the reason.

## Testing strategy

### Unit tests

Native tests must cover:

- MIDI decoder
- value conversion
- control statistics
- pitch statistics
- encoder classification
- clock BPM
- message-rate calculations
- held-note tracking
- session reset
- event-history capacity
- report serialization

### Processor tests

Test that:

- audio samples remain unchanged
- MIDI messages remain unchanged
- event order remains unchanged
- sample positions remain unchanged
- diagnostic observation does not alter the host buffer
- clearing UI history does not corrupt processing

### Host validation

At minimum validate manually or through available tooling in representative hosts when builds are available.

Priority hosts:

- REAPER
- FL Studio

Additional host testing may include Ableton Live, Bitwig, Cubase, Studio One, or other hosts where available.

### Plugin validation tools

Where available, run format-appropriate validation tools and fail CI on obvious plugin-load or metadata problems.

## CI

Add native build workflows separate from the existing GitHub Pages workflow.

Initial CI priority:

1. Windows VST3
2. Windows CLAP
3. native unit tests

The build system should be structured so macOS and Linux builders can be added without changing the diagnostic core.

Do not make the browser deployment depend on native plugin compilation.

## Versioning

The first native development milestone may use a pre-release identifier such as:

`0.1.0-alpha.1`

Browser and plugin versions may advance independently, but reports must clearly identify the native plugin version.

## Privacy

The plugin operates locally.

Do not send:

- MIDI events
- device-derived mappings
- reports
- DAW project metadata
- host information

to any remote service.

No telemetry is required for the initial plugin.

## Failure handling

If analysis cannot keep up with incoming traffic:

- audio and MIDI passthrough take priority
- the real-time thread must never wait for the analyzer
- excess diagnostic display events may be dropped
- expose a dropped-analysis-event counter if this occurs

The plugin should make clear that dropped diagnostic display events do not imply that the host MIDI stream was dropped.

## Non-goals

The initial port is not:

- a synthesizer
- a MIDI transformer
- an audio effect
- a MIDI recorder intended to replace the DAW
- a hardware driver
- a repair-certification system
- a cloud diagnostic service

## Initial implementation sequence

1. Add CMake/JUCE native project skeleton.
2. Add shared native MIDI decoder.
3. Port core browser diagnostic algorithms with parity tests.
4. Add transparent audio and MIDI passthrough processor.
5. Add bounded event transport from processor to message thread.
6. Add session model and aggregate statistics.
7. Add basic Monitor UI.
8. Add Controls / Keyboard / Timing views.
9. Add MIDI Learn and Mapping.
10. Add report export.
11. Add state persistence.
12. Add VST3 build and validation.
13. Add CLAP build and validation.
14. Add Windows CI artifacts.
15. Perform DAW host validation.

## Acceptance criteria

The first plugin milestone is complete when:

- VST3 builds successfully on Windows.
- CLAP builds successfully on Windows.
- Both formats instantiate in at least one validated DAW host.
- Stereo audio passes through sample-for-sample unchanged under normal operation.
- Incoming MIDI passes through unchanged.
- Incoming MIDI is decoded and displayed.
- CC, pitch, note, channel, message-rate, and clock diagnostics operate.
- MIDI Learn and mapping operate.
- JSON diagnostic reports export successfully.
- Plugin project state restores user mappings/settings.
- Diagnostic history remains bounded.
- The real-time processing path performs no file I/O or report generation.
- Native unit tests pass.
- Existing browser tests and GitHub Pages deployment remain unaffected.
