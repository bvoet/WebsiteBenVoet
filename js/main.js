import { AudioEngine } from './engine/audio-engine.js';
import { INSTRUMENTS, byId } from './synths/index.js';
import { FX_LAYOUT, defaultParams, sanitizePatch, diffPatch } from './synths/params.js';
import { Control } from './ui/control.js';
import { Selector } from './ui/selector.js';
import { WaveEditor } from './ui/wave-editor.js';
import { PianoKeyboard, ComputerKeys } from './ui/keyboard.js';
import { Scope } from './ui/scope.js';
import { midiSupported, connectMidi } from './ui/midi.js';
import { SequencerPanel } from './ui/sequencer.js';
import { Transport, sanitizePattern, emptyDrums, emptyMelodic, patternIsEmpty } from './seq/transport.js';
import {
  loadUserPresets, saveUserPresets, encodeShare, decodeShare,
  loadPattern, savePattern, loadLastInstrument, saveLastInstrument,
} from './ui/presets.js';
import { noteName } from './ui/format.js';

const $ = (sel) => document.querySelector(sel);

const engine = new AudioEngine();

// ─── Per-instrument state ─────────────────────────────────────────────────

/** id → { def, synth, presetName, modified, userPresets, track } */
const instruments = new Map();

function defaultPattern(def) {
  if (!def.drums) return emptyMelodic();
  // A simple groove so DR-5 does something the first time you press Play.
  const p = emptyDrums();
  for (const i of [0, 8, 10]) p.rows[0][i] = 1; // kick
  for (const i of [4, 12]) p.rows[2][i] = 2; // snare (accented)
  for (let i = 0; i < 16; i += 2) p.rows[6][i] = i % 4 ? 1 : 2; // closed hat
  p.rows[10][14] = 1; // open hat
  return p;
}

for (const def of INSTRUMENTS) {
  const stored = loadPattern(def.id);
  const pattern = stored ? sanitizePattern(stored, !!def.drums) : defaultPattern(def);
  instruments.set(def.id, {
    def,
    synth: def.create(),
    presetName: def.PRESETS[0].name,
    modified: false,
    userPresets: loadUserPresets(def.id),
    track: { id: def.id, drums: !!def.drums, pattern },
  });
}

let cur = null; // current instrument state

/** The instrument's engine object, attached to the audio graph if possible. */
function getSynth(id, attach = true) {
  const s = instruments.get(id);
  if (!s) return null;
  if (!s.synth.ctx && attach && engine.ctx) {
    s.synth.attach(engine);
    s.synth.onVoiceCount = (n) => {
      if (s === cur) {
        uiState.voices = n;
        renderStatus();
      }
    };
  }
  return s.synth.ctx ? s.synth : null;
}

// ─── Panel ────────────────────────────────────────────────────────────────

let controls = new Map();
const paramSection = new Map();

function buildPanel() {
  const panel = $('#panel');
  panel.innerHTML = '';
  controls = new Map();
  paramSection.clear();
  const { def, synth } = cur;

  for (const sec of [...def.LAYOUT, ...FX_LAYOUT]) {
    const el = document.createElement('section');
    el.className = `module${sec.wide ? ' module--wide' : ''}`;
    el.setAttribute('aria-label', sec.title);
    const h = document.createElement('h2');
    h.className = 'module__title';
    h.textContent = sec.title;
    const selects = document.createElement('div');
    selects.className = 'module__selects';
    const body = document.createElement('div');
    body.className = 'module__body';

    for (const key of sec.keys) {
      const pd = def.PARAMS[key];
      const ctlDef = { ...pd, ariaLabel: pd.ariaLabel || `${sec.title} ${pd.label}` };
      paramSection.set(key, sec.title);
      const onChange = (v) => {
        synth.set(key, v);
        markModified();
      };
      const Cls = pd.type === 'select' ? Selector : pd.type === 'wave' ? WaveEditor : Control;
      const ctl = new Cls(ctlDef, synth.params[key], onChange, onTouch);
      ctl.key = key;
      controls.set(key, ctl);
      (pd.type === 'select' ? selects : body).append(ctl.el);
    }
    el.append(h);
    if (selects.children.length) el.append(selects);
    el.append(body);
    panel.append(el);
  }
}

// ─── Instrument tabs & switching ──────────────────────────────────────────

