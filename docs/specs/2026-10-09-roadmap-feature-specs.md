# MIDItest Roadmap — Developer-Ready Feature Specs (F01–F15)

Baseline: v0.01-beta + Tests/Windows Logs tabs (`main` @ 67f7b96). Read `docs/specs/2026-10-08-advanced-tests-and-windows-logs-spec.md` first. Plan, ordering and release gates: `docs/plans/2026-10-09-implementation-plan.md`.

## Implementation status (0.2.0-beta)
Implemented: F01 (without "Observed" mode/progress bar), F02 (no 88-key list), F03 (outlier rule = robust z > 3.5), F04 (instant/real-time/4x replay; no scrub/pause/0.25-8x), F05, F06 (single series, no box plot/pan/zoom), F07, F08 v1 (decoder + environment), F09 (no SPP UI/bar-aligned start), F10 (path comparison, not full dual-device state), F11 (HTML report; no PDF/IPC, no charts), F15 (glossary + term buttons). Not started: F12, F13, F14 i18n (keyboard tab navigation done), P0-1 modularization (new code lives in features.js/lib/ instead), Electron smoke test, ESLint.

## 0. Conventions every spec assumes
- **Code layout (after P0-1):** pure logic in `lib/*.js` (no DOM, unit-testable in Node); DOM code in `ui/*.js`; `app-v2.js` only wires modules. Electron-only code in `desktop/*.cjs`, exposed through `desktop/preload.cjs` with one narrow, validated IPC channel per capability.
- **Result vocabulary:** `notrun | info | ok | attention | investigate` (see Tests spec §2). Never claim a repair diagnosis.
- **Schema:** reports/captures carry `version`. New fields are additive; `validateReport` accepts older versions. Bump `REPORT_VERSION` only when a field's meaning changes (P0-2).
- **Safety for anything that SENDS MIDI:** disabled until an output is selected; first use shows a one-time confirm dialog naming the output port; rate-limited (≤1000 msg/s); a persistent **Panic** button; never send on channel/port the user did not pick; every send is logged in the Output log; sends stop on tab hide, port disconnect, or Cancel.
- **Privacy:** no network calls, no telemetry. File import/export only via user-initiated dialogs. Imported files are untrusted: size-limited (8 MB), parsed with try/catch, rendered only via `esc()` (never innerHTML of raw text).
- **Flags:** every feature ships behind `flags.<id>` (localStorage `miditest-flags`, "Labs" panel) until its acceptance criteria pass, then defaults on.
- **Definition of Done (each feature):** acceptance criteria met; unit tests for pure logic; one browser test (mock MIDI) for the UI path; `npm test` + browser tests green in CI; docs + help text + release-notes line; spec updated if behavior changed; no new console errors; keyboard-operable; works at 420 px width.
- **Effort scale:** S ≤1 day, M 2–3 days, L 4–6 days (one developer, incl. tests).

---
## F01 Active controller tests (send + verify) — L
**Goal:** go beyond passive listening: transmit known MIDI and verify the return path or record a human observation.
**Modes:** (a) *Loopback* (OUT→IN loop, cable or virtual port): automatic verification. (b) *Echo/response* (device answers on IN): automatic. (c) *Observed*: no return path — the app sends and asks "Did the device respond? Yes/No/Not sure"; answers are stored in the report as *user-observed*, never as measured.
**Tests (new cards in Tests tab, group "Active"):**
1. *CC fidelity sweep*: send CC n = 0…127 up and down (n chosen, default 21), verify count, order, no value change; also 14-bit pair (CC n/n+32) 0…16383 in 128-step strides. Result: missing/altered/reordered counts.
2. *Note on/off pairing & stuck-note*: send N notes with matched Note Off; then Note On without Off + `All Notes Off`(CC123) + `All Sound Off`(CC120); mode (a)/(b): verify the echo contains the expected Offs; mode (c): ask user whether sound stopped.
3. *Program/Bank*: send Bank Select MSB/LSB (CC0/32) + Program Change for a list; (a)/(b) verify echo; (c) user confirms patch name.
4. *Pitch-bend & aftertouch round trip*: 14-bit values at −8192, 0, 8191 and random 20; channel/poly pressure.
5. *NRPN/RPN round trip*: CC99/98 + 6/38 sequence with `processParameterMessage` verification (reuse core tracker).
6. *Channel isolation*: send on channel k, verify nothing arrives on others (detects bad channel filtering/thru).
**UX:** "Active tests" panel: output + channel selectors, test checklist (checkboxes), Run selected / Cancel, progress bar, per-test card with the standard status chip and *What this result means* + *How to run/limits* sections. Confirm dialog on first run (safety above). Burst test (existing T10) is re-homed here.
**Files:** `lib/active-tests.js` (plan builders `buildPlan(testId, opts) -> [{bytes, delayMs, expect}]` and `evaluate(plan, received)`), `ui/active-tests.js`; reuse `send()`, `matchLoopback` pattern with a generic `expectations` queue keyed by exact bytes.
**Algorithm notes:** schedule with `output.send(bytes, performance.now()+offset)`; match received messages by exact bytes with a 500 ms timeout per step (configurable 100–5000); out-of-order = received index < previous matched index; cancellation clears pending timers and sends Panic on the chosen channel.
**Acceptance:** with the mock loopback, each test returns `ok`; injecting drop/alter/reorder in the mock yields `investigate` with correct counts; Cancel stops within 100 ms; no send occurs without output selected; unit tests for `buildPlan`/`evaluate` cover loss, duplicate, reorder, late arrival.
**Risks:** sending to real synths (mitigate via confirm + Panic + low default velocity 64, CC value ramps ≤127); virtual-port echo differences (document loopMIDI / Windows MIDI Services loopback endpoints).

