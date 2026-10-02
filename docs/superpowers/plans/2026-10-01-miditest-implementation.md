# MIDItest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship a static GitHub Pages MIDI diagnostics bench with live monitoring, guided controller testing, control/key diagnostics, traffic statistics, output tools and exportable reports.

**Architecture:** `midi-core.js` contains pure MIDI decode/statistics helpers. `app.js` owns Web MIDI permission, port binding, event capture, diagnostic state, output/panic actions and report persistence. `index.html`/`styles.css` present a dark Circuit Drift Labs diagnostic UI.

**Tech Stack:** HTML, CSS, ES modules, Web MIDI API, localStorage, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-10-01-miditest-design.md`

## Global Constraints
- No MIDI events or device diagnostics leave the browser.
- Gracefully handle unavailable Web MIDI and denied permission.
- Report observed behavior, not definitive hardware failure diagnoses.
- SysEx remains opt-in.
- Existing Pages workflow remains intact.

## Review Focus
- Note On velocity 0 must decode as Note Off.
- 14-bit pitch bend must center correctly around zero.
- CC profiling must tolerate controls that never reach 0/127.
- Device disconnect/reconnect must not crash the monitor.
- Panic/output commands must be channel-safe.

---

### Task 1: MIDI core
Create `midi-core.js` and tests for decoding, note names, pitch bend, control statistics, clock BPM and report summaries.

### Task 2: Web MIDI session
Create editor shell and implement permission, input/output selection, connection logging, event capture, message filters and traffic rates.

### Task 3: Diagnostics
Implement keybed, CC range/noise profiling, pitch bend, channels, message statistics, guided test, MIDI learn and mapping labels.

### Task 4: Output/report
Implement Note/CC output, panic, JSON report export, local baseline persistence, related Circuit Drift Labs links and README.

### Task 5: Verification
Run pure-core tests and syntax checks; verify unsupported-browser state and static Pages compatibility.
