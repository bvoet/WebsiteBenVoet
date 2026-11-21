# CLAUDE.md

Personal website of Ben Voet. The core is **Synth Lab**, a rack of browser synthesizers with a retro hardware look. Personal pages (about, projects) come later.

Read [ARCHITECTURE.md](ARCHITECTURE.md) before changing audio code. It documents the signal graph, voice lifecycle and envelope design.

## About the owner

Ben is an experienced musician (12+ years guitar) and knows synth terminology. UI labels and docs can use proper synth language (cutoff, resonance, ADSR, legato, key tracking) without explaining it.

## Stack and hard rules

- **Plain HTML / CSS / ES-module JS + Web Audio API.** No framework, bundler, TypeScript or npm dependencies unless Ben explicitly asks.
- **Relative paths only** (`css/...`, `./js/...`). The site is live at https://benvoet.be, but it must also keep working under the fallback sub-path `bvoet.github.io/WebsiteBenVoet/`.
- **Never delete or edit the `CNAME` file.** It binds the custom domain `benvoet.be`.
- **Pushing to `main` deploys to the live site.**
- **Filename case must match imports exactly.** Windows forgives mismatches; GitHub Pages doesn't.
- External resources: Google Fonts only. Don't add CDN scripts without asking.
- **Don't commit or push unless asked.** Deploys come from `main` / root via GitHub Pages.

## Running

```sh
python -m http.server 8000   # then open http://localhost:8000
```

ES modules don't load over `file://`.

## Code conventions

- 2-space indent, single quotes, semicolons, trailing commas in multi-line literals.
- UI widgets in `js/ui/` stay audio-agnostic (definition + `onChange`). Instruments in `js/synths/` never touch the DOM. `main.js` wires them together.
- Each instrument lives in `js/synths/<name>.js` with its own `PARAMS`, `LAYOUT` and `PRESETS`, and is registered in `js/synths/index.js`. New parameters: add to `PARAMS`, handle in `applyParam()` (or read in the voice's `trigger()`), and add to `LAYOUT`. The panel is generated from these, so don't hand-write knob HTML.
- Melodic instruments extend `VoiceSynth` / `BaseVoice` (`voice-synth.js`). Register voice nodes with `source()` / `node()` / `link()` so `dispose()` cleans them up.
- Instruments must accept an optional AudioContext time on `noteOn(note, vel, t)` / `noteOff(note, t)`. The sequencer schedules ahead with it.
- Wrap every `localStorage` access in `try/catch`.
- Validate anything from a URL or storage through `sanitizePatch()` / `sanitizePattern()`.
- Never use blocking dialogs (`alert` / `confirm` / `prompt`). Use inline UI and the LCD `flash()` instead.

## Web Audio pitfalls (already handled — keep them handled)

- **Stuck notes are the #1 bug.** Every note source goes through `noteOn` / `noteOff` in `main.js`. Keep the release-all on `blur` / `visibilitychange`, window-level pointerup, the MIDI velocity-0 note-off, and ignoring key repeat.
- **Voices must disconnect from the shared `pitchMod` / `filterMod`** in `dispose()`, or nodes leak.
- **Don't schedule `osc.stop(t)` on release.** Mono mode retriggers releasing voices, so disposal is timer-based.
- **Envelopes:** use `Envelope` (analytic level tracking), not `param.value` reads or `cancelAndHoldAtTime`, which Firefox lacks. Never exponential-ramp to 0. Keep the minimum attack.
- **Biquad `Q`** is in dB for lowpass/highpass and linear for bandpass.
- **Audio unlock** must stay synchronous (`ensureAudio()`), so a first-gesture note is never lost or stuck.
- Keep the limiter at the end of the master chain. Debounce expensive work during knob drags, e.g. reverb impulse regeneration.

## Verifying changes

There's no test suite. Audio can't be verified by ear here, so check it programmatically:

1. Serve locally and load the page. Check the console for errors.
2. In the console (or via DevTools Protocol), use `window.synthLab`:
   - `switchTo(id)` for each instrument (`sl1 fm2 ad3 wt4 dr5`).
   - `synth.noteOn(60)`, then read the analyser RMS (`engine.analyser.getFloatTimeDomainData`). It should be non-zero.
   - `synth.noteOff(60)`, wait past the release, and confirm `synth.activeVoices === 0` and RMS ≈ 0.
3. Test real key handling with **trusted** input (CDP `Input.dispatchKeyEvent`). Synthetic `KeyboardEvent`s skip browser default actions, such as button activation and select type-ahead.
4. Screenshot at ~1400 px, ~900 px and 390 px wide. For mobile, set the viewport *before* navigating.

Tell Ben plainly what couldn't be verified (e.g. Firefox/Safari, actual sound quality), and ask him to play-test.

## Roadmap

Done: SL-1, FM-2, AD-3, WT-4, DR-5, plus the step sequencer (a track per instrument) and the arpeggiator.

Next: a modular patch-cable editor, song mode (chaining patterns), and personal pages (about/projects; Ben supplies the content).
