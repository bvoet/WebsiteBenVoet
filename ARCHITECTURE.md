# Architecture

Synth Lab is a static site written in plain HTML, CSS and ES-module JavaScript. Sound comes from the Web Audio API. There is no framework, no bundler and no npm dependencies. The landing page (`index.html`) links to the lab at `lab/`. The lab page (`lab/index.html`) loads `js/main.js` as a module, and everything else is imported from there.

```
index.html                  landing page; forwards old root share links (#fm2=...) to lab/
lab/index.html              Synth Lab page skeleton: header, top bar, empty panel, keyboard, sequencer slot
css/home.css                landing page styling (same palette as the lab)
lol/index.html              top lane matchup cheat sheet (Olaf / Illaoi), not part of Synth Lab
css/lol.css                 matchup page styling
css/synthlab.css            all lab styling; design tokens live on :root
js/
  home.js                   landing page LCD animation (visual only, no audio)
  lol.js, lol-data.js       matchup page: search/grid/detail UI and the matchup data
  main.js                   page controller: instrument switching, panel, presets, LCD, input routing
  engine/
    audio-engine.js         AudioContext, master bus + limiter + analyser, FxRack (one per instrument)
    envelope.js             ADSR that drives any AudioParam, click-free in all browsers
  synths/
    index.js                instrument registry (order = tab order)
    params.js               shared FX/voice params, defaultParams / sanitizePatch / diffPatch
    voice-synth.js          VoiceSynth + BaseVoice: poly/mono/legato/sustain/stealing, timed notes
    subtractive.js          SL-1  2 osc + noise → 12/24 dB multimode filter
    fm.js                   FM-2  3-operator FM (stack / parallel algorithms)
    additive.js             AD-3  16-harmonic additive / drawbar organ, rotary, percussion
    wavetable.js            WT-4  two drawn waves, phase-locked crossfade morph
    drums.js                DR-5  12 synthesized drum sounds (no samples)
  seq/
    transport.js            tempo clock, lookahead scheduler, pattern model, arpeggiator
  ui/
    control.js              Knob / fader / wheel (one class, three looks)
    selector.js             LED radio-button group
    wave-editor.js          draw-a-waveform canvas (WT-4)
    sequencer.js            sequencer + arp panel (melodic steps / drum grid)
    keyboard.js             PianoKeyboard (pointer) + ComputerKeys (QWERTY)
    scope.js                oscilloscope / spectrum on the LCD canvas
    midi.js                 Web MIDI input → note/bend/mod/sustain callbacks
    presets.js              localStorage (presets, patterns, last tab) + share-link encode/decode
    format.js               value formatters, note names, selector labels/icons
```

## Layers

```
┌───────────────────────────────────────────────────────────────────────┐
│ main.js: page controller                                              │
│   instrument tabs · panel · LCD · presets · power · note routing      │
├────────────────┬───────────────────────┬──────────────┬───────────────┤
│ ui/*           │ synths/*              │ seq/         │ engine/*      │
│ widgets, no    │ instruments: params,  │ transport,   │ context, FX   │
│ audio code     │ voices, presets       │ arp          │ racks, master │
└────────────────┴───────────────────────┴──────────────┴───────────────┘
```

- **UI widgets** are audio-agnostic. They take a definition and an `onChange` callback.
- **Instruments** own their voices and modulation. They never touch the DOM.
- **The transport** knows only the instrument *interface* (`noteOn(note, vel, time)`), not the DOM.
- **`main.js`** is the only file that knows about all of them. Every live note source (mouse, computer keys, MIDI) goes through one `noteOn` / `noteOff` pair. That pair lights the keys, feeds step-record, feeds the arp, or plays the current instrument.

## Instrument modules

Each file in `js/synths/` default-exports a definition:

```js
export default {
  id: 'fm2', model: 'FM-2', name: 'FM', subtitle: '…',
  PARAMS,      // every parameter: range, default, curve, formatter, UI hints
  LAYOUT,      // [{ title, keys: [...paramKeys], wide? }] → panel sections
  PRESETS,     // [{ name, patch }] — partial patches over the defaults
  create: () => new FmSynth(),
  // drums only: drums: true, KIT
};
```