const tabs = $('#rack-tabs');
for (const def of INSTRUMENTS) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'rack-tab';
  b.dataset.id = def.id;
  b.innerHTML = `<b>${def.model}</b> ${def.name}`;
  b.addEventListener('click', () => switchInstrument(def.id));
  tabs.append(b);
}

function switchInstrument(id, { keepHash = false } = {}) {
  const next = instruments.get(id);
  if (!next || next === cur) return;
  if (cur) {
    releaseHeld();
    cur.synth.setSustain(false); // a pedal-up would otherwise go to the new instrument
    cur.synth.allNotesOff();
  }
  cur = next;
  saveLastInstrument(id);

  for (const b of tabs.children) {
    const on = b.dataset.id === id;
    b.classList.toggle('is-active', on);
    if (on) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  }
  $('#brand-model').textContent = cur.def.model;
  $('#brand-sub').textContent = cur.def.subtitle;
  $('.synth').setAttribute('aria-label', `${cur.def.model} ${cur.def.subtitle}`);
  document.title = `${cur.def.model} ${cur.def.name} — Synth Lab — Ben Voet`;

  getSynth(id); // attach now if audio is already running
  uiState.voices = cur.synth.activeVoices;
  buildPanel();
  renderPresetList();
  renderPresetName();
  piano.setLabels(cur.def.drums ? (n) => cur.def.KIT[n % 12].short : null);
  seq.setInstrument(cur.def);
  renderStatus();
  if (!keepHash && location.hash) history.replaceState(null, '', location.pathname + location.search);
  flash(`${cur.def.model} ${cur.def.name}`.toUpperCase());
}

// ─── LCD ──────────────────────────────────────────────────────────────────

const lcd = { preset: $('#lcd-preset'), param: $('#lcd-param'), status: $('#lcd-status') };
const uiState = { midiNames: null, voices: 0 };

function onTouch(ctl) {
  const label = ctl.def.label.replace('→ ', '>');
  showParam(`${shortSection(paramSection.get(ctl.key) || '')} ${label}`, ctl.text);
}

function shortSection(s) {
  return s
    .toUpperCase()
    .replace('OSCILLATOR ', 'OSC')
    .replace('MODULATOR ', 'MOD')
    .replace(/(\w)\w* ENV$/, '$1.ENV')
    .replace('HATS & CYMBAL', 'HATS')
    .replace('PITCH & FILTER', 'P/F');
}

function showParam(name, value) {
  lcd.param.innerHTML = '';
  const a = document.createElement('span');
  a.textContent = name.toUpperCase();
  const b = document.createElement('span');
  b.className = 'lcd__val';
  b.textContent = value;
  lcd.param.append(a, b);
}

function flash(msg) {
  showParam(msg, '');
}

function renderPresetName() {
  lcd.preset.textContent = `${cur.presetName}${cur.modified ? ' *' : ''}`;
}

function renderStatus() {
  if (!cur) return;
  const midi = uiState.midiNames == null ? '' : uiState.midiNames.length ? ' MIDI●' : ' MIDI○';
  const [lo] = keys.range;
  const play = transport.playing ? `  ▶${Math.round(transport.bpm)}` : '';
  const arp = transport.arp.enabled ? '  ARP' : '';
  lcd.status.textContent = `OCT ${noteName(lo)}  VEL ${Math.round(keys.velocity * 100)}  VOX ${uiState.voices}${midi}${cur.synth.sustain ? '  SUS' : ''}${arp}${play}`;
}

function markModified() {
  if (!cur.modified) {
    cur.modified = true;
    renderPresetName();
  }
}

// ─── Audio start / power ──────────────────────────────────────────────────

const powerBtn = $('#power');
let poweredAt = -1;

function setPowered(on) {
  document.body.classList.toggle('is-powered', on);
  powerBtn.setAttribute('aria-pressed', String(on));
}

/** Synchronous so a note played as the very first gesture is never lost or stuck. */
function ensureAudio() {
  if (engine.running) return true;
  try {
    const first = !engine.ctx;
    engine
      .start()
      .then(() => setPowered(true))
      .catch((err) => {
        console.error(err);
        flash('AUDIO BLOCKED');
      });
    if (first) scope.setAnalyser(engine.analyser);
    getSynth(cur.def.id);
    poweredAt = performance.now();
    return true;
  } catch (err) {
    console.error(err);
    flash('AUDIO UNAVAILABLE');
    return false;
  }
}