## F02 Device-type checklists with pass/fail sheet — M
**Goal:** the Preset dropdown drives a defined procedure and a printable pass/fail sheet.
**Data model (`lib/checklists.js`):** `CHECKLISTS = { keyboard61: { name, version, items:[{id, title, instruction, check:(ctx)=>{status, detail}, required:boolean, manual?:boolean}] }, keyboard88, pad16, djController, footController, synth, generic }`. `ctx` = same input object as `buildTestResults` plus `expected` (low/high key, pad notes list).
**Built-in items (examples):** keyboard61 → all 61 keys seen (36–96 default C2–C7, editable); velocity floor ≤20 & ceiling ≥120; pitch bend returns; mod wheel full range; sustain polarity; no retrigger events; no protocol errors. pad16 → each of 16 pads seen (default notes 36–51, editable), velocity consistency, aftertouch if present. djController → each CC seen on expected channel, encoders balanced net≈0, no flood. foot → each switch toggles; bounce=0.
**Result:** each item `pass | fail | skipped | manual-confirm`; sheet verdict = `PASS` only if all required items pass; otherwise `REVIEW` listing failures. The wording is *"Checklist result"*, not repair diagnosis.
**UX:** new "Checklist" card at top of Quick Test: progress ring, per-item row with live status updating as data arrives, "Mark manual item OK" buttons, "Edit expected range" popover, "Print sheet" (header: technician, serial, date, device, firmware if known).
**Files:** `lib/checklists.js`, `ui/checklist.js`; sheet included as `report.checklist` (schema additive).
**Acceptance:** simulated 61-key session passes; removing one key yields `fail` with key name; changing preset changes items; printed sheet fits one A4/Letter page; unit tests per item; browser test for flow.

## F03 Device profiles & fleet baselines — M
**Goal:** named per-model profiles and batch comparison.
**Storage:** `localStorage['miditest-profiles-v1']` = `{ [id]: {id, name, model, createdAt, report} }` (cap 30, 2 MB total; oversize prompts export). Export/import `.miditest-profile.json` with `{kind:'profile', schema:1, ...}`.
**Features:** save current report as profile ("known good"); choose profile in Compare dropdown; *Fleet mode*: import ≥2 reports → table of units × metrics (keys missing, jitter per control, pitch center, latency median) with z-score flag when a unit differs from the median of the others by >3 MAD (needs ≥4 units, else raw deltas).
**Files:** `lib/profiles.js` (`diffAgainstProfile`, `fleetOutliers`), reuse `baselineDiff`; `ui/profiles.js`.
**Acceptance:** save/load/delete/export/import round trip; corrupt file shows readable error; fleet outlier unit flagged in unit test with synthetic reports; storage-full handled (message, no crash).

