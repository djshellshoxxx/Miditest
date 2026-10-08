# Advanced Diagnostic Tests and Windows Log Analysis — Specification

Status: implemented in `midi-tests.js`, `midi-winlog.js`, `winscan.ps1`, `desktop/winscan.cjs`, `desktop/preload.cjs`. Verified by `tests/tests.test.mjs` and `tests/browser.test.mjs`.

## 1. Research summary (what the tests are built on)

**MIDI 1.0 wire protocol.** Status bytes have bit 7 set (0x80–0xFF); data bytes are 0–127. Channel messages: 8n Note Off (3 bytes, release velocity), 9n Note On (velocity 0 means Note Off), An poly pressure, Bn control change, Cn program (2 bytes), Dn channel pressure (2 bytes), En pitch bend (14-bit, center 8192). System: F0…F7 SysEx, F1 MTC quarter frame, F2 song position, F3 song select, F6 tune request, F8 clock (24 per quarter note), FA/FB/FC transport, FE Active Sensing, FF reset. F4, F5, F9, FD are undefined. Realtime bytes may interleave inside other messages. Running status (omitting a repeated status byte) exists only on the 5-pin DIN wire and is resolved by the OS before Web MIDI sees data.
**Timing limits.** DIN is 31.25 kbaud, 10 bits per byte, so a 3-byte message takes about 0.96 ms → at most ~1040 messages/s; USB-MIDI packs 4-byte event packets at USB-frame rate (1 ms full-speed) and does not have the DIN limit. Active Sensing: a sender that uses it must transmit FE at least every 300 ms; receivers time out after about 330 ms.
**Controller conventions.** CC 0–31 are MSBs, 32–63 their LSBs (14-bit pairs); CC 64 sustain (≥64 = on); CC 120–127 are channel-mode messages (all sound off, reset controllers, local control, all notes off, omni, poly); CC 98–101 + 6/38 + 96/97 are NRPN/RPN. Relative encoders use two's complement (1 = +1, 127 = −1), binary offset (64 = 0), or sign-magnitude (65 = −1). MPE puts one note per channel with per-channel bend, pressure and CC74.
**Typical hardware failure modes.** Key/pad matrices: contact bounce (fast retrigger, short notes), dead or sticky contacts (missing keys, wrong velocity), limited rollover/ghosting. Potentiometers/faders: dirty tracks cause jitter, backslides and dead zones; low-resolution ADCs cause coarse steps and skipped values. Encoders: contact wear gives direction glitches. Pitch wheels: weak springs or dirty pots give poor center return and offset. Pedals: inverted polarity (detected at power-up), stuck or bouncing switches. Links: USB power management, unpowered hubs, bad cables, driver stalls cause dropouts, missing clock ticks and lost messages.
**Web MIDI limits.** Web MIDI hands over parsed messages with timestamps; malformed bytes may be dropped by the OS, and browser timestamps are as accurate as the driver provides. Tests therefore report observations and triage hints, never repair verdicts.

## 2. Result vocabulary (shown in every card)

| Status | Meaning |
| --- | --- |
| Not enough data | The test needs more of the described action; nothing is concluded. |
| Info | A measurement without a pass/fail judgement (for example rollover when no key count was supplied). |
| No concern observed | Measurements are within the typical range. This is **not** a guarantee the hardware is healthy. |
| Attention | A mild or isolated anomaly; repeat the test to see whether it recurs. |
| Investigate | A repeatable or protocol-level anomaly worth physical inspection or a driver/link check. |

Each card shows: status chip, headline, metrics, per-item detail rows, **What this result means** (text chosen by status), and a collapsible *How to run · how it works · limits* section. Attention/Investigate cards are also copied into Quick Test findings and the JSON/print report (`advancedTests`).

## 3. The ten tests

For each test: Purpose · Applies to · Procedure · Algorithm · Thresholds · Interpretation.

### T1 Protocol conformance audit (`protocolAudit`)
Purpose: detect malformed or unusual MIDI. Applies to any device. Procedure: operate the controller normally. Algorithm: check status/length (expectedLength), data bytes ≤127, undefined statuses (F4/F5/F9/FD), stray F7, SysEx terminated by F7; count true Note Off vs Note-On-velocity-0, release velocity, CC120–127, FF, F6. Thresholds: any malformed item → Investigate; channel-mode/reset/tune request → Attention. Interpretation: malformed data indicates firmware, cable/interface or driver faults; channel-mode messages indicate a panic/reset action or driver utility.

