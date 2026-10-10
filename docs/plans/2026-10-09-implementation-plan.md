# MIDItest Implementation Plan (v0.02 → v0.05)

Specs: `docs/specs/2026-10-09-roadmap-feature-specs.md`. Goal: ship fast with few regressions. Strategy: **foundation first (2–3 days), then small vertical slices behind feature flags, released every ~1–2 weeks.**

## 1. Guiding principles
1. **Pure logic first.** Every feature starts as a `lib/` module with unit tests and fixtures; UI is a thin layer.
2. **Fixtures before features.** Recording/replay (F04) lets every later feature be tested against real captured behavior, not guesses.
3. **Small PRs (<400 lines of non-generated diff), one concern each, CI green before merge.** Squash-merge to `main`; `main` is always releasable.
4. **Flags, not branches.** Unfinished features merge dark (`flags.<id>=false`). Release = flip default after acceptance passes.
5. **No telemetry, no network** (except the single optional update check in F13) — preserves the product promise.
6. **Don't promise what the browser can't see** (UMP, raw bytes, driver timing). Specs state limits; UI repeats them.

## 2. Phase 0 — Foundation (blocks everything; target 3 working days)
| ID | Task | Detail / acceptance |
|---|---|---|
| P0-1 | Modularize `app-v2.js` | Split 50 KB single file into `lib/` (pure) and `ui/` modules + `app.js` wiring. **No behavior change.** Gate: existing unit + browser tests unchanged and green; `ui-static.test` updated to scan all `ui/*.js` for `ids`. Do in 3 mechanical PRs (state+ports, renderers, handlers). |
| P0-2 | Schema v3 + migrations | `lib/schema.js`: `REPORT_VERSION`, `migrate(report)`, JSON-Schema doc in `docs/schema/`; tests with v1/v2/v3 samples; `validateReport` extended (checklist, advancedTests, windowsLogs types). |
| P0-3 | Feature flags + Labs panel | `lib/flags.js` (`isOn(id)`, `set`), Help→Labs checkbox list; flag state in report metadata. |
| P0-4 | CI hardening | (a) `ci.yml` on every PR: `npm ci`, `npm test`, Playwright browser tests on ubuntu (Chromium from Playwright cache), (b) ESLint (flat config, `no-undef`, `no-unused-vars`, `eqeqeq`) + `prettier --check` on `lib/ ui/ tests/`, (c) PowerShell syntax check of `winscan.ps1` on the Windows job, (d) Electron smoke test on Windows runner: launch with `--smoke` flag → loads `app://`, asserts `window.miditestDesktop` exists, runs `scanWindows(1)` and checks JSON parses, exits 0; (e) required status checks on `main` branch protection. |
| P0-5 | Release process | SemVer in `package.json`; single source of version for UI footer, installer names (`${version}`), release tag; `CHANGELOG.md` (Keep a Changelog); release workflow derives tag/name from `package.json`; draft release → publish after smoke test. Remove hard-coded `0.01-beta` strings. |
| P0-6 | Real-hardware QA of Windows scan | Manual checklist on Win10 + Win11 (admin and non-admin): scan completes <90 s, JSON parses, a deliberately unplugged-while-streaming device produces a USB/Kernel-PnP event, setupapi parsing finds a known install, no console errors. Fix findings in `winscan.ps1`. **Highest-risk existing code: never run on real Windows yet.** |
| P0-7 | Test data | `tests/fixtures/` skeleton and generator script `tools/make-fixtures.mjs` (synthetic captures with seeded noise) until real captures exist. |

**Exit gate for Phase 0:** CI required checks green on `main`, Windows scan verified on real PCs, version/tag automation proven by a dry-run release.

## 3. Release train
| Release | Contents | Why this order | Est. |
|---|---|---|---|
| **0.02** | P0-1…P0-7, **F04 record/replay**, **F15 glossary**, **F02 checklists**, **F11 report export** | Biggest user value for a repair bench (repeatable pass/fail sheet + shareable output) and builds the fixture base | ~2 weeks |
| **0.03** | **F03 profiles/fleet**, **F06 charts**, **F05 Windows evidence**, **F13 signing (if cert ready)** | Uses 0.02 data model; signing started in week 1 because identity validation has lead time | ~2 weeks |
| **0.04** | **F01 active tests**, **F07 SysEx**, **F09 clock generator** | Highest risk (sends MIDI) — needs mature test fixtures and safety UX | ~3 weeks |
| **0.05** | **F10 multi-device**, **F08 UMP awareness**, **F13 auto-update**, **F14 a11y/i18n (strings)** | Larger state changes after logic is stable | ~3 weeks |
| **0.06+** | **F12 macOS/Linux**, additional languages | Needs Macs/Linux test hardware, notarization | ~3 weeks |

Parallel non-code track (start day 1): choose signing path (Azure signing service vs OV/EV cert vs SignPath), submit identity verification; acquire test hardware (one keyboard, one pad controller, one DIN/USB interface, spare cables, a hub), set up Windows 10/11 VMs/PCs, a Mac and Linux box for F12.

