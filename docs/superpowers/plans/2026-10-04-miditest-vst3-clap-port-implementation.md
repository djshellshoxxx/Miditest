# MIDItest VST3/CLAP Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a native MIDItest plugin that builds as VST3 and CLAP, transparently passes stereo audio and MIDI, and reproduces the browser app's core MIDI diagnostics inside a DAW.

**Architecture:** Keep the existing browser app untouched and add a separate `plugin/` subtree using JUCE + CMake with `clap-juce-extensions`. `processBlock()` performs transparent audio/MIDI passthrough plus lightweight event normalization into a bounded lock-free queue; analysis, session state, reporting, and UI run off the realtime thread.

**Tech Stack:** C++20, JUCE, CMake, clap-juce-extensions, JUCE UnitTest framework or Catch2 for native tests, GitHub Actions on Windows.

**Spec:** `docs/superpowers/specs/2026-10-04-miditest-vst3-clap-port-design.md`

## Global Constraints

- Preserve the browser app and existing GitHub Pages workflow unchanged.
- Product name: `MIDItest`; vendor: `Circuit Drift Labs`.
- Primary native outputs: `MIDItest.vst3` and `MIDItest.clap`.
- Required baseline bus layout: stereo input to stereo output; no intentional audio modification or latency.
- Incoming MIDI must pass through unchanged in content, order, channel, and sample offset.
- No file I/O, JSON serialization, GUI work, network access, blocking mutex waits, or report generation on the realtime thread.
- Default retained display-event history: 5,000 events; oldest display events are discarded after capacity while aggregates continue.
- No direct hardware MIDI enumeration, telemetry, cloud service, audio processing, or MIDI transformation in this milestone.
- Native version begins at `0.1.0-alpha.1`.
- Stable plugin identifiers must be chosen before the first public build and not changed afterward.

## Review Focus

- Dense MIDI bursts must never block or corrupt audio/MIDI passthrough; overflow should only increment a dropped-analysis-event counter.
- Hosts that provide no audio buffer but do provide MIDI must still produce diagnostics without crashing.
- Velocity-zero Note On must be interpreted as Note Off while the original MIDI message is still forwarded unchanged.
- Event-history clearing or GUI pause must not clear aggregate diagnostics unless the user explicitly resets the session.
- Project-state restore with malformed or older serialized data must fall back safely without breaking plugin instantiation.

---

### Task 1: Native project skeleton and stable plugin identity

**Files:**
- Create: `plugin/CMakeLists.txt`
- Create: `plugin/cmake/Dependencies.cmake`
- Create: `plugin/src/PluginProcessor.h`
- Create: `plugin/src/PluginProcessor.cpp`
- Create: `plugin/src/PluginEditor.h`
- Create: `plugin/src/PluginEditor.cpp`
- Create: `plugin/tests/CMakeLists.txt`
- Modify: `README.md`

**Interfaces:**
- Produces: CMake targets `MIDItest`, `MIDItestTests`, VST3 target, and CLAP target; `MidiTestAudioProcessor : public juce::AudioProcessor`.

- [ ] **Step 1: Write the failing configure/build smoke test**

Add a CI/local script target that expects CMake to configure `plugin/` and expose `MIDItestTests` plus VST3/CLAP plugin targets.

- [ ] **Step 2: Run configure and verify it fails**

Run: `cmake -S plugin -B plugin/build -DMIDITEST_BUILD_TESTS=ON`

Expected: FAIL because native project files do not yet exist.

- [ ] **Step 3: Implement the minimal JUCE/CMake project**

Use JUCE + `clap-juce-extensions`, C++20, version `0.1.0-alpha.1`, stable manufacturer/plugin codes, and a resizable editor shell. Do not add diagnostic logic yet.

- [ ] **Step 4: Run configure/build**

Run: `cmake -S plugin -B plugin/build -DMIDITEST_BUILD_TESTS=ON && cmake --build plugin/build --config Release`

Expected: native targets configure and compile.

- [ ] **Step 5: Commit**

```bash
git add plugin README.md
git commit -m "build: add MIDItest native plugin skeleton"
```

### Task 2: MIDI event decoder with browser parity vectors

**Files:**
- Create: `plugin/src/core/MidiEvent.h`
- Create: `plugin/src/core/MidiMessageDecoder.h`
- Create: `plugin/src/core/MidiMessageDecoder.cpp`
- Create: `plugin/tests/test_decoder.cpp`