## F04 Session recording & replay — M (foundation for tests; do first)
**Capture format `.miditest-capture.json`:** `{kind:'capture', schema:1, app:'0.x', startedAt, device, ports:[{id,name}], events:[{t, dt?, deviceId, bytes:[...]}], notes}`; `t` ms from start. Export from Monitor ("Save capture"); events cap 200 000; gzip optional later.
**Replay:** import file → *Replay mode* banner; events fed through the same `onMidi` pipeline with `ev.data` (so every test works unchanged); controls: Play/Pause, speed 0.25–8×, "Instant (analyze now)" (default for tests), scrub bar. During replay, live ports are ignored (banner explains) and Output is disabled.
**Files:** `lib/capture.js` (`serialize(events)`, `parse(text) -> {events}|{error}`, validation: byte values 0–255, status byte first, monotonic t), `ui/replay.js`; refactor `onMidi` to `ingest(bytes, t, meta)`.
**Fixtures:** `tests/fixtures/*.capture.json` (good keyboard, bouncing keys, noisy fader, glitchy encoder, stuck pedal, burst loss). Each fixture has an `expected.json` with the required test statuses → regression suite `tests/fixtures.test.mjs`.
**Acceptance:** record→save→reload reproduces identical `buildTestResults` statuses; malformed capture is rejected with message; 100k-event replay "instant" completes <2 s; UI stays responsive (render throttle unchanged).

## F05 Windows Logs — more evidence — M
Adds to `winscan.ps1` (still read-only) and `midi-winlog.js`:
1. **USB history:** `HKLM\SYSTEM\CurrentControlSet\Enum\USB\VID_*` first/last connect times via `Get-PnpDeviceProperty` (`DEVPKEY_Device_FirstInstallDate`, `…LastArrivalDate`, `…LastRemovalDate`) for MIDI-like devices; finding "device reconnected N times in 7 days" when arrivals>5.
2. **USB tree:** controller → hub → port path (`Get-PnpDeviceProperty DEVPKEY_Device_Parent`), flags devices behind hubs and USB 1.1/2.0 vs 3.x speed (`DEVPKEY_Device_BusReportedDeviceDesc` + Win32_USBHub).
3. **Driver audit:** compare DriverVersion/Date/Provider with a bundled `drivers.json` of known class drivers (`usbaudio.sys`, `usbaudio2.sys`, Windows MIDI Services `midisrv`); flag drivers older than 3 years or unsigned.
4. **What changed:** driver installs (Kernel-PnP/UserPnp), Windows Updates (`Get-HotFix` + WindowsUpdateClient 19/20) and reboots in the 48 h before the first MIDI-related error.
5. **Windows MIDI Services detection:** service `MidiSrv` state, Windows build ≥ 26100 (24H2), presence of `Midi Service` endpoints.
**Acceptance:** scan JSON `schema` field added (v2) and old files still import; rules unit-tested with synthetic scans; script passes a PowerShell syntax check (`[System.Management.Automation.Language.Parser]::ParseFile`) in the Windows CI job; manual QA on Win10 + Win11 (P0-6).

## F06 Charts over time — M
**Charts (canvas, no libraries):** (1) control overlay (up to 6 CCs, normalized or raw, time axis, pan/zoom); (2) latency/jitter over time with 95th-percentile line; (3) velocity scatter (key vs velocity) and per-key box plot; (4) message-rate timeline with flood bands; (5) pitch-bend trace with ±512 center band and detected excursions highlighted.
**Implementation:** `ui/charts.js` with a small `Chart` class (axes, ticks, hover tooltip, legend toggle); data decimation (min/max per pixel bucket) so 100k points draw <50 ms; high-DPI scaling; colors from CSS variables; text alternative (table export "CSV of plotted data").
**Acceptance:** each chart renders from fixtures; hover shows value/time; resize redraws; PNG export (`canvas.toBlob`); `prefers-reduced-motion` respected; unit tests for decimation and axis ticks.

