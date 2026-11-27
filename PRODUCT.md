# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Ben himself and his friends. They come back to use a specific tool: look up a Neil Young song in SongX, tune a guitar, check a top-lane matchup, drill kana, or play with Synth Lab. They aren't arriving cold to be persuaded. They want to reach the tool they came for quickly. Ben is an experienced guitarist (12+ years) and knows synth terminology, so labels can use proper music and synth language without explaining it.

## Product Purpose

benvoet.be is Ben's personal site: a home for the browser instruments and music tools he builds. The landing page works as a launcher and a showcase of what's there. Each tool is a standalone page. Success: getting from the landing page into a tool takes one obvious click, and the site feels like one hand-built thing, not a pile of separate projects.

## Positioning

Every tool is hand-built by a guitarist for his own use, with plain HTML, CSS and the Web Audio API: real synthesis, a working tuner, a songbook Ben writes himself. The site is a personal studio, not a portfolio template.

## Operating Context

- Pages: landing (`/`), Synth Lab (`/lab/`), SongX (`/songx/`), Top Lane Matchups (`/lol/`), Tuner (`/tuner/`), Fretboard (`/fretboard/`), Kana (`/kana/`).
- Used on desktop and on a phone, e.g. the tuner and SongX next to a guitar.
- Synth Lab is played with mouse, computer keyboard or a MIDI controller.
- The landing hero shows what Ben is listening to right now (Spotify through a Cloudflare Worker, Last.fm as fallback).

## Capabilities and Constraints

- Plain HTML, CSS and ES-module JS. No framework, bundler or npm dependencies.
- Relative paths only. It must work at benvoet.be and under `bvoet.github.io/WebsiteBenVoet/`.
- Google Fonts is the only allowed external font/CDN source. Image exceptions are listed in `.claude/CLAUDE.md` (Data Dragon, Cover Art Archive, Spotify/Last.fm covers).
- The landing page themes (Studio, Win 95, Terminal, Vapor) were dropped in the 2026-11 redesign (Ben's decision). One look for the whole site.
- The webring, 88x31 buttons and the "Built with plain HTML" footer line were removed from the landing page at Ben's request (2026-11-27). Keep `images/buttons/benvoet.png` online: other sites may still hotlink it.
- Tool functionality, data and copy are product truth and must be kept: SongX data, LoL tips with their credit and Riot notice, kana data, tuner behaviour, Synth Lab instruments and share links.

## Brand Commitments

- Name: Ben Voet, domain benvoet.be.
- Visual identity: **bold**. Rejected so far (2026-11-27): the stacked rack-unit look, and a pale minimal label-catalogue ("way too sleek, boring as hell"). Ben wants bold: colour, expressive type, moving parts. Not boring, not stacked boxes.
- All pages must read as one site. Today each tool looks like a different site.

## Evidence on Hand

- Real content: SongX songbook (625+ songs, album covers), Ben's gear (Epiphone Les Paul Standard, Fender American Vintage II Telecaster Thinline, Valeton GP-200, Vox Pathfinder 15), GitHub `github.com/bvoet`.
- No testimonials, clients, press or bio copy yet. Don't invent any. About/projects pages come later, with content Ben supplies.

## Product Principles

1. Tools first: the site exists to reach and use the tools. Decoration never slows that down.
2. One instrument, many modules: every page belongs to the same studio and shares one system.
3. Hand-built and honest: show real things (real gear, real songs, real sound), never filler.
4. Plain web: no framework, nothing that breaks the static, relative-path deploy.