**Interfaces:**
- Produces: `DecodedMidiEvent decodeMidiMessage(const juce::MidiMessage&, int sampleOffset, double sessionSeconds)` and `juce::String noteName(int midiNote)`.
- `DecodedMidiEvent` contains timestamp, sampleOffset, status, channel, message type, data1, data2, decoded value, identifier, label, and raw bytes.

- [ ] **Step 1: Write failing parity tests**

Cover note names, Note On, Note Off, velocity-zero Note On, CC, Program Change, channel/poly aftertouch, signed 14-bit pitch bend, clock, Start, Continue, Stop, Active Sense, System Reset, and generic system events.

- [ ] **Step 2: Run decoder tests and verify failure**

Run: `ctest --test-dir plugin/build -R decoder --output-on-failure`

Expected: FAIL because decoder is absent.

- [ ] **Step 3: Implement decoder**

Mirror `midi-core.js` semantics where applicable while preserving the original message separately for passthrough.

- [ ] **Step 4: Re-run decoder tests**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugin/src/core plugin/tests/test_decoder.cpp
git commit -m "feat: add native MIDI decoder parity layer"
```

### Task 3: Control, pitch, clock, and message-rate analyzers

**Files:**
- Create: `plugin/src/core/ControlAnalyzer.h`
- Create: `plugin/src/core/ControlAnalyzer.cpp`
- Create: `plugin/src/core/PitchAnalyzer.h`
- Create: `plugin/src/core/PitchAnalyzer.cpp`
- Create: `plugin/src/core/ClockAnalyzer.h`
- Create: `plugin/src/core/ClockAnalyzer.cpp`
- Create: `plugin/tests/test_controls.cpp`
- Create: `plugin/tests/test_pitch.cpp`
- Create: `plugin/tests/test_clock.cpp`

**Interfaces:**
- Produces: `ControlStats analyzeControl(std::span<const int>)`, `juce::String classifyEncoder(std::span<const int>)`, `PitchStats analyzePitch(std::span<const int>)`, `std::optional<double> calculateClockBpm(std::span<const double>)`, and `double calculateMessageRate(std::span<const double>, double windowSeconds)`.

- [ ] **Step 1: Write failing parity tests**

Pin min/max/range, unique values, jitter rounding, jump threshold behavior, reversals, encoder classification, pitch center/spread, 24-PPQN BPM, insufficient-data behavior, outlier tolerance, and message-rate windows against browser vectors.

- [ ] **Step 2: Run analyzer tests and verify failure**

Run: `ctest --test-dir plugin/build -R "controls|pitch|clock" --output-on-failure`

- [ ] **Step 3: Implement analyzer classes/functions**

Keep analysis deterministic and bounded; expensive sorting or history traversal must remain off the realtime thread.

- [ ] **Step 4: Run analyzer tests**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugin/src/core plugin/tests/test_controls.cpp plugin/tests/test_pitch.cpp plugin/tests/test_clock.cpp
git commit -m "feat: port MIDItest diagnostic analyzers"
```

### Task 4: Realtime-safe event transport and processor passthrough

**Files:**
- Create: `plugin/src/core/EventQueue.h`
- Modify: `plugin/src/PluginProcessor.h`
- Modify: `plugin/src/PluginProcessor.cpp`
- Create: `plugin/tests/test_processor.cpp`

**Interfaces:**
- Consumes: `decodeMidiMessage(...)` from Task 2.
- Produces: `bool tryPopEvent(DecodedMidiEvent&)`, `uint64_t getDroppedAnalysisEventCount() const`, and transparent `processBlock(juce::AudioBuffer<float>&, juce::MidiBuffer&)` behavior.

- [ ] **Step 1: Write failing processor tests**

Assert stereo samples are bit-identical before/after processing, MIDI bytes/order/sample positions are unchanged, MIDI-only/no-audio buffers are accepted, velocity-zero Note On is observed as Note Off without mutating passthrough, and queue overflow leaves passthrough intact while incrementing the dropped counter.

- [ ] **Step 2: Run processor tests and verify failure**

Run: `ctest --test-dir plugin/build -R processor --output-on-failure`

- [ ] **Step 3: Implement bounded lock-free event transfer**

Use a fixed-capacity SPSC FIFO or JUCE `AbstractFifo` backed by preallocated storage. `processBlock()` may normalize events and push snapshots but must never wait for the consumer.