// Unlock audio on the first gesture anywhere. Some browsers (iOS Safari) only
// accept touchend/click as an unlocking gesture, so keep listening on all of
// them until the context is actually running.
const UNLOCK_EVENTS = ['pointerdown', 'keydown', 'touchend', 'click'];
const unlock = () => {
  ensureAudio();
  engine.ctx?.resume().then(() => {
    if (engine.running) UNLOCK_EVENTS.forEach((t) => window.removeEventListener(t, unlock, true));
  });
};
UNLOCK_EVENTS.forEach((t) => window.addEventListener(t, unlock, true));

powerBtn.addEventListener('click', async () => {
  // If this very click just switched audio on, don't immediately switch it off.
  if (performance.now() - poweredAt < 600) return;
  if (engine.running) {
    allOff();
    if (transport.playing) seq.togglePlay();
    await engine.stop();
    setPowered(false);
    flash('POWER OFF');
  } else {
    ensureAudio();
  }
});

// ─── Notes ────────────────────────────────────────────────────────────────
// Every note source (mouse, computer keys, MIDI) goes through these two.

function noteOn(note, vel) {
  piano.light(note, true);
  if (!ensureAudio()) return;
  const synth = getSynth(cur.def.id);
  if (seq.rec) seq.record(note, vel);
  if (transport.arp.enabled && !cur.def.drums) {
    transport.arp.press(note, vel);
    transport.wakeArp();
  } else {
    synth.noteOn(note, vel);
  }
  const label = cur.def.drums ? cur.def.KIT[note % 12].name.toUpperCase() : `NOTE ${noteName(note)}`;
  showParam(label, `VEL ${Math.round(vel * 127)}`);
}

function noteOff(note) {
  piano.light(note, false);
  if (transport.arp.enabled && !cur.def.drums) {
    transport.arp.release(note);
    return;
  }
  cur.synth.noteOff(note);
}

/** Let go of everything the player is holding (not the sequencer). */
function releaseHeld() {
  piano.releaseAll();
  keys.releaseAll();
  const arp = transport.arp;
  arp.down.clear();
  if (!arp.latch) arp.notes = [];
}

function allOff() {
  releaseHeld();
  cur.synth.allNotesOff();
}

const piano = new PianoKeyboard($('#piano'), { lo: 36, hi: 84, onNoteOn: noteOn, onNoteOff: noteOff });

const keys = new ComputerKeys({
  onNoteOn: noteOn,
  onNoteOff: noteOff,
  onOctave: () => {
    piano.markRange(...keys.range);
    revealRange('smooth');
    renderStatus();
  },
  onSustain: (on) => {
    cur.synth.setSustain(on);
    renderStatus();
  },
});
piano.markRange(...keys.range);

// On narrow screens, keep the computer-keyboard range in view.
function revealRange(behavior = 'auto') {
  const scroller = $('.kbd-scroll');
  const first = $('#piano .key.in-range');
  if (!scroller || !first || scroller.scrollWidth <= scroller.clientWidth) return;
  scroller.scrollTo({ left: first.offsetLeft - 24, behavior });
}
requestAnimationFrame(() => revealRange());
let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => revealRange(), 150);
});

// Never leave notes hanging when the page loses focus.
window.addEventListener('blur', () => {
  allOff();
  for (const s of instruments.values()) s.synth.setSustain(false);
  renderStatus();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) allOff();
});

$('#oct-down').addEventListener('click', () => keys.shiftOctave(-1));
$('#oct-up').addEventListener('click', () => keys.shiftOctave(1));
$('#panic').addEventListener('click', () => {
  releaseHeld();
  transport.arp.clear();
  if (transport.playing) seq.togglePlay();
  for (const s of instruments.values()) s.synth.panic();
  renderStatus();
  flash('ALL NOTES OFF');
});

// Performance wheels
const bend = new Control(
  { label: 'Bend', min: -1, max: 1, def: 0, kind: 'wheel', bipolar: true, spring: true, format: (v) => `${v > 0 ? '+' : ''}${(v * 2).toFixed(2)} st` },
  0,
  (v) => cur.synth.setPitchBend(v),
);
const mod = new Control({ label: 'Mod', min: 0, max: 1, def: 0, kind: 'wheel', format: (v) => `${Math.round(v * 100)}%` }, 0, (v) => cur.synth.setModWheel(v));
$('#wheels').append(bend.el, mod.el);

