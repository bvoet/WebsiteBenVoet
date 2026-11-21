# Architecture

Synth Lab is a static site written in plain HTML, CSS and ES-module JavaScript. Sound comes from the Web Audio API. There is no framework, no bundler and no npm dependencies. The browser loads `index.html`, which loads `js/main.js` as a module, and everything else is imported from there.

```
index.html                  page skeleton: header, instrument tabs, top bar, empty panel, keyboard area
css/synthlab.css            all styling; design tokens live on :root
js/
  main.js                   page controller: builds the panel, wires inputs, presets, LCD, power
  engine/
    audio-engine.js         AudioContext, shared FX rack, limiter, master volume, analyser
    envelope.js             ADSR that drives any AudioParam, click-free in all browsers
  synths/
    subtractive.js          SL-1: parameter schema, Voice, SubtractiveSynth, factory presets
  ui/
    control.js              Knob / fader / wheel (one class, three looks)
    selector.js             LED radio-button group (waveforms, filter type, ...)
    keyboard.js             PianoKeyboard (pointer input) + ComputerKeys (QWERTY input)
    scope.js                Oscilloscope / spectrum drawn on the LCD canvas
    midi.js                 Web MIDI input → note/bend/mod/sustain callbacks
    presets.js              localStorage user presets, share-link encode/decode
    format.js               Value formatters, note names, waveform icons
```

## Layers

```
┌──────────────────────────────────────────────────────────────┐
│ main.js: page controller                                     │
│   panel layout · LCD · presets · power · input routing       │
├───────────────┬──────────────────────────┬───────────────────┤
│ ui/*          │ synths/subtractive.js    │ engine/*          │
│ widgets that  │ instrument: params,      │ shared audio      │
│ know nothing  │ voices, presets          │ context + FX +    │
│ about audio   │                          │ master bus        │
└───────────────┴──────────────────────────┴───────────────────┘
```

- **UI widgets** (`Control`, `Selector`, `PianoKeyboard`, ...) are audio-agnostic. They take a definition and an `onChange` callback.
- **Instruments** own their voices and modulation. They never touch the DOM.
- **The engine** is shared by every instrument. It owns the `AudioContext` and everything after the instrument's output.
- **`main.js`** is the only file that knows about all three. It routes every note source (mouse, computer keys, MIDI) through one `noteOn` / `noteOff` pair, so the keyboard lights and the synth always agree.

## Audio graph

### Engine (shared)

```
instrument ──► input ─► drivePre ─► WaveShaper ─► drivePost ─┬─────────────────────────┐
                                                             ├─► Delay ◄─► LP ─► fb    │
                                                             │     └─► delayWet ───────┤
                                                             └─► Convolver ─► revWet ──┤
                                                                                       ▼
                                       destination ◄─ master ◄─ limiter ◄────────── sum
                                                         └──► analyser (scope)
```

- **Drive:** a `tanh` curve with 4× oversampling. With drive at 0 the curve is `null`, a true bypass.
- **Delay:** a lowpass in the feedback loop darkens each repeat, like tape.
- **Reverb:** the impulse response is generated noise with an exponential decay. It's regenerated when Size changes, debounced to 150 ms.
- **Limiter:** a `DynamicsCompressor` at -8 dB with ratio 12. It catches high resonance and stacked voices.
- **Volume:** squared for a more natural taper.

### SL-1 voice

```
osc1 ─► g1 ─┐
osc2 ─► g2 ─┼─► f1 (Biquad) ─► f2 (Biquad) ─► vca ─► voiceBus ─► tremolo ─► engine.input
noise ─► gn ┘    ▲ detune        ▲ detune      ▲ gain
                 │               │             └─ amp Envelope
                 ├── fEnvSrc (ConstantSource, filter Envelope)
                 └── synth.filterMod (LFO→filter)
osc1/osc2.detune ◄── synth.pitchMod (LFO→pitch + pitch bend)
```

Things to know:

- **Filter modulation runs in cents through `detune`.** Cutoff sets `frequency`. The filter envelope (a per-voice `ConstantSource`) and the LFO are summed into `detune`, so the modulation is exponential and musical, and the two filters in 24 dB mode stay in sync.
- **12 / 24 dB:** `f2` becomes an `allpass` in 12 dB mode, so the graph never has to be rebuilt.
- **Biquad `Q` is in dB for lowpass/highpass and linear for bandpass.** `Voice.applyFilter` maps resonance differently for each.
- **Shared modulators** (`pitchMod`, `filterMod`) are single `GainNode`s that every voice connects to. When a voice is disposed it **must** disconnect from them, or dead voices stay alive in the graph.
- **The LFO is global** (one `OscillatorNode`), not per voice. Amp LFO is a tremolo on the voice bus.

## Envelopes (`engine/envelope.js`)

The envelope tracks its own level analytically (`levelAt(t)`) instead of reading `AudioParam.value`. That makes release-during-attack and retrigger-during-release smooth in every browser, including Firefox, which lacks `cancelAndHoldAtTime`.

- Attack is a linear ramp with a 3 ms minimum, to avoid clicks.
- Decay and release use `setTargetAtTime` with time constant τ = time / 4, so a stage is ~98% done at its nominal time.
- `release()` returns the time at which the output is effectively silent. The voice uses it to schedule disposal.
- `kill()` is a ~20 ms fade, used for voice stealing and Panic.

## Voice lifecycle

