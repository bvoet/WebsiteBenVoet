---
name: Ben Voet
description: A loud label catalogue of browser music tools, every tool a numbered release with its own colour.
colors:
  ground: "#111214"
  surface: "#1a1b1e"
  surface-2: "#232428"
  ink: "#f1efe9"
  muted: "#a3a29c"
  faint: "#8a8984"
  rule: "#2c2d30"
  edge: "#3a3b40"
  lcd-well: "#0b0b0c"
  good: "#35d07f"
  bad: "#ff4b3e"
  tool-lab: "#ff5a1f"
  tool-songx: "#f2c230"
  tool-tuner: "#35d07f"
  tool-fret: "#9b6bff"
  tool-kana: "#ff4f9a"
  tool-lol: "#22c3d6"
typography:
  display:
    fontFamily: "Bricolage Grotesque, Hanken Grotesk, Arial, sans-serif"
    fontSize: "clamp(56px, 11vw, 132px)"
    fontWeight: 800
    lineHeight: 0.86
    letterSpacing: "-0.02em"
    fontVariation: "'wdth' 75"
  headline:
    fontFamily: "Bricolage Grotesque, Hanken Grotesk, Arial, sans-serif"
    fontSize: "clamp(40px, 5.4vw, 84px)"
    fontWeight: 800
    lineHeight: 0.98
    letterSpacing: "-0.02em"
    fontVariation: "'wdth' 75"
  title:
    fontFamily: "Bricolage Grotesque, Hanken Grotesk, Arial, sans-serif"
    fontSize: "clamp(36px, 4vw, 56px)"
    fontWeight: 800
    lineHeight: 1
    fontVariation: "'wdth' 75"
  button:
    fontFamily: "Bricolage Grotesque, Hanken Grotesk, Arial, sans-serif"
    fontSize: "17px"
    fontWeight: 800
    letterSpacing: "0.02em"
    fontVariation: "'wdth' 85"
  body:
    fontFamily: "Hanken Grotesk, Helvetica Neue, Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  lead:
    fontFamily: "Hanken Grotesk, Helvetica Neue, Arial, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Hanken Grotesk, Helvetica Neue, Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 700
    letterSpacing: "0.08em"
rounded:
  none: "0"
  screen: "6px"
  round: "50%"
spacing:
  page: "clamp(20px, 4.4vw, 72px)"
  room: "20px"
  xs: "4px"
  sm: "12px"
  md: "18px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.tool-lab}"
    textColor: "{colors.ground}"
    typography: "{typography.button}"
    rounded: "{rounded.none}"
    padding: "11px 18px 11px 20px"
  chip:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "4px 12px"
    height: "36px"
  chip-on:
    backgroundColor: "{colors.tool-lab}"
    textColor: "{colors.ground}"
    rounded: "{rounded.none}"
  select:
    backgroundColor: "{colors.lcd-well}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "4px 30px 4px 10px"
    height: "40px"
  nav-link:
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    padding: "4px 0"
  band:
    backgroundColor: "{colors.tool-lab}"
    textColor: "{colors.ground}"
    typography: "{typography.display}"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "18px 24px 24px"
---

# Design System: Ben Voet

## Overview

**Creative North Star: "The Loud Label Catalogue"**

The site is a record label's catalogue turned up loud. Every tool is a numbered release (BV 01 to BV 06) with one saturated colour of its own, set against a near-black ground with warm off-white ink. Colour is not decoration on a card; it is a field. On the landing page the active release floods a big plate with its colour and the live art is printed on it in black, with print grain over the top. On each tool page the same colour floods the title band across the full width, and then recurs only where something is on, pressed or in focus.

Type carries the volume. Bricolage Grotesque at weight 800, pulled to its 75% width and set in uppercase, does the shouting: release names, band titles, buttons, readouts. Hanken Grotesk does the talking at a calm 16px. Everything else is square, flat and quiet so the colour floods and the big type can be loud without competing.