`main.js` keeps one state object per instrument (engine object, preset name, user presets, sequencer track). All instruments exist at once, so switching tabs keeps each one's sound and pattern.

### Instrument interface

| Member | Notes |
|--------|-------|
| `params`, `PARAMS` | current values / definitions |
| `attach(engine)` | build shared nodes and an FxRack; called lazily once audio is running |
| `set(name, value)`, `load(patch)` | live parameter changes / full patch (sanitized) |
| `noteOn(note, vel, t?)`, `noteOff(note, t?)` | `t` = AudioContext time; omitted means "now" |
| `allNotesOff()`, `panic()` | soft release / hard stop |
| `setPitchBend(-1..1)`, `setModWheel(0..1)`, `setSustain(bool)` | performance controls |
| `activeVoices`, `onVoiceCount` | for the LCD |

The melodic instruments extend `VoiceSynth` (`voice-synth.js`), which implements all of this. A subclass only provides:

- `build()`: shared nodes such as LFOs. Connect the output to `this.out`.
- `createVoice(note, vel, t)`: returns a `BaseVoice` subclass.
- `applyParam(name, immediate)`: react to a live change.
- `applyModWheel()`: optional.

A `BaseVoice` subclass implements `trigger(t)`, `releaseEnvelopes(t)` (returns the silent time), `killEnvelopes(t)` and `applyPitch(t, glide)`. It registers nodes with these helpers so `dispose()` can clean up generically:

- `this.source(node)`: started and stopped with the voice.
- `this.node(node)`: disconnected on dispose.
- `this.link(sharedModulator, param)`: disconnected on dispose. **This is required for every shared modulator**, or dead voices leak.

`DrumSynth` doesn't use `VoiceSynth`. Every hit is a one-shot node graph that cleans itself up `onended`. Note-offs are ignored, and `cancelScheduled(now)` drops hits the sequencer scheduled ahead.

## Audio graph

```
SL-1 ─► FxRack ─┐
FM-2 ─► FxRack ─┤
AD-3 ─► FxRack ─┼─► bus ─► limiter ─► destination
WT-4 ─► FxRack ─┤               └──► analyser (scope)
DR-5 ─► FxRack ─┘

FxRack:  input ─► WaveShaper (drive) ─► drivePost ─┬───────────────────────┐
                                                   ├─► Delay ◄─► LP ─► fb  │
                                                   │     └─► delayWet ─────┼─► out (volume)
                                                   └─► Convolver ─► revWet ┘
```

- **One rack per instrument.** Each instrument's FX and volume are part of its patch, and the racks work as a mixer when several tracks play.
- **Racks are created when an instrument is first attached.** The reverb convolver is only created once its mix is above zero, because a convolver costs CPU even when silent.
- **Drive:** a `tanh` curve with 4× oversampling. A `null` curve is a true bypass.
- **Delay:** a lowpass in the feedback loop makes repeats darker, like tape.
- **Reverb:** the impulse response is generated noise with a decay. It's regenerated when Size changes, debounced to 150 ms.
- **Limiter:** -8 dB threshold, ratio 12. It catches stacked instruments and high resonance.
- **Noise:** one shared noise buffer lives on the engine (`engine.noiseBuffer`).

### Sound design per instrument

**SL-1:** two oscillators plus noise feed a 12 or 24 dB filter (12 dB mode turns `f2` into an allpass, so the graph never changes). Filter modulation is in cents via `detune`: a per-voice `ConstantSource` envelope plus the shared LFO, so it stays exponential and musical. Biquad `Q` is in **dB** for lowpass/highpass and linear for bandpass.

**FM-2:** a carrier and two modulators. The modulator output goes through a gain node into `carrier.frequency` (or into `m1.frequency` in *stack* mode). The index is classic FM: peak deviation = index × modulator frequency. A shared mod envelope scales both indices, and velocity scales the index (Vel→Idx). Pitch modulation goes to all three oscillators' `detune`, so the ratios hold under bend and vibrato.

**AD-3:** 16 harmonic faders build one `PeriodicWave`, with amplitude = fader², so the faders feel like drawbars. That means one oscillator per voice, no aliasing, and live redraws. Rebuilds are coalesced with `queueMicrotask`, so loading a preset rebuilds once. With Octave -1, harmonics 1/2/3/4/6/8/10/12/16 are the Hammond footages. Extras:
- *Chorus:* a detuned twin oscillator.
- *Percussion:* a 2nd or 3rd harmonic blip with its own envelope.
- *Rotary:* one LFO drives both pitch (doppler) and amplitude, and its speed glides like a spinning-up rotary speaker.