1. `noteOn` creates a `Voice`. It builds its nodes, connects to the shared modulators, starts its sources and triggers both envelopes.
2. `noteOff` calls `release()`. A `setTimeout` is scheduled for when the amp envelope is silent.
3. When the timer fires, if the voice is still released, `dispose()` stops the sources, disconnects everything and removes the voice from `synth.voices`.

Oscillators are never scheduled to stop with `osc.stop(t)`, because that can't be undone. Mono mode needs to retrigger a releasing voice, so disposal is timer-based and cancellable.

**Poly:** max 10 voices. When full, the oldest *releasing* voice is stolen first, otherwise the oldest voice.

**Mono:** there is a note stack with last-note priority. A new note while another is held glides without retriggering (legato). Releasing the top note glides back to the previous one.

**Sustain:** note-offs are deferred into a set and released when the pedal comes up.

## Parameters and the panel

Every SL-1 parameter is declared once in `PARAMS` in `synths/subtractive.js`. The declaration holds its range, default, curve (`lin` / `log` / `pow`), step, formatter and UI hints (`kind: 'fader'`, `size: 'lg'`, `bipolar`, `type: 'select'`).

`main.js` has a `LAYOUT` array that groups parameter keys into panel sections. `buildPanel()` creates a `Control` or `Selector` for each key from its definition. To add a knob:

1. Add an entry to `PARAMS`.
2. Handle it in `SubtractiveSynth._apply()`, or in a `Voice.apply*` method if it is per-voice.
3. Add the key to a section in `LAYOUT`.

Parameters with `fx: true` are forwarded to `engine.setFx()` instead of being handled by the synth.

Changes to continuous parameters are applied live to sounding voices with short `setTargetAtTime` smoothing. Envelope times, envelope amount, glide and velocity take effect from the next note.

## Presets and sharing

- **Factory presets** live in `PRESETS` as *partial* patches merged over the defaults.
- **User presets** are stored in `localStorage["synthlab.sl1.userPresets"]` as `{ name, patch }`. Only values that differ from the defaults are saved (`diffPatch`). Every storage call is wrapped in `try/catch`, because storage can be unavailable.
- **Share links** look like `#sl1=<base64url(JSON {n: name, p: patch})>`. On load, the patch passes through `sanitizePatch()`, which drops unknown keys, clamps numbers and validates select values. A link can't inject arbitrary values.

## Input and robustness

- **Audio unlock:** `ensureAudio()` is synchronous. It builds the graph and attaches the synth immediately, then resumes the context in the background. A note played as the very first gesture is scheduled right away, so it can't be lost or stuck. Unlock listeners (`pointerdown`, `keydown`, `touchend`, `click`) stay active until the context is actually running, which matters for iOS.
- **Stuck-note guards:** all notes are released on window `blur` and when the tab is hidden. Pointer release is tracked on `window`, so letting go outside the keyboard still ends the note. MIDI note-on with velocity 0 counts as note-off, and key auto-repeat is ignored. Panic does a hard stop.
- **Computer keys** use `KeyboardEvent.code` (physical position), so the layout works on AZERTY and QWERTZ. They're ignored in text fields, but *not* in the preset `<select>`, so the select's type-ahead can't swap the patch while you play. Space calls `preventDefault` on both keydown and keyup, so sustain never "clicks" a focused button.
- **MIDI** is only requested when the user clicks the MIDI button, because it triggers a permission prompt. If Web MIDI isn't available, the button is disabled.

## Adding a new instrument

The engine and the UI widgets are reusable. Today `main.js` is wired to SL-1 directly. The planned shape for more instruments:

1. Create `js/synths/<name>.js` exporting:
   - `PARAMS`, `PRESETS`, `defaultParams()`, `sanitizePatch()`
   - an instrument class with the same interface as `SubtractiveSynth`: `attach(engine)`, `set(name, value)`, `load(patch)`, `noteOn(note, velocity)`, `noteOff(note)`, `allNotesOff()`, `panic()`, `setPitchBend(-1..1)`, `setModWheel(0..1)`, `setSustain(bool)`, `activeVoices`, `onVoiceCount`
2. Connect its output to `engine.input`, so it gets the FX rack and the master bus for free.
3. Move the panel `LAYOUT` next to the instrument's `PARAMS`, and let `main.js` rebuild the panel when an instrument tab is selected. Scope the preset storage key and the share-hash prefix per instrument (e.g. `#fm2=`).

## Styling

- Design tokens (colors, fonts, key sizes) are CSS custom properties on `:root` in `css/synthlab.css`.
- Fonts come from Google Fonts: **Barlow Condensed** for panel lettering and **VT323** for the LCD. Both have system fallbacks.
- Knob ticks are an SVG generated in `control.js`. The knurled skirt is a `repeating-conic-gradient`, and rotation is a CSS transform on `.knob__body`.
- The layout is a flex-wrap of `.module` sections. Breakpoints are at 1100 px (the LCD moves to its own row) and 700 px (phone). On phones the keyboard scrolls horizontally (`touch-action: pan-x`) and auto-scrolls to the playable range.

## Debugging

`main.js` exposes `window.synthLab = { engine, synth }`. In the dev-tools console:

```js
synthLab.synth.noteOn(60, 0.8); synthLab.synth.noteOff(60);
synthLab.synth.activeVoices          // should return to 0 after release
synthLab.synth.params                // current patch
synthLab.engine.ctx.state            // 'running' once audio is unlocked
```