// ─── Sequencer ────────────────────────────────────────────────────────────

const transport = new Transport({
  // Use the context as soon as it exists: events scheduled while it is still
  // resuming simply play once it runs (so the very first Play click works).
  getCtx: () => engine.ctx,
  getTracks: () => [...instruments.values()].map((s) => s.track),
  resolve: (id, attach) => getSynth(id, attach),
  getCurrent: () => getSynth(cur.def.id),
  onStep: (s, t) => {
    seq.onStep(s, t, engine.ctx ? engine.ctx.currentTime : 0);
    if (s < 0) renderStatus();
  },
});

let saveTimer = 0;
const seq = new SequencerPanel($('#seq'), {
  transport,
  instruments: INSTRUMENTS,
  getTrack: (id) => instruments.get(id).track,
  onPatternChange: () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      for (const [id, s] of instruments) savePattern(id, s.track.pattern);
    }, 300);
  },
  preview: (note, vel) => {
    const s = getSynth(cur.def.id);
    if (!s) return;
    s.noteOn(note, vel);
    s.noteOff(note, s.ctx.currentTime + 0.25);
  },
  ensureAudio,
  flash: (m) => {
    flash(m);
    renderStatus();
  },
  onArpChange: () => {
    allOff();
    renderStatus();
    flash(transport.arp.enabled ? 'ARP ON' : 'ARP OFF');
  },
});

// ─── Scope ────────────────────────────────────────────────────────────────

const scope = new Scope($('#scope'));
$('#scope-mode').addEventListener('click', (e) => {
  const m = scope.toggleMode();
  e.currentTarget.textContent = m === 'scope' ? 'Scope' : 'Spectrum';
  e.currentTarget.setAttribute('aria-label', `Display mode: ${m}`);
});

// ─── MIDI ─────────────────────────────────────────────────────────────────

const midiBtn = $('#midi');
if (!midiSupported) {
  midiBtn.disabled = true;
  midiBtn.title = 'Web MIDI is not supported in this browser (try Chrome, Edge or Firefox)';
} else {
  midiBtn.addEventListener('click', async () => {
    try {
      await connectMidi({
        noteOn,
        noteOff,
        pitchBend: (v) => {
          cur.synth.setPitchBend(v);
          bend.set(v, false);
        },
        modWheel: (v) => {
          cur.synth.setModWheel(v);
          mod.set(v, false);
        },
        sustain: (on) => {
          cur.synth.setSustain(on);
          renderStatus();
        },
        allOff,
        onDevices: (names) => {
          uiState.midiNames = names;
          midiBtn.classList.toggle('is-on', names.length > 0);
          flash(names.length ? `MIDI: ${names[0]}` : 'NO MIDI DEVICES');
          renderStatus();
        },
      });
    } catch {
      flash('MIDI ACCESS DENIED');
    }
  });
}

// ─── Presets ──────────────────────────────────────────────────────────────

const presetSel = $('#preset');

function renderPresetList(selectValue = 'f:0') {
  presetSel.innerHTML = '';
  const fac = document.createElement('optgroup');
  fac.label = 'Factory';
  cur.def.PRESETS.forEach((p, i) => fac.append(new Option(p.name, `f:${i}`)));
  presetSel.append(fac);
  if (cur.userPresets.length) {
    const usr = document.createElement('optgroup');
    usr.label = 'User';
    cur.userPresets.forEach((p, i) => usr.append(new Option(p.name, `u:${i}`)));
    presetSel.append(usr);
  }
  const want = cur.selected ?? selectValue;
  presetSel.value = [...presetSel.options].some((o) => o.value === want) ? want : 'f:0';
  $('#preset-del').hidden = !presetSel.value.startsWith('u:');
}

function applyPatch(patch, name) {
  const p = sanitizePatch(cur.def.PARAMS, patch);
  cur.synth.load(p);
  for (const [k, ctl] of controls) ctl.set(p[k], false);
  cur.presetName = name;
  cur.modified = false;
  renderPresetName();
  flash(`LOAD ${name}`);
}