## 4. Per-feature workflow (every PR)
1. Write/confirm the spec section (this repo is the source of truth; update on behavior change).
2. Add failing unit tests + fixture; implement `lib/`; add UI behind flag; add browser test with mock MIDI.
3. Run locally: `npm test`, `node tests/browser.test.mjs`, lint/format.
4. Self-review diff adversarially (what would make CI or a user's data break?); check keyboard use and 420 px layout.
5. PR with checklist (below); CI green; squash-merge; flag stays off until acceptance passes in a release candidate.
6. Update `CHANGELOG.md`, release notes, glossary entries for any new term.

**PR checklist:** tests added/updated · no `innerHTML` with unescaped data · imports validated/size-limited · new IPC channel validated (sender origin + arg types) · schema change migrated · help text/glossary updated · no new network calls · a11y (labels, focus, live regions) · works with Web MIDI unavailable.

## 5. Quality gates & test strategy
- **Pyramid:** unit (pure logic, fixtures) ≫ browser integration (mock Web MIDI in Playwright) > Electron smoke (Windows CI) > manual hardware QA per release.
- **Regression fixtures:** every bug fixed adds a fixture/test that fails before the fix.
- **Property tests (fast-check, optional):** capture parse/serialize round trip; SysEx hex parser; UMP decoder never throws on random input.
- **Performance budget:** 100k-event replay analyzed <2 s; render pass <16 ms for visible tab at 5000 events (measure in CI with a Playwright performance mark; warn at 2×).
- **Release candidate checklist (manual, ≤45 min):** install + portable launch; connect real keyboard; run guided test + checklist; run each Tests card; Windows scan; burst test on loopback; export/import report, capture, profile; print/PDF; unplug during streaming; uninstall leaves no files.
- **Hardware matrix (minimum):** Win11 24H2 + Win10 22H2; class-compliant USB keyboard, pad controller, USB MIDI interface with DIN loopback, a hub, a device with vendor driver.

## 6. Risk register
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `winscan.ps1` fails on real systems (locale, permissions, slow `Get-WinEvent`) | High | High | P0-6 first; per-section try/catch (exists); time-box each section; localized-message-independent rules (match IDs, not text); degrade to partial results |
| Modularization regression | Med | High | Mechanical PRs, no behavior change, existing browser test as gate, revert-friendly small steps |
| Active tests harm connected gear (SysEx overwrite, runaway notes) | Med | High | Confirm dialog, Panic, rate limit, no bulk SysEx send in v1, default low velocity, always send All Notes Off on cancel |
| Web MIDI differences (Chrome vs Edge vs Electron versions; Windows MIDI Services behavior changes) | Med | Med | Pin Electron version; test matrix; detection + friendly messages; keep Windows build at least one version behind latest until smoke-tested |
| Unsigned installer/SmartScreen deters users | High | Med | Start signing early (F13); documented "Run anyway" steps (exists) |
| Auto-update breaks/bricks installs | Low | High | Test N→N+1 on clean VM; staged: `beta` channel first; updater only moves forward; keep manual download path |
| Storage limits (localStorage 5 MB) | Med | Low | Profiles/captures use file export; size checks and clear error messages; optional IndexedDB later |
| Scope creep / unclear acceptance | Med | Med | Specs have acceptance criteria; flags; weekly release cadence; defer anything not in the spec |
| Misleading diagnoses | Low | High | Wording rules (“measured observations”), limits sections in every card, no auto repair claims |
| Loss of the single maintainer (bus factor) | Med | Med | Specs + plan in repo, CONTRIBUTING.md, scripted release |

## 7. Additional deliverables required to ship safely
- `CONTRIBUTING.md` (setup, test commands, PR checklist), `CHANGELOG.md`, issue templates (bug with capture attach, feature), `SECURITY.md` (how to report; threat notes on IPC and imports), branch protection + CODEOWNERS.
- Dependabot for npm/GitHub Actions (weekly, grouped); pin Actions by SHA; `npm audit --omit=dev` in CI (warn).
- Electron hardening review each release: `contextIsolation`, sandbox, CSP meta tag (`default-src 'self'; style-src 'self' 'unsafe-inline'`), `webSecurity` default, deny `window.open`, IPC sender validation (exists), no remote content.
- Content Security Policy for the web build and a `Referrer-Policy`/`X-Content-Type-Options` note for the Pages host (headers aren't configurable on Pages → use meta CSP).
- Crash handling: global `window.onerror` writes to an in-app “Diagnostics log” (local only) and a **Copy debug info** button (app version, OS, browser, flags; no MIDI data) for support.
- Documentation site pages: Getting started, Test reference (auto-generated from `TEST_GUIDE`/glossary), Windows log guide, Safety notes for active tests, FAQ.
- Licensing review: bundled data (`manufacturers.json` from MIDI.org public list, glossary text) must be original or licensed; add `THIRD_PARTY_NOTICES.md` (Electron, electron-builder, any chart/lint tooling).

## 8. Spikes (time-boxed to 0.5–1 day, results written to `docs/research/`)
- **S1** Native Windows MIDI Services SDK from Electron (N-API addon vs PowerShell/WinRT) for live UMP — decide go/no-go for F08 v2.
- **S2** Unsigned NSIS auto-update behavior on clean Win10/11 VMs (informs F13 ordering).
- **S3** macOS Web MIDI under hardened runtime/notarization — needed entitlements (F12).
- **S4** Playwright + Electron (`_electron.launch`) e2e on GitHub Windows runner for the smoke test.
- **S5** `Get-WinEvent` performance and permission behavior (non-admin) across Windows builds; measure sections (F05/P0-6).

## 9. Definition of “ready to ship” (per release)
All release-train items for the release merged with flags on · CI green on `main` · RC checklist passed on hardware matrix · `CHANGELOG.md` + release notes + help updated · installers built from the tagged commit, verified publisher (once signed) and launched on a clean VM · known limitations listed · rollback = publish previous build as a higher patch version.

## 10. Rough timeline (one developer; halve with two)
Week 1: P0 + signing track + F04 start · Week 2: F04, F15, F02, F11 → **v0.02** · Weeks 3–4: F03, F06, F05, signing → **v0.03** · Weeks 5–7: F01, F07, F09 → **v0.04** · Weeks 8–10: F10, F08, updater, i18n strings, a11y audit → **v0.05** · Weeks 11–13: F12 → **v0.06**.