### T2 Link health (`linkHealth`)
Purpose: find dropouts in the connection. Applies to devices sending Active Sensing or MIDI clock. Procedure: leave connected, idle 30 s, or run the clock for ≥25 ticks. Algorithm: FE intervals >330 ms are late; clock gaps ≥1.5× the median interval are missed ticks (stalls ≥3×), ignoring gaps across Start/Stop/Continue and gaps ≥2 s. Thresholds: any late FE or ≥3 missed ticks → Investigate; 1–2 missed → Attention. Interpretation: USB congestion, selective suspend, bad cable/hub or a hung driver.

### T3 Key/pad double-trigger and chatter (`doubleTriggers`)
Purpose: contact bounce on keys and pads. Applies to keyboards, pads, drum triggers. Procedure: single deliberate presses at medium force, then light slow presses. Algorithm: Note Off→Note On of the same channel/key within 25 ms is a retrigger; notes shorter than 10 ms are counted; per-key tallies list the worst five keys; low-velocity (<20) retriggers are highlighted. Thresholds: ≥3 events → Investigate, 1–2 → Attention, needs ≥10 Note Ons. Interpretation: worn contacts, dirty sensors, failing switches; confirm the flagged keys by repeating.

### T4 Velocity response and consistency (`velocityResponse`)
Purpose: reachable range, evenness across keys, repeatability. Procedure: soft, hard, then repeated identical strikes on several keys. Algorithm: floor/ceiling, 8-bin usage, distinct values; repeatability = median per-key σ (keys with ≥5 samples); outlier keys = mean differs ≥20 from the median key mean (≥3 samples each, ≥4 keys). Thresholds: ≥2 outliers, σ>15, or ≥30 samples that never reach 120 using ≤3 bins → Attention. Interpretation: inconsistent sensors, worn rubber domes, aggressive velocity curve settings.

### T5 Rollover / polyphony capacity (`polyphonyCapacity`)
Purpose: detect limited key rollover or matrix blocking. Procedure: enter the number of keys to hold, hold that many, release. Algorithm: replay Note On/Off, track the maximum simultaneous held notes. Thresholds: shortfall → Attention; without an expected count → Info. Interpretation: compare with the manufacturer rollover specification.

### T6 Sweep linearity and monotonicity (`sweepQuality`, per control)
Purpose: quality of faders/knobs/wheels/expression pedals. Procedure: one smooth end-to-end sweep at constant speed per control (reset the capture first). Algorithm: backslide = up/down/up (or mirrored) pattern with a ≤3 reversal; coarse step = |Δ|≥3 with ≥40 ms since the previous value; longest monotonic run (span ≥30, ≥6 steps) is fitted by least squares for R² and maximum deviation (% of span). Thresholds: ≥2 backslides or ≥2 coarse steps → Attention. Interpretation: noisy track, loose wiper, low-resolution ADC; low R² alone is not a fault (hand speed, log tapers).

### T7 Relative encoder integrity (`encoderAnalysis`)
Purpose: detect direction glitches in endless encoders. Procedure: 10 clicks CW, 10 CCW, slow then fast. Algorithm: detect encoding from value frequencies; decode to signed ticks; glitch = a single ±1 tick opposite to equal-direction neighbours; report CW, CCW, net, accelerated events. Thresholds: ≥2 glitches and >2 % of events → Attention; ≥8 events required. Interpretation: dirty/worn contacts; Net ≈ 0 for balanced turns.

### T8 Pitch-bend spring return (`pitchReturn`)
Purpose: spring/center health. Procedure: push to an extreme, release completely, ≥5 times both directions. Algorithm: an excursion starts at |value| ≥4096; it is settled when a later sample is within ±512; return time = settle time − last extreme time; overshoot = largest opposite-sign value within 2 samples after settling. Thresholds: any unsettled excursion → Investigate; overshoot >1024 → Attention; single excursion → Info. Interpretation: sticking wheel, weak spring, offset center.

### T9 Sustain pedal polarity and range (`pedalPolarity`)
Purpose: polarity inversion, stuck switch, bounce, range. Procedure: released → press fully → release fully; ×3. Algorithm: final value ≥64 after use means inverted or stuck; full travel is min ≤5 and max ≥122; bounce = flips <40 ms; distinct values >3 indicates half-damper capability. Thresholds: final ≥64 or any bounce → Attention. Interpretation: restart the keyboard with the pedal released (polarity is learned at power-up) or replace a failing switch.