- [ ] **Step 4: Run processor tests**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugin/src/PluginProcessor.* plugin/src/core/EventQueue.h plugin/tests/test_processor.cpp
git commit -m "feat: add realtime-safe MIDI observation passthrough"
```

### Task 5: Session model, bounded history, held notes, aggregates, and reset semantics

**Files:**
- Create: `plugin/src/core/SessionModel.h`
- Create: `plugin/src/core/SessionModel.cpp`
- Create: `plugin/src/core/DiagnosticEngine.h`
- Create: `plugin/src/core/DiagnosticEngine.cpp`
- Create: `plugin/tests/test_session.cpp`

**Interfaces:**
- Consumes: decoded events from Task 4 and analyzers from Task 3.
- Produces: immutable `SessionSnapshot getSnapshot() const`, `void ingest(const DecodedMidiEvent&)`, `void clearDisplayHistory()`, and `void resetSession()`.

- [ ] **Step 1: Write failing session tests**

Assert 5,000-event retention, oldest-event eviction, aggregate counts continuing after eviction, held-note pairing, stuck-note candidates, channel/type counts, clear-history preserving aggregates, reset clearing aggregates, and GUI-pause independence.

- [ ] **Step 2: Run session tests and verify failure**

Run: `ctest --test-dir plugin/build -R session --output-on-failure`

- [ ] **Step 3: Implement session and diagnostic engine**

Drain the processor queue on the message thread or timer callback and publish immutable snapshots for UI consumers.

- [ ] **Step 4: Run session tests**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugin/src/core/SessionModel.* plugin/src/core/DiagnosticEngine.* plugin/tests/test_session.cpp
git commit -m "feat: add bounded MIDI diagnostic session model"
```

### Task 6: Monitor, Controls, Keyboard, and Timing views

**Files:**
- Create: `plugin/src/ui/MainView.h`
- Create: `plugin/src/ui/MainView.cpp`
- Create: `plugin/src/ui/MonitorView.h`
- Create: `plugin/src/ui/MonitorView.cpp`
- Create: `plugin/src/ui/ControlsView.h`
- Create: `plugin/src/ui/ControlsView.cpp`
- Create: `plugin/src/ui/KeyboardView.h`
- Create: `plugin/src/ui/KeyboardView.cpp`
- Create: `plugin/src/ui/TimingView.h`
- Create: `plugin/src/ui/TimingView.cpp`
- Modify: `plugin/src/PluginEditor.*`

**Interfaces:**
- Consumes: `SessionSnapshot` from Task 5.
- Produces: resizable UI with Monitor, Controls, Keyboard, and Timing tabs/views.

- [ ] **Step 1: Add UI smoke tests / component-state tests**

Verify minimum size `720x480`, default near `1000x700`, snapshot rendering tolerates empty sessions, and display pause does not alter session aggregates.

- [ ] **Step 2: Run tests and verify failure**

- [ ] **Step 3: Implement Circuit Drift Labs styled views**

Monitor includes timestamp/channel/type/id/value/raw bytes plus pause, clear display, type filter, channel filter, search, and autoscroll. Controls shows CC stats and recent graph. Keyboard shows held notes/range/counts. Timing shows message rate, peak rate, clock/BPM, and transport events.

- [ ] **Step 4: Build and run UI smoke tests**

Expected: PASS and editor resizes without assertion failures.

- [ ] **Step 5: Commit**

```bash
git add plugin/src/ui plugin/src/PluginEditor.* plugin/tests
git commit -m "feat: add core MIDItest plugin diagnostic views"
```

### Task 7: MIDI Learn, mapping worksheet, and plugin-state persistence

**Files:**
- Create: `plugin/src/core/MappingModel.h`
- Create: `plugin/src/core/MappingModel.cpp`
- Create: `plugin/src/ui/MappingView.h`
- Create: `plugin/src/ui/MappingView.cpp`
- Modify: `plugin/src/PluginProcessor.*`
- Modify: `plugin/src/ui/MainView.*`
- Create: `plugin/tests/test_mapping_state.cpp`

**Interfaces:**
- Produces: `void beginLearn()`, `std::optional<LearnResult> consumeLearnResult()`, mapping CRUD keyed by message class/channel/controller identifier, and JUCE state serialization via `getStateInformation`/`setStateInformation`.

- [ ] **Step 1: Write failing learn/state tests**

Assert clock/Active Sense do not satisfy default learn mode, CC/note events do, labels persist through save/restore, GUI/filter preferences persist, malformed/older state falls back safely, and live event history is not serialized.

- [ ] **Step 2: Run tests and verify failure**

- [ ] **Step 3: Implement learn, mapping, and bounded state schema**

Use an explicit state schema/version field so future migrations can be handled intentionally.

