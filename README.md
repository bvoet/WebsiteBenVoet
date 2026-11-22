# Synth Lab

Design and play synthesizers in your browser. No plugins, no installs: just the Web Audio API.

**▶ Play it at [benvoet.be/lab](https://benvoet.be/lab/)**

Synth Lab is the centerpiece of my personal site. It's a rack of instruments styled after vintage hardware, each one a different kind of synthesis you can tweak, play and share.

## Instruments

| Model | Type | Highlights |
|-------|------|------------|
| **SL-1** | Subtractive | 2 oscillators + noise, 12/24 dB multimode filter, filter & amp ADSR, LFO → pitch/filter/amp |
| **FM-2** | FM | 3 operators, stack or parallel algorithm, ratio + fine per modulator, mod envelope, velocity → index |
| **AD-3** | Additive / drawbar organ | 16 harmonic faders (Hammond footages at Octave −1), chorus, percussion, rotary speaker |
| **WT-4** | Wavetable | Draw two waveforms with the mouse, morph between them by knob, envelope or LFO |
| **DR-5** | Drum synth | 12 synthesized sounds: kick, snare, clap, rim, shaker, 3 toms, closed/open hat (with choke), cowbell, cymbal |

**Every instrument has:**
- **Voicing:** 10-voice poly, or mono with legato and glide (melodic instruments).
- **Its own FX rack:** drive, a tape-style delay, reverb and volume.
- **Presets:** factory presets, your own presets saved in the browser, and **share links** that carry the sound and its sequencer pattern.

### Sequencer and arpeggiator

- **Per-instrument tracks that play together:** build a DR-5 beat, switch to SL-1 and jam on top.
- **Melodic steps:** 16 steps, each with note, accent and slide/tie (slides glide in mono mode).
- **Drum grid:** click a cell to cycle off → on → accent.
- **Pattern settings:** length per track (polymeters welcome), swing and gate.
- **Rec:** with the transport stopped, the notes you play fill the steps one by one (step input). While it's playing, they land on the nearest step (live recording).
- **Arpeggiator:** up, down, up/down, random or played order; 1–3 octaves; 1/4 to 1/32 including triplets; latch. It locks to the sequencer tempo.

### Display

A green-phosphor screen shows a scope or spectrum, the active parameter, the last note played and the transport state.

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

On **DR-5**, every octave plays the same kit (C kick, D snare, D# clap, F# closed hat, A# open hat, and so on). The keys are labelled.

**Knobs:** drag up/down, hold `Shift` for fine control, or use the scroll wheel or arrow keys. Double-click a knob to reset it.

## Running locally

ES modules don't load from `file://`, so serve the folder with any static server:

```sh
python -m http.server 8000
# or
npx serve .
```

Then open <http://localhost:8000> for the landing page, or <http://localhost:8000/lab/> for Synth Lab.

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

## Also on the site

- **[SongX, the Neil Young songbook](https://benvoet.be/songx/)**: chords, tabs and lyrics for 625+ songs. Browse by album cover in tracklist order, filter by tuning, transpose, and hover (or tap) a chord to see how to play it.
- **[Tuner](https://benvoet.be/tuner/)**: a needle tuner for guitar through your mic, with reference tones, A4 calibration and drop/open tunings (including the ones from SongX, which links to it from each song).
- **[Fretboard](https://benvoet.be/fretboard/)**: any scale or chord on the neck in any tuning, with note or interval labels, the chords in each key, common shapes, and every note playable through Synth Lab.
- **[Top lane matchups](https://benvoet.be/lol/)**: an Olaf / Illaoi pick helper with summoner spells, builds and lane tips per enemy champion.

## Project docs

- [ARCHITECTURE.md](ARCHITECTURE.md): how the code is organized, the audio graph, and how to add a new instrument
- [CLAUDE.md](CLAUDE.md): working notes for AI-assisted development in this repo

## Roadmap

- Modular "patch cable" editor
- Song mode: chain patterns into a song
- Personal pages (about, projects, contact)