The world rejects the dark dev-portfolio card grid, the skeuomorphic hardware rack, and the quiet pale catalogue. Motion lives inside the plates (a waveform morph, covers drifting, a needle settling, a scale playing note by note, kana flipping) and stops completely under reduced motion.

**Key Characteristics:**
- Near-black ground, off-white ink, one saturated colour per tool.
- Colour as a full flood printed in black, not as a gradient or glow.
- Bricolage Grotesque 800, condensed, uppercase for everything loud; Hanken Grotesk for running text.
- Square corners everywhere; circles only for LEDs, dots and portraits.
- Flat surfaces separated by tone and 1px rules, not shadows.
- Live, looping art inside plates; nothing moves under reduced motion.

## Colors

A neutral near-black stage carrying six saturated catalogue colours, one per tool, plus a semantic good/bad pair.

### Primary (the catalogue colours)
Each page has exactly one active catalogue colour, exposed as `--c`. On the landing page each entry sets it inline; on tool pages the `<body>` carries a `t-<tool>` class.
- **Signal Orange** (tool-lab): Synth Lab, BV 01. Also the landing page's default and the now-playing accent.
- **Songbook Mustard** (tool-songx): SongX, BV 02.
- **Needle Green** (tool-tuner): Tuner, BV 03.
- **Fret Violet** (tool-fret): Fretboard, BV 04.
- **Kana Pink** (tool-kana): Kana, BV 05.
- **Rift Cyan** (tool-lol): Matchups, BV 06.

