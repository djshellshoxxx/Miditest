# MIDItest Native

Native MIDItest uses the same JUCE processor/editor code for:

- macOS Standalone
- Linux Standalone
- macOS CLAP
- Linux CLAP

The Standalone build receives MIDI from the MIDI input selected by JUCE's standalone device configuration and can emit output test messages through the selected output route. The CLAP build analyzes MIDI/note events delivered by the host and passes input MIDI through unchanged; output-test messages are emitted back to the host.

## Build

Requires CMake 3.22+, a C++20 compiler, and platform GUI/audio development packages.

```bash
cmake -S native -B build/native -DCMAKE_BUILD_TYPE=Release
cmake --build build/native --config Release --parallel
ctest --test-dir build/native --output-on-failure
```

Dependencies are pinned by CMake:

- JUCE 9.0.3
- free-audio/clap-juce-extensions commit `55525c9858d4b25687be7759a5e0f70eccef218e`

The CLAP adapter is used because JUCE does not provide first-party CLAP output in its current advertised plug-in format set. The adapter is maintained by the CLAP project community and is used by shipped JUCE products.

## Real-time design

The audio/process callback does not run diagnostics. It copies incoming MIDI into a bounded SPSC queue and returns. A message-thread timer drains that queue into the diagnostic model. Generated output messages use a second bounded queue.

The queue reports dropped events explicitly rather than blocking the real-time thread.

## Stress test

`miditest_native_tests` includes a one-million-event synthetic MIDI stress test. It verifies bounded history, complete event accounting, all-CC discovery, rate tracking, SysEx truncation safety, note pairing and MIDI clock calculation.

## CLAP scope

A plug-in cannot promise direct access to arbitrary MIDI hardware independently of its host. Therefore CLAP diagnostics describe the event stream supplied by the host. Device-disconnect and physical-port loopback tests belong to Standalone mode.