**WT-4:**
- **Wave conversion:** each drawn wave is 64 points. A DFT turns it into a 32-harmonic `PeriodicWave`, with a slight roll-off of the top harmonics to smooth the drawn "staircase".
- **Morph:** two oscillators run at the same frequency and phase, and the voice crossfades between them. Because they're phase-locked, the crossfade is a true waveform interpolation.
- **Morph control:** `gB = morph` and `gA = 1 − morph`, done with a -1 gain inverter feeding `gA.gain` (whose intrinsic value is 1). The morph value is the base knob plus the LFO (shared `morphMod`) plus the per-voice envelope. It isn't clamped, so a large Env Amt plus a high Morph setting extrapolates a little past wave B.

**DR-5:** the kit is mapped by pitch class (every octave plays the same kit):
- **Kick:** a sine with an exponential pitch drop, plus a noise click.
- **Snare:** two triangles plus high-passed noise.
- **Clap:** band-passed noise with three bursts and a tail.
- **Toms:** sines with a pitch drop.
- **Hats and cymbal:** six square oscillators at inharmonic ratios, band- and high-passed, the classic analog drum-machine method. A closed hat chokes a ringing open hat.
- **Cowbell:** two squares through a bandpass.

## Envelopes (`engine/envelope.js`)

The envelope tracks its own level analytically (`levelAt(t)`) instead of reading `AudioParam.value`. That makes release-during-attack and retrigger-during-release smooth in every browser, including Firefox, which lacks `cancelAndHoldAtTime`. It also works for **future** times, which the sequencer relies on: it schedules note-ons and note-offs up to 120 ms ahead.

- Attack is linear, with a 3 ms minimum. Decay and release use `setTargetAtTime` with τ = time / 4.
- `release()` returns the time at which the output is silent. `kill()` is a ~20 ms fade for stealing and Panic.

## Voice lifecycle (`VoiceSynth`)

1. `noteOn(note, vel, t)` creates a voice, starts its sources at `t` and triggers its envelopes at `t`.
2. `noteOff(note, t)` releases at `t` and schedules a `setTimeout` for when the voice will be silent.
3. When that timer fires, if the voice is still released, `dispose()` stops its sources and disconnects its nodes and modulator links.

Oscillators are never scheduled to stop with `osc.stop(t)`. Mono mode can retrigger a releasing voice, so disposal is timer-based and cancellable.

- **Poly:** 10 voices. When full, the oldest *releasing* voice is stolen, otherwise the oldest voice.
- **Mono:** a note stack with last-note priority. Notes held together play legato with glide.
- **Sustain:** note-offs are deferred into a set and released when the pedal comes up.
- **`allNotesOff()`** also cancels releases the sequencer scheduled in the future: it re-releases every voice at "now".

## Sequencer and arpeggiator (`seq/transport.js`)

**Lookahead scheduler:** a 25 ms `setInterval` schedules every step whose time falls within the next 120 ms, at exact AudioContext times. If the tab was throttled, it skips ahead rather than firing a burst. Swing delays the odd 16ths.

**Tracks:** every instrument has its own pattern, and all *enabled*, non-empty tracks play together. That's how a DR-5 beat keeps running while you play SL-1. Each track has its own length (1–16), which allows polymeters.
- **Melodic patterns:** `{ enabled, length, steps: [{ on, note, accent, slide }] }`.
  - *Slide:* the note isn't released. The next note-on comes first, and the old note-off follows 4 ms later. That gives legato and glide in mono mode.
  - *Tie:* a slide into the same note is a tie, and the note keeps sounding.
- **Drum patterns:** `{ enabled, length, rows[12][16] }`, with values 0 (off), 1 (on) and 2 (accent).

**Stop:** melodic tracks get `allNotesOff()`. Drum tracks get `cancelScheduled()`, so ringing tails finish but queued hits are dropped.