- [ ] **Step 4: Run mapping/state tests**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugin/src/core/MappingModel.* plugin/src/ui/MappingView.* plugin/src/PluginProcessor.* plugin/src/ui/MainView.* plugin/tests/test_mapping_state.cpp
git commit -m "feat: add MIDI Learn mappings and project persistence"
```

### Task 8: Diagnostic report builder and JSON export

**Files:**
- Create: `plugin/src/core/ReportBuilder.h`
- Create: `plugin/src/core/ReportBuilder.cpp`
- Create: `plugin/src/ui/ReportView.h`
- Create: `plugin/src/ui/ReportView.cpp`
- Modify: `plugin/src/ui/MainView.*`
- Create: `plugin/tests/test_report.cpp`

**Interfaces:**
- Consumes: immutable `SessionSnapshot` and mapping state.
- Produces: `juce::var buildReport(const SessionSnapshot&, const MappingSnapshot&, const ReportMetadata&)` and GUI-thread JSON export.

- [ ] **Step 1: Write failing report tests**

Assert version, session duration, counts, channels, controls, pitch, clock, held/stuck candidates, mappings, findings, dropped-analysis-event count, and descriptive/non-definitive wording.

- [ ] **Step 2: Run report tests and verify failure**

- [ ] **Step 3: Implement report builder and Report view**

File chooser and JSON serialization must execute outside `processBlock()`.

- [ ] **Step 4: Run report tests**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugin/src/core/ReportBuilder.* plugin/src/ui/ReportView.* plugin/src/ui/MainView.* plugin/tests/test_report.cpp
git commit -m "feat: add MIDItest JSON diagnostic reports"
```

### Task 9: VST3/CLAP build validation and Windows CI artifacts

**Files:**
- Create: `.github/workflows/native-plugin.yml`
- Modify: `plugin/CMakeLists.txt`
- Modify: `plugin/cmake/Dependencies.cmake`
- Modify: `README.md`

**Interfaces:**
- Produces: Windows CI artifacts containing `.vst3` and `.clap` outputs plus native test results; browser workflow remains independent.

- [ ] **Step 1: Add CI assertions**

Workflow must configure/build Release, run native tests, verify both plugin artifacts exist, and upload them without touching the Pages job.

- [ ] **Step 2: Run local equivalent and confirm any missing target/artifact failures**

Run: `cmake -S plugin -B plugin/build -DMIDITEST_BUILD_TESTS=ON && cmake --build plugin/build --config Release && ctest --test-dir plugin/build -C Release --output-on-failure`

- [ ] **Step 3: Implement/fix CI and format-specific target wiring**

Use format-appropriate validation tools when readily available; obvious metadata/load failures should fail CI.

- [ ] **Step 4: Push and verify GitHub Actions succeeds**

Expected: native workflow green, VST3 and CLAP artifacts uploaded, existing browser workflow unaffected.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/native-plugin.yml plugin README.md
git commit -m "ci: build and test MIDItest VST3 and CLAP"
```

### Task 10: Host validation and release-readiness audit

**Files:**
- Create: `plugin/docs/HOST_VALIDATION.md`
- Modify: `README.md`
- Modify: tests/source files only for defects discovered during validation.

**Interfaces:**
- Produces: documented REAPER and FL Studio validation matrix plus final milestone verification evidence.

- [ ] **Step 1: Build clean Release artifacts**

Run the full configure/build/test command from Task 9 from a clean build directory.

- [ ] **Step 2: Validate VST3 and CLAP in REAPER**

Verify instantiation, resize, stereo transparency, MIDI passthrough/order/timing, diagnostics, Learn, mapping persistence, report export, high-rate MIDI behavior, and no-audio MIDI-only operation where routing permits.

- [ ] **Step 3: Validate available format(s) in FL Studio**

Record host/format limitations explicitly rather than changing core behavior solely to satisfy one host quirk.

- [ ] **Step 4: Run browser regression checks**

Run: `node tests/core.test.mjs`

Expected: existing browser tests PASS and Pages entry files remain unchanged unless documentation links were intentionally updated.

- [ ] **Step 5: Perform full milestone audit**

Confirm every acceptance criterion from the spec: both formats build; at least one host instantiates each available format; stereo and MIDI passthrough remain unchanged; diagnostics, Learn, mapping, report, persistence, bounded history, realtime constraints, native tests, and browser tests all pass.

- [ ] **Step 6: Commit validation documentation and any verified fixes**

```bash
git add plugin/docs/HOST_VALIDATION.md README.md plugin tests
git commit -m "test: validate MIDItest native plugin milestone"
```
