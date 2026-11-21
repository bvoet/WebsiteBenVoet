# Synth Lab

Design and play synthesizers in your browser. No plugins, no installs: just the Web Audio API.

**▶ Play it at [benvoet.be](https://benvoet.be)**

Synth Lab is the centerpiece of my personal site. It's a rack of instruments styled after vintage hardware, each one a different kind of synthesis you can tweak, play and share.

## Instruments

| Model | Type | Status |
|-------|------|--------|
| **SL-1** | Subtractive (2 osc + noise → filter → amp) | ✅ Playable |
| FM-2 | FM synthesis | Planned |
| AD-3 | Additive | Planned |
| WT-4 | Wavetable / draw-your-own waveform | Planned |
| DR-5 | Drum synth | Planned |

### SL-1 features

- **Oscillators:** two oscillators (saw / square / triangle / sine) with octave, semitone and fine tune, plus white noise.
- **Filter:** low-pass, high-pass or band-pass, 12 or 24 dB/oct, with resonance, envelope amount (bipolar) and key tracking.
- **Envelopes:** ADSR faders for the filter and the amp.
- **LFO:** one LFO that can modulate pitch, filter and amp at the same time.
- **Voicing:** 10-voice poly, or mono with last-note priority, legato and glide. Velocity sensitivity.
- **FX:** drive, a tape-style delay and reverb.
- **Presets:** 9 factory presets. Save your own in the browser, or share a patch as a link.
- **Display:** a green-phosphor screen showing a scope or spectrum, the active parameter and the last note played.

## Playing

| Input | What it does |
|-------|--------------|
| Mouse / touch | Play the on-screen keys. Hitting lower on a key plays louder. Slide across keys for a glissando. |
| `A` `S` `D` `F` `G` `H` `J` `K` `L` `;` `'` | White keys (physical positions, so AZERTY works too) |
| `W` `E` `T` `Y` `U` `O` `P` | Black keys |
| `Z` / `X` | Octave down / up |
| `C` / `V` | Velocity down / up |
| `Space` (hold) | Sustain pedal |
| **MIDI** button | Connect a hardware keyboard: notes, velocity, pitch bend, mod wheel, sustain pedal |

**Knobs:** drag up/down, hold `Shift` for fine control, or use the scroll wheel or arrow keys. Double-click a knob to reset it.

## Running locally

ES modules don't load from `file://`, so serve the folder with any static server:

```sh
python -m http.server 8000
# or
npx serve .
```

Then open <http://localhost:8000>.

There is no build step and no dependencies. Edit a file and refresh the page.

## Deploying

The site is live at **<https://benvoet.be>**, served by GitHub Pages from `main` / `(root)`. Every push to `main` deploys automatically within a minute or two.

- **Custom domain:** the `CNAME` file in the repo root holds `benvoet.be`. Don't delete it, or Pages falls back to `bvoet.github.io/WebsiteBenVoet/`.
- **DNS** (at the registrar): four `A` records for the apex domain pointing to GitHub Pages (`185.199.108–111.153`), plus a `www` CNAME to `bvoet.github.io`.
- **HTTPS** is enforced. GitHub issues and renews the certificate automatically.

All asset paths are relative, so the site also works under the `github.io` sub-path.

## Browser support

| Browser | Audio | MIDI |
|---------|-------|------|
| Chrome / Edge | ✅ | ✅ (asks permission) |
| Firefox | ✅ | ✅ |
| Safari (macOS / iOS) | ✅ | ❌ (no Web MIDI) |

Audio starts on your first click or key press, as browsers require.

## Project docs

- [ARCHITECTURE.md](ARCHITECTURE.md): how the code is organized, the audio graph, and how to add a new instrument
- [CLAUDE.md](CLAUDE.md): working notes for AI-assisted development in this repo

## Roadmap

- More instruments: FM, additive, wavetable, drums
- Step sequencer / arpeggiator
- Modular "patch cable" editor
- Personal pages (about, projects, contact)