**Arp:** it runs on the same clock. When the transport is playing it locks to the transport grid; otherwise it free-runs.
- *Modes:* up, down, up/down, random, and order (the order the keys were pressed).
- *Range and rate:* 1–3 octaves, at rates from 1/4 to 1/32 including triplets.
- *Latch:* the notes keep playing after release, and a fresh chord replaces them.
- *Input:* while the arp is on, live notes go to the arp instead of the synth. Toggling the arp releases everything first, so nothing gets stuck.

**Recording:** while Rec is armed, live notes are written into the pattern. With the transport stopped they go into the cursor step, which then advances (step input). While playing they go to the nearest step (quantized live recording).

**Storage:** patterns are saved per instrument in `localStorage` (debounced) and included in share links when they're non-empty.

## Parameters and the panel

Every parameter is declared once in its instrument's `PARAMS`. `buildPanel()` in `main.js` walks `LAYOUT` plus the shared `FX_LAYOUT` and creates a `Control`, `Selector` or `WaveEditor` for each key. To add a parameter:

1. Add it to `PARAMS` in the instrument file.
2. Handle it in `applyParam()` for live changes, or read it in the voice's `trigger()` so it applies from the next note.
3. Add the key to a `LAYOUT` section.

Parameter types:
- **Numbers:** `{min, max, def, curve: 'lin'|'log'|'pow', step?, format, kind: 'knob'|'fader', bipolar?, size?}`
- **Selects:** `{type: 'select', options}`
- **Waves:** `{type: 'wave', def: number[64]}`

Shared parameters come from `params.js`: `FX_PARAMS` (with `fx: true`, routed to the instrument's rack) and `VOICE_PARAMS` (mode, glide, velocity).

## Presets, storage and sharing

| Data | Where |
|------|-------|
| Factory presets | `PRESETS` in each instrument file (partial patches) |
| User presets | `localStorage["synthlab.<id>.userPresets"]`, only values that differ from the defaults (`diffPatch`) |
| Sequencer patterns | `localStorage["synthlab.<id>.pattern"]` |
| Last open instrument | `localStorage["synthlab.lastInstrument"]` |
| Share links | `#<id>=<base64url(JSON {n: name, p: patch, s?: pattern})>` |

Every storage access is wrapped in `try/catch`. Anything read from a link or from storage goes through `sanitizePatch()` / `sanitizePattern()`, which drop unknown keys, clamp numbers and validate selects, waves and step data. Untrusted text is only ever rendered with `textContent`.

## Input and robustness

- **Audio unlock:** `ensureAudio()` is synchronous. It builds the graph and attaches the current instrument immediately, then resumes the context in the background. Unlock listeners (`pointerdown`, `keydown`, `touchend`, `click`) stay active until the context is actually running, which matters for iOS.
- **Stuck-note guards:**
  - Held notes and the arp's held keys are released on `blur` and when the tab is hidden. The sequencer keeps playing.
  - Pointer release is tracked on `window`, so letting go outside the keyboard still ends the note.
  - MIDI note-on with velocity 0 counts as note-off, and key auto-repeat is ignored.
  - Panic stops the transport, clears the arp and hard-stops every instrument.
- **Computer keys:**
  - They use `KeyboardEvent.code`, so the mapping follows physical key positions on any layout.
  - They're ignored in text fields, but not in the preset `<select>`, so its type-ahead can't change the patch while you play.
  - Space (sustain) calls `preventDefault` on both keydown and keyup.
- **MIDI** is only requested when the user clicks the MIDI button, because it triggers a permission prompt.

## Styling

- Design tokens are CSS custom properties on `:root`. Fonts: **Barlow Condensed** for panel lettering and **VT323** for the LCD-style displays.
- Modules are a flex-wrap of `.module` sections. Breakpoints are at 1100 px and 700 px. On phones the keyboard and sequencer grid scroll horizontally, and the keyboard auto-scrolls to the playable range.

## Debugging

`window.synthLab` exposes `{ engine, transport, synth (current), current (id), switchTo(id), instruments }`:

```js
synthLab.switchTo('fm2');
synthLab.synth.noteOn(60, 0.8); synthLab.synth.noteOff(60);
synthLab.synth.activeVoices            // back to 0 after the release
synthLab.instruments.get('dr5').track  // DR-5's sequencer pattern
synthLab.transport.start(); synthLab.transport.stop();
```