function selectPreset(value) {
  const [kind, idx] = value.split(':');
  const list = kind === 'u' ? cur.userPresets : cur.def.PRESETS;
  const entry = list[Number(idx)];
  if (!entry) return;
  cur.selected = value;
  applyPatch(entry.patch, entry.name);
  $('#preset-del').hidden = kind !== 'u';
  history.replaceState(null, '', location.pathname + location.search);
}

presetSel.addEventListener('change', () => {
  selectPreset(presetSel.value);
  presetSel.blur(); // hand the keyboard back to playing
});

function stepPreset(d) {
  const opts = [...presetSel.options];
  const i = opts.findIndex((o) => o.value === presetSel.value);
  const next = opts[(i + d + opts.length) % opts.length];
  presetSel.value = next.value;
  selectPreset(next.value);
}
$('#preset-prev').addEventListener('click', () => stepPreset(-1));
$('#preset-next').addEventListener('click', () => stepPreset(1));

// Save (inline name field, no modal dialogs)
const saveForm = $('#save-form');
const saveName = $('#save-name');
$('#preset-save').addEventListener('click', () => {
  saveForm.hidden = false;
  saveName.value = cur.presetName;
  saveName.focus();
  saveName.select();
});
saveForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = saveName.value.trim().slice(0, 32) || 'Untitled';
  const patch = diffPatch(cur.synth.params, defaultParams(cur.def.PARAMS));
  const list = cur.userPresets;
  const existing = list.findIndex((p) => p.name === name);
  if (existing >= 0) list[existing] = { name, patch };
  else list.push({ name, patch });
  const ok = saveUserPresets(cur.def.id, list);
  cur.selected = `u:${existing >= 0 ? existing : list.length - 1}`;
  renderPresetList();
  cur.presetName = name;
  cur.modified = false;
  renderPresetName();
  saveForm.hidden = true;
  flash(ok ? `SAVED ${name}` : 'SAVED (THIS SESSION ONLY)');
});
saveForm.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') saveForm.hidden = true;
});
$('#save-cancel').addEventListener('click', () => (saveForm.hidden = true));

// Delete user preset: two-step confirm on the button itself.
const delBtn = $('#preset-del');
let delTimer = 0;
delBtn.addEventListener('click', () => {
  if (!delBtn.classList.contains('is-confirm')) {
    delBtn.classList.add('is-confirm');
    delBtn.textContent = 'Sure?';
    delTimer = setTimeout(() => {
      delBtn.classList.remove('is-confirm');
      delBtn.textContent = 'Del';
    }, 2500);
    return;
  }
  clearTimeout(delTimer);
  delBtn.classList.remove('is-confirm');
  delBtn.textContent = 'Del';
  const [, idx] = presetSel.value.split(':');
  const [removed] = cur.userPresets.splice(Number(idx), 1);
  saveUserPresets(cur.def.id, cur.userPresets);
  cur.selected = 'f:0';
  renderPresetList();
  selectPreset('f:0');
  flash(`DELETED ${removed?.name || ''}`);
});

// Share link: patch + (if any) this instrument's sequencer pattern
$('#share').addEventListener('click', async () => {
  const patch = diffPatch(cur.synth.params, defaultParams(cur.def.PARAMS));
  const { pattern, drums } = cur.track;
  const hash = encodeShare(cur.def.id, cur.presetName, patch, patternIsEmpty(pattern, drums) ? null : pattern);
  history.replaceState(null, '', hash);
  try {
    await navigator.clipboard.writeText(location.href);
    flash('LINK COPIED');
  } catch {
    flash('LINK IN ADDRESS BAR');
  }
});

// ─── Boot ─────────────────────────────────────────────────────────────────

const ids = INSTRUMENTS.map((d) => d.id);
const shared = decodeShare(location.hash, ids);
const last = loadLastInstrument();
switchInstrument(shared?.id || (byId(last) ? last : INSTRUMENTS[0].id), { keepHash: true });

if (shared) {
  applyPatch(shared.patch, shared.name);
  if (shared.pattern) {
    Object.assign(cur.track.pattern, sanitizePattern(shared.pattern, cur.track.drums));
    seq.refresh();
  }
  flash('SHARED PATCH LOADED');
} else {
  showParam('CLICK OR PLAY', 'TO START');
}
renderStatus();

// Expose for debugging in the console.
window.synthLab = {
  engine,
  transport,
  get synth() {
    return cur.synth;
  },
  get current() {
    return cur.def.id;
  },
  switchTo: switchInstrument,
  instruments,
};