## F07 SysEx tools — M
1. **Identity request:** send `F0 7E <dev> 06 01 F7` (dev 7F default; selectable 00–7F). Parse reply `F0 7E <dev> 06 02 <mfr 1 or 3 bytes> <family LSB MSB> <member LSB MSB> <rev 4 bytes> F7`; lookup manufacturer in bundled `manufacturers.json` (MIDI.org list; ID 00 → 3-byte extended). Show raw hex + decoded.
2. **SysEx send/receive console:** hex input (validated: bytes 00–7F inside, F0…F7), checksum helpers (Roland 7-bit sum, simple XOR, 2's complement), "send", "send at N ms spacing" for multi-message dumps, receive log with length/manufacturer.
3. **Dump compare:** capture two dumps → byte diff view (offset, a, b) with 7-bit/8-bit unpack toggle.
**Permission:** needs `requestMIDIAccess({sysex:true})`; reuse Enable SysEx; explain prompt. **Safety:** warn that SysEx can overwrite device memory; "Send" requires the confirm dialog every session; device-ID 7F broadcast flagged; no "bulk send from file" in v1.
**Files:** `lib/sysex.js` (`buildIdentityRequest`, `parseIdentityReply`, `parseHex`, `checksums`, `diffBytes`), `data/manufacturers.json`, `ui/sysex.js`.
**Acceptance:** unit tests with known Roland/Behringer/Korg replies (1- and 3-byte IDs); invalid hex rejected; mock device replies to identity; report includes identity block.

## F08 MIDI 2.0 / UMP awareness — M (research-dependent)
**Facts (verified 2026-10):** Windows MIDI Services reached general availability on 2026-02-17 for Windows 11 24H2/25H2, makes ports multi-client and translates MIDI 2.0 ↔ 1.0; the Web MIDI API in browsers is still MIDI 1.0 byte-stream only, so UMP detail is **not** observable from a page.
**Scope v1 (honest):** (1) *Environment panel:* detect Windows build + MidiSrv (via F05 scan), show "MIDI 2.0 stack available: yes/no" and explain that the browser sees the MIDI 1.0 translation. (2) *Decode helpers:* a UMP decoder (`lib/ump.js`: 32-bit packets; MT 0 utility, 1 system, 2 MIDI1 channel voice, 3 SysEx7, 4 MIDI2 channel voice with 16-bit velocity / 32-bit CC, 5 SysEx8/data, 0xD flex data, 0xF stream) for imported UMP capture files (`.umpx`/hex text), displayed in the Monitor with resolution notes. (3) *Resolution test:* when a device is reported to emit 14-bit/32-bit values, compare MIDI-1 translation steps to expected quantization.
**Out of scope v1:** live UMP I/O (needs native Windows MIDI Services SDK — consider an Electron native addon later; spike task S1).
**Acceptance:** decoder unit tests from spec examples (MT2 note on 16-bit velocity → 7-bit scaling rule, MT4 pitch); UI clearly states what browser can't see; no false claims.

## F09 Clock generator & sync tester — M
**Generate:** start/stop/continue, BPM 30–300 (step 0.1), 24 PPQN via a Web Worker timer with `output.send(F8, timestamp)` scheduled ≥25 ms ahead (lookahead scheduler pattern; accuracy limited by OS/driver—state so), Song Position Pointer send, Start at bar boundary.
**Measure follower:** if device echoes transport/clock (or via loopback), measure latency of Start/Stop and drift over 5 min (ticks sent vs received, ppm drift).
**Tests:** jitter of generated clock as seen on loopback input (reuses `clockStats`), tempo-lock check (device-reported BPM vs set), start-latency distribution.
**Acceptance:** generated clock measured through mock loopback within ±0.5 % BPM and jitter <2 ms RMS in mock; Stop always sent on cancel/tab close/disconnect; unit tests for scheduler math with a fake clock.

## F10 Multi-device view — M
**Goal:** compare two inputs (e.g. controller vs interface) side by side.
**State change:** `state.devices: Map(portId -> deviceState)`; `ingest` routes by `ev.currentTarget.id`; per-device `events/cc/keys/...`. Selectors: Input A, Input B (optional). Tabs show A/B toggle or split view (≥1000 px) with the same cards; "Path comparison" card: messages seen on A but not B (matched by bytes within ±50 ms) = loss; B-only = injected; latency A→B.
**Depends on P0-1 (state modularization).**
**Acceptance:** two mock inputs; loss detected when B drops messages; single-device behavior unchanged (regression via existing browser tests); memory cap per device preserved (5000 events).

## F11 Shareable report (HTML/PDF) — S–M
Print-optimized report template (`ui/report-print.js`): header (customer, device, serial, technician, date; fields persisted locally), executive summary (checklist verdict, top findings), tests with the *What this means* text, Windows findings, charts as images (F06), appendix (raw metrics). Export: **Save as HTML** (single self-contained file, inline CSS, no scripts) and **Print/PDF** via the browser/Electron `webContents.printToPDF` (IPC `miditest:savePdf`). Footer: "Measured observations, not a repair diagnosis."
**Acceptance:** exported HTML opens offline, contains no `<script>`; escapes all user fields (test with `<img onerror>`); PDF ≤ 6 pages for a typical session; snapshot test of HTML structure.

## F12 macOS & Linux desktop builds + log readers — L
**Build:** add `mac` (dmg, arch x64+arm64) and `linux` (AppImage, deb) targets; CI matrix `windows-latest`, `macos-latest`, `ubuntu-latest`; artifacts named `MIDItest-<ver>-<os>-<arch>.<ext>`.
**Permissions:** to be verified on a real Mac in spike S3 whether Electron/Chromium Web MIDI needs any entitlement or usage-description key under the hardened runtime; Gatekeeper needs a Developer ID signature plus notarization for a smooth install (ties to F13).
**Log readers (read-only, same pattern as winscan):** macOS: `log show --last 7d --predicate 'subsystem == "com.apple.coremidi" OR process == "coreaudiod" OR eventMessage CONTAINS[c] "usb"'`, `system_profiler SPUSBDataType -json`, `~/Library/Logs/DiagnosticReports/*.ips` crash reports mentioning CoreMIDI; Linux: `journalctl -k --since -7d | grep -Ei 'usb|snd|midi'`, `dmesg`, `aconnect -l`, `amidi -l`, `lsusb -t`, `udevadm info`; rules for common messages ("device descriptor read/64, error -71", "usb disconnect", "snd-usb-audio … cannot get freq", "xhci_hcd … HC died").
**Design:** `desktop/scan-<platform>.cjs` returning the same normalized `{events,devices,services,…}`; renderer tab renamed **System Logs**; `midi-winlog.js` split into `lib/syslog-rules/{win,mac,linux}.js`.
**Acceptance:** each OS job builds and launches (smoke), unit tests per rules file with real sample log lines, scan degrades gracefully when commands are missing.

## F13 Code signing & auto-update — M (long lead time — start early)
**Signing:** Windows: Microsoft's Azure signing service (formerly Trusted Signing / "Artifact Signing") — eligibility at time of research: US/Canada organizations (3+ years history) or individual developers; alternatives: OV/EV certificate from a CA (hardware token or cloud HSM; SmartScreen reputation still accrues over time), or SignPath Foundation for open source. Configure `win.azureSignOptions` (or `signtoolOptions`), secrets as GitHub Actions secrets, `forceCodeSigning: true` on release builds only. Verify with `signtool verify /pa /v`.
**Auto-update:** `electron-updater` + GitHub Releases (`latest.yml` generated by electron-builder NSIS target; portable build is not auto-updatable). Update flow: check on launch + Help→Check for updates; download in background; prompt "Restart to update"; verify `sha512` from latest.yml; release channel `beta` (prerelease) vs `latest`. **Open question to test before promising:** whether an *unsigned* NSIS update installs without errors — verify end-to-end with two test versions on a clean VM (spike S2); if it requires signing, ship signing first.
**Rollback:** publish a higher version (updater only moves forward); keep previous installers on Releases; kill-switch file `minimum-version.json` optional.
**Acceptance:** signed installer shows verified publisher; update from N to N+1 works from installer build; update server unreachable → silent no-op; no update check when offline; privacy statement updated (one GET to github.com).

## F14 Accessibility & localisation — M (a11y continuous, i18n L)
**A11y:** WCAG 2.2 AA pass: all tabs keyboard operable (roving tabindex, arrow keys, Home/End), visible focus (exists), `aria-live` for status chips and scan progress, color not the only status carrier (icon + text on chips), contrast ≥4.5:1 (audit with axe-core in Playwright), reduced-motion (exists), canvas charts have table alternatives (F06), form labels, dialog focus trap/return focus.
**i18n:** extract all user strings to `i18n/en.json` with keys (`t('tests.protocol.title')`), ICU-lite placeholders; locale detection from `navigator.language` + manual selector; pseudo-locale (`en-XA`) build to catch hard-coded strings and overflow; initial languages EN, then DE/FR/ES/JA when translators available. Rules text in `midi-tests.js`/`midi-winlog.js` moves to catalogs.
**Acceptance:** axe-core reports 0 serious/critical violations on every tab; keyboard-only walkthrough test passes; pseudo-locale shows no untranslated literal strings (test greps rendered DOM).

## F15 Offline help & glossary — S
In-app **Help → Glossary** (search box) with 50+ terms (jitter, rollover, NRPN, Active Sensing, running status, UMP, Code 43, selective suspend…), each with a plain definition, "why it matters for repairs", and a link target id. Result cards' technical terms become `<button class="term">` opening a popover (`dialog` or `popover` API with fallback). Content in `data/glossary.json` (`{id, term, aliases[], short, long, related[]}`); search uses a prefix + alias match; included in the offline Electron bundle.
**Acceptance:** every term referenced by test/winlog text exists (unit test scans text for `{{term:id}}` tokens); search returns results <50 ms; popover keyboard-closable.

---
## Cross-feature dependency summary
P0 (foundation) → F04 → {F02, F06, F11, tests fixtures}; F01 needs P0-1; F07 needs P0-1; F10 needs P0-1 + F04; F05 → F08 environment panel; F12 needs F13 for smooth installs; F14 spans all (do a11y per PR, i18n after strings stabilise); F15 any time.