### Neutral
- **Stage Black** (ground): the page background, and the "black" every flood is printed in (text, strokes and art on a colour field use this, never pure #000).
- **Panel Charcoal** (surface): tool panels, cards, the device face.
- **Raised Charcoal** (surface-2): chips at rest, hover cards, meta rows.
- **Warm Paper** (ink): primary text.
- **Dust Grey** (muted): secondary text, leads, inactive nav links, captions.
- **Ash Grey** (faint): catalogue numbers at rest, credit labels, footer.
- **Hairline** (rule): 1px section dividers and progress tracks.
- **Edge Grey** (edge): 1px control borders (chips, selects), unlit LEDs.
- **LCD Well** (lcd-well): the inset background of selects and instrument readouts.

### Semantic
- **Good** (good): correct answers, in-tune, success. It shares its hex with the Tuner colour; on the tuner page that is intended.
- **Bad** (bad): wrong answers, errors, out-of-tune.

### Named Rules
**The One Colour Per Page Rule.** A page shows one catalogue colour at a time. Tool pages set it with a `t-<tool>` class on `<body>`; the site bar's links each carry their own `t-<tool>` class so hovering a link previews that tool's colour. Never mix two catalogue colours in one component.

**The Flood Rule.** The catalogue colour is used as a solid field (title band, landing plate, primary button, active chip, phone index sleeve) with Stage Black printed on it. Outside a field it appears only as small state marks: the 2px active underline in the site bar, the 3px top edge of a tool panel, focus rings, LCD readout text, link text. No gradients of it, no tinted glows as decoration.

**The Body-Scoped Mapping Rule.** `--c` is set on `<body>` (by `t-<tool>`), so any page-level token that references `var(--c)` (for example `--lcd-fg`, `--accent`, `--chord-color`) must be declared on `body`, not `:root`. Declared on `:root` it resolves against the default orange and every tool turns orange.

## Typography

**Display Font:** Bricolage Grotesque (with Hanken Grotesk, Arial, sans-serif), loaded with its width axis and always set at `font-stretch: 75%` (85% for buttons and the now-playing track).
**Body Font:** Hanken Grotesk (with Helvetica Neue, Arial, sans-serif).
**Script and mono faces (scoped):** Klee One, Noto Sans JP and DotGothic16 for Japanese glyphs on Kana (the Latin faces have no kana); Anonymous Pro for chord and tab text in SongX.

**Character:** A condensed, heavy grotesque shouting in caps over a friendly, open grotesque that reads quietly. The contrast in weight and width is the hierarchy.

### Hierarchy
- **Display** (800, 75% width, clamp 56 to 132px, line-height 0.86, uppercase): the tool page title inside the colour band.
- **Headline** (800, 75% width, clamp 40 to 84px, line-height 0.98, uppercase, no wrap on desktop): the release names in the landing index.
- **Title** (800, 75% width, clamp 36 to 56px, line-height 1, uppercase): section titles such as the credits; the 20 to 22px brand mark in the site bar uses the same face with +0.02em tracking.
- **Button** (800, 85% width, 17 to 19px, +0.02 to 0.04em, uppercase): solid colour buttons.
- **Body** (400, 16px, line-height 1.5; tool pages 1.45): running text, plate descriptions held to 58ch, band leads to 60ch.
- **Lead** (400, 17px, line-height 1.45, muted, max 34ch): the one-line intro under the name.
- **Label** (700, 12 to 13px, +0.08 to 0.1em, uppercase): nav links, catalogue numbers, field labels, captions, credit terms.

### Named Rules
**The Two Voices Rule.** Anything loud (names, titles, buttons, readouts) is Bricolage 800 condensed uppercase; anything read (sentences, descriptions, labels) is Hanken. There is no middle weight of display type.

**The Condensed Always Rule.** Bricolage never appears at its default width. If it is on the page, it is at 75% (or 85% for small button and track text).

## Layout

The landing page runs edge to edge with a fluid side gutter (`page`, clamp 20 to 72px). Desktop splits into two halves: a lead and a stacked index of six huge names on the left, the active plate (a tall colour field, clamp 320px to 640px or 62vh) absolutely placed on the right with caption, description and an Open button below. Credits follow as liner notes in the same two-column split, separated by a 1px rule.

At 860px and below the landing index becomes a stack of colour sleeves: each release is a 112px-tall flood of its own colour, name in black, one-liner shown, with a small 104px plate still running at the right edge. Nothing is hidden behind hover on phones.

Tool pages sit in a centred `room` (max 1100px, 20px side padding). The site bar (brand left, tool switcher right) leads, then the colour band bleeds to the full viewport width with the title, catalogue number top right, and lead. Tool panels follow. At 600px the site bar stacks and the switcher wraps.

Spacing is loose and rhythmic rather than gridded: 4px for tight gaps, 12px, 18px and 24px for component spacing, and large clamped gaps (72 to 140px) between landing sections.

## Elevation & Depth

The system is flat. Depth comes from tone (ground, surface, surface-2), 1px rules and edges, and above all from colour floods sitting on the black ground. There are no resting card shadows.

### Shadow Vocabulary
- **Float** (`box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45)`): floating layers only, such as SongX popovers and hover panels.
- **LCD inset** (`box-shadow: inset 0 0 22px rgba(0, 0, 0, 0.8), 0 1px 0 rgba(255, 255, 255, 0.08)`): instrument readout screens only (tuner, fretboard, kana); it reads as a recessed display, not a lifted card.

### Named Rules
**The Flat Stage Rule.** Surfaces are flat at rest. A shadow is allowed only for something that genuinely floats above the page or a readout that is recessed into a panel.

**The Print Grain Rule.** Texture belongs to the landing plates: an SVG fractal-noise grain at 0.4 opacity, multiplied over the flood. Photographs on a flood become duotones by grayscale plus multiply. Grain is not applied to panels or page backgrounds.

## Shapes

Square. Buttons, chips, selects, panels, bands and plates all have 0 radius. Circles (50%) are reserved for LEDs, fretboard note dots, needle hubs and champion portraits. The one rounded rectangle is the instrument readout screen (6px), which stays a recessed display. Borders are 1px in Edge Grey on controls and 1px Hairline between sections; the only thick lines are state marks in the catalogue colour (2px underline, 3px panel top edge).

## Components

### Buttons
Solid colour blocks with black condensed caps.
- **Shape:** square (0).
- **Primary:** catalogue colour fill, Stage Black text, Bricolage 800 at 85% to 75% width, 17 to 19px uppercase; the landing Open button pads 11px 18px 11px 20px with a drawn arrow, the tool power button is 48px tall with 22px side padding and an inset black LED.
- **Hover / Focus:** the arrow slides 4px right; the power button brightens 8%. Focus is a 2px ring in the catalogue colour offset 2 to 4px.
- **Active:** the button presses down 2px.

### Chips
- **Style:** square, Raised Charcoal fill, 1px Edge Grey border, muted 13px bold uppercase label, 36px tall.
- **State:** hover lifts the text to ink and the border to muted; on/pressed fills solid with the catalogue colour and black text. Active nudges 1px down.

### Cards / Containers (tool panel)
- **Corner Style:** square.
- **Background:** Panel Charcoal.
- **Shadow Strategy:** none (see Elevation).
- **Border:** a 3px top edge in the catalogue colour.
- **Internal Padding:** 18px 24px 24px (14px on phones).
- A muted uppercase label row with an LED and the model name in the catalogue colour opens each panel.

### Inputs / Fields
- **Style:** selects are square, 40px tall, LCD Well background, 1px Edge Grey border, Bricolage 700 at 19px condensed, with a chevron drawn in the catalogue colour.
- **Label:** 12px bold uppercase muted, 4px above.
- **Focus:** 2px catalogue-colour outline; hover lifts the border to muted.

### Navigation (site bar)
- Brand left in Bricolage 800 condensed uppercase at 20px; tool switcher right as 13px bold uppercase Hanken links with 18px gaps, scrolling horizontally without a scrollbar.
- Rest is muted; hover and focus turn the link its own tool's colour; the current page is ink with a 2px underline in its colour.
- Below 600px the bar stacks and the switcher wraps.

### Colour Band (signature)
The page title of every tool page: a full-bleed flood of the catalogue colour (bled with a 100vmax spread clipped horizontally so it never causes page scroll), the Display title in Stage Black, the catalogue number (BV 0x) at the top right in 13px bold label type, and a 60ch lead in Hanken 500.

### Release Entry and Plate (signature, landing)
Each release is a catalogue number plus a Headline name. Hover or focus recolours the entry and sweeps its plate in from the left with a clip-path wipe (600ms, `cubic-bezier(0.16, 1, 0.3, 1)`); the plate itself crossfades over 260ms. The plate is a colour field with live art drawn in black, print grain, a caption row (one-liner in the colour, specs in muted label type), a description and the primary Open button.

### Instrument Readout
Recessed screens on the instrument tools: LCD Well background with a faint 16px grid in the catalogue colour, 6px radius, the LCD inset shadow, readout text in Bricolage condensed in the catalogue colour.

## Do's and Don'ts

### Do:
- **Do** give every new tool page a `t-<tool>` class on `<body>` and link `css/site.css` for the tokens, site bar and colour band.
- **Do** declare any token that references `var(--c)` on `body`, never on `:root`.
- **Do** print on a colour flood in Stage Black (#111214), not pure black or white.
- **Do** set every display use of Bricolage Grotesque at weight 800, 75% width, uppercase.
- **Do** keep buttons, chips, selects and panels square (0 radius).
- **Do** use the catalogue colour for focus rings (2px solid) on every interactive element.
- **Do** use `cubic-bezier(0.16, 1, 0.3, 1)` for state transitions (160 to 260ms for colour and opacity, 600ms for the plate wipe).
- **Do** stop all animation and transitions under `prefers-reduced-motion: reduce`.
- **Do** use --good and --bad for right/wrong and in/out of tune, not a catalogue colour.

### Don't:
- **Don't** show two catalogue colours inside one component, or use another tool's colour as chrome (band, button, chip, focus) on a tool's page; the site switcher's hover preview is the exception, and data-coding hues such as the Matchups per-champion colours are content, not chrome.
- **Don't** use gradients, glows or tints of the catalogue colour as decoration; it is a solid flood or a small state mark.
- **Don't** add resting drop shadows to cards or panels.
- **Don't** round buttons, chips, panels or bands, or use pill shapes.
- **Don't** set Bricolage Grotesque at its default width or below weight 700.
- **Don't** load fonts or scripts from anywhere but Google Fonts.
