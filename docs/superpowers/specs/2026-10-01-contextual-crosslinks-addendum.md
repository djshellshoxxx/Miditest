# MIDItest Contextual Cross-Linking Addendum

Date: 2026-10-01

This addendum supplements the MIDItest design specification.

## Principle

MIDItest is a hardware/controller diagnostic tool. Other Circuit Drift Labs projects should be available without distracting from troubleshooting.

## Required links

The shared production-tool directory must list:

1. TrackStats
2. Transposition Calculator
3. MIDItest
4. LoudnessBatch

Experiments below and visually separated:

1. Binaural Web Beats
2. BabbleForge

## Contextual behavior

After a Guided Test or diagnostic report is completed, a compact `More Circuit Drift Labs tools` area may appear below the report actions.

Suggested workflow prompts:

- `Working with samples or key/BPM changes next? Open Transposition Calculator.`
- `Want to analyze your music collection? Open TrackStats.`
- `Comparing finished mixes or reference tracks? Open LoudnessBatch.`

These prompts must remain below the diagnostic findings and export actions. Do not place unrelated cross-links inside key, control-noise, latency, or MIDI-message findings.

## Brand link

Header/footer must link to `https://circuitdriftlabs.djshellshoxxx.github.io` with the shared small 2D Circuit Drift Labs mark.

## Testing

Verify related tools appear only in the completion/navigation area, never obscure diagnostic results, and the Experiments section remains separate and ordered Binaural Web Beats then BabbleForge.