### T10 Loopback burst / throughput (`burstAnalysis`; active)
Purpose: message loss, duplication, reordering under load. Requires OUT looped to IN. Procedure: set messages per stage (20–500) and run. Algorithm: four stages (50/s, 250/s, 1000/s, instant) of pitch-bend messages whose 14-bit value is a unique sequence number, scheduled with Web MIDI timestamps; per stage count lost/duplicate/out-of-order and median latency; a center pitch bend is sent at the end. Thresholds: any problem at ≤250/s → Investigate; only at higher rates → Attention. Interpretation: loss at 1000/s or in the instant burst is expected on DIN; on USB it indicates driver/hub/buffer trouble.

## 4. Windows MIDI/USB failure research

**Failure categories.** (1) Enumeration failures: "device not recognised", Code 43, descriptor/set-address/port-reset failures from the USB hub/controller stack (bad cable, unpowered hub, selective suspend, overcurrent). (2) Driver problems: usbaudio.sys class driver or vendor driver missing/unsigned/blocked (Codes 10, 28, 31, 37, 39, 48, 52); Kernel-PnP event 219 "driver failed to load"; Kernel-PnP 411 "problem starting"; UserPnp 20001/20003 install failures; UMDF user-mode driver faults. (3) Service problems: Windows Audio (Audiosrv), Audio Endpoint Builder, Plug and Play and the Windows MIDI service stopped or crashing (SCM events 7000/7001/7009/7011/7023/7024/7031/7034). (4) Power: USB selective suspend dropping idle devices; DRIVER_POWER_STATE_FAILURE (0x9F). (5) System-level: bug checks (BUGCODE_USB_DRIVER 0xFE, DPC_WATCHDOG 0x133, 0xD1), Kernel-Power 41, WHEA hardware errors. (6) Application crashes in winmm.dll, wdmaud.drv, midimap.dll, ksuser.dll, usbaudio*.sys, mmdevapi.dll recorded by Application Error 1000 / Hang 1002 / WER.

**Sources read by `winscan.ps1` (read-only).** Event logs: System, Application, Microsoft-Windows-Kernel-PnP/Configuration, Microsoft-Windows-DriverFrameworks-UserMode/Operational (levels Critical/Error/Warning, filtered to MIDI/USB/audio relevant providers and text); Win32_PnPEntity (Device Manager error codes) and Win32_PnPSignedDriver (driver version/date/provider/signed); services Audiosrv, AudioEndpointBuilder, PlugPlay, MidiSrv; USB selective-suspend power setting (powercfg); `C:\Windows\INF\setupapi.dev.log` (tail, MIDI/USB/audio sections and exit status); Windows Error Reporting archives (MIDI-stack faulting modules); minidump file list. Administrator rights are not required, but some logs may be unreadable without them; unreadable sources are reported, not hidden.

**Interpretation (`midi-winlog.js`).** Each event is matched against rules (provider + ID + text) and returned with a title, a plain-English *what it means*, and a *what to do*. Device Manager codes, SetupAPI exit codes and bug-check codes have lookup tables. Unrecognised MIDI/USB-related errors are still shown as "Unclassified" with a search hint. Events inside the current test window (since the guided test started, loopback/burst began or session was cleared, with a 5 s margin) are tagged **during this test**, and events naming the selected input/output are tagged **mentions your device**. High-severity items are copied into Quick Test findings and the report (`windowsLogs`).

**Where it runs.** Windows desktop app: Scan button plus automatic scans (max one per 60 s) after the guided test ends, loopback, burst test and a MIDI disconnect. Browser: Copy PowerShell scan → run on the PC → import `miditest-windows-scan.json`; any `setupapi.dev.log`, `Report.wer` or generic text log can also be imported and explained. `.evtx` is binary and is not parsed directly.

**Security.** The renderer can only call `miditestDesktop.scanWindows(days)`; the main process validates the sender origin, clamps days to 1–30 and runs only the bundled script with fixed arguments. Nothing is written except a temp script file that is deleted afterwards; no data leaves the machine.

## 5. Out of scope
MIDI 2.0/UMP conformance, per-driver vendor logs, kernel dump analysis, and automatic repair actions.
