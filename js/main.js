import { AudioEngine } from './engine/audio-engine.js';
import { SubtractiveSynth, PARAMS, PRESETS, defaultParams, sanitizePatch } from './synths/subtractive.js';
import { Control } from './ui/control.js';
import { Selector } from './ui/selector.js';
import { PianoKeyboard, ComputerKeys } from './ui/keyboard.js';
import { Scope } from './ui/scope.js';
import { midiSupported, connectMidi } from './ui/midi.js';
import { loadUserPresets, saveUserPresets, diffPatch, encodeShare, decodeShare } from './ui/presets.js';
import { noteName } from './ui/format.js';

const $ = (sel) => document.querySelector(sel);

const engine = new AudioEngine();
const synth = new SubtractiveSynth();

// ─── Panel layout ─────────────────────────────────────────────────────────

const LAYOUT = [
  { title: 'Oscillator 1', keys: ['osc1Wave', 'osc1Oct'] },
  { title: 'Oscillator 2', keys: ['osc2Wave', 'osc2Oct', 'osc2Semi', 'osc2Fine'] },
  { title: 'Mixer', keys: ['osc1Level', 'osc2Level', 'noiseLevel'] },
  { title: 'Filter', keys: ['filterType', 'filterSlope', 'cutoff', 'resonance', 'envAmount', 'keyTrack'], wide: true },
  { title: 'Filter Env', keys: ['fAttack', 'fDecay', 'fSustain', 'fRelease'] },
  { title: 'Amp Env', keys: ['aAttack', 'aDecay', 'aSustain', 'aRelease'] },
  { title: 'LFO', keys: ['lfoWave', 'lfoRate', 'lfoPitch', 'lfoFilter', 'lfoAmp'] },
  { title: 'Voice', keys: ['voiceMode', 'glide', 'velocity'] },
  { title: 'Drive', keys: ['drive'] },
  { title: 'Delay', keys: ['delayTime', 'delayFeedback', 'delayMix'] },
  { title: 'Reverb', keys: ['reverbSize', 'reverbMix'] },
  { title: 'Output', keys: ['volume'] },
];

const controls = new Map();
const paramSection = new Map();

function buildPanel() {
  const panel = $('#panel');
  for (const sec of LAYOUT) {
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
      const def = { ...PARAMS[key], ariaLabel: `${sec.title} ${PARAMS[key].label}` };
      paramSection.set(key, sec.title);
      const onChange = (v) => {
        synth.set(key, v);
        markModified();
      };
      const ctl = def.type === 'select' ? new Selector(def, synth.params[key], onChange, onTouch) : new Control(def, synth.params[key], onChange, onTouch);
      ctl.key = key;
      controls.set(key, ctl);
      (def.type === 'select' ? selects : body).append(ctl.el);
    }
    if (selects.children.length) el.append(h, selects, body);
    else el.append(h, body);
    panel.append(el);
  }
}

// ─── LCD ──────────────────────────────────────────────────────────────────

const lcd = {
  preset: $('#lcd-preset'),
  param: $('#lcd-param'),
  status: $('#lcd-status'),
  flashTimer: 0,
};

const state = {
  presetName: 'Init',
  modified: false,
  midiNames: null,
  voices: 0,
};

function onTouch(ctl) {
  const section = paramSection.get(ctl.key) || '';
  const label = ctl.def.label.replace('→ ', '>');
  showParam(`${shortSection(section)} ${label}`, ctl.text);
}

function shortSection(s) {
  return s.replace('Oscillator ', 'OSC').replace('Filter Env', 'F.ENV').replace('Amp Env', 'A.ENV').toUpperCase();
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
  lcd.preset.textContent = `${state.presetName}${state.modified ? ' *' : ''}`;
}

function renderStatus() {
  const midi = state.midiNames == null ? '' : state.midiNames.length ? ' MIDI●' : ' MIDI○';
  const [lo] = keys.range;
  lcd.status.textContent = `OCT ${noteName(lo)}  VEL ${Math.round(keys.velocity * 100)}  VOX ${state.voices}${midi}${synth.sustain ? '  SUS' : ''}`;
}

function markModified() {
  if (!state.modified) {
    state.modified = true;
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
    if (first) {
      synth.attach(engine);
      scope.setAnalyser(engine.analyser);
    }
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
    await engine.stop();
    setPowered(false);
    flash('POWER OFF');
  } else {
    ensureAudio();
  }
});

// ─── Notes ────────────────────────────────────────────────────────────────

function noteOn(note, vel) {
  piano.light(note, true);
  if (!ensureAudio()) return;
  synth.noteOn(note, vel);
  showParam(`NOTE ${noteName(note)}`, `VEL ${Math.round(vel * 127)}`);
}

function noteOff(note) {
  piano.light(note, false);
  synth.noteOff(note);
}

function allOff() {
  piano.releaseAll();
  keys.releaseAll();
  synth.allNotesOff();
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
    synth.setSustain(on);
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
  synth.setSustain(false);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) allOff();
});

synth.onVoiceCount = (n) => {
  state.voices = n;
  renderStatus();
};

$('#oct-down').addEventListener('click', () => keys.shiftOctave(-1));
$('#oct-up').addEventListener('click', () => keys.shiftOctave(1));
$('#panic').addEventListener('click', () => {
  piano.releaseAll();
  keys.releaseAll();
  synth.panic();
  renderStatus();
  flash('ALL NOTES OFF');
});

// Performance wheels
const bend = new Control(
  { label: 'Bend', min: -1, max: 1, def: 0, kind: 'wheel', bipolar: true, spring: true, format: (v) => `${v > 0 ? '+' : ''}${(v * 2).toFixed(2)} st` },
  0,
  (v) => synth.setPitchBend(v),
);
const mod = new Control({ label: 'Mod', min: 0, max: 1, def: 0, kind: 'wheel', format: (v) => `${Math.round(v * 100)}%` }, 0, (v) => synth.setModWheel(v));
$('#wheels').append(bend.el, mod.el);

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
          synth.setPitchBend(v);
          bend.set(v, false);
        },
        modWheel: (v) => {
          synth.setModWheel(v);
          mod.set(v, false);
        },
        sustain: (on) => {
          synth.setSustain(on);
          renderStatus();
        },
        allOff,
        onDevices: (names) => {
          state.midiNames = names;
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
let userPresets = loadUserPresets();

function renderPresetList(selectValue) {
  presetSel.innerHTML = '';
  const fac = document.createElement('optgroup');
  fac.label = 'Factory';
  PRESETS.forEach((p, i) => fac.append(new Option(p.name, `f:${i}`)));
  presetSel.append(fac);
  if (userPresets.length) {
    const usr = document.createElement('optgroup');
    usr.label = 'User';
    userPresets.forEach((p, i) => usr.append(new Option(p.name, `u:${i}`)));
    presetSel.append(usr);
  }
  if (selectValue) presetSel.value = selectValue;
  $('#preset-del').hidden = !presetSel.value.startsWith('u:');
}

function applyPatch(patch, name) {
  const p = sanitizePatch(patch);
  synth.load(p);
  for (const [k, ctl] of controls) ctl.set(p[k], false);
  state.presetName = name;
  state.modified = false;
  renderPresetName();
  flash(`LOAD ${name}`);
}

function selectPreset(value) {
  const [kind, idx] = value.split(':');
  const list = kind === 'u' ? userPresets : PRESETS;
  const entry = list[Number(idx)];
  if (!entry) return;
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
  saveName.value = state.presetName.replace(/ \*$/, '');
  saveName.focus();
  saveName.select();
});
saveForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = saveName.value.trim().slice(0, 32) || 'Untitled';
  const patch = diffPatch(synth.params, defaultParams());
  const existing = userPresets.findIndex((p) => p.name === name);
  if (existing >= 0) userPresets[existing] = { name, patch };
  else userPresets.push({ name, patch });
  const ok = saveUserPresets(userPresets);
  const idx = existing >= 0 ? existing : userPresets.length - 1;
  renderPresetList(`u:${idx}`);
  state.presetName = name;
  state.modified = false;
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
  const [removed] = userPresets.splice(Number(idx), 1);
  saveUserPresets(userPresets);
  renderPresetList('f:0');
  selectPreset('f:0');
  flash(`DELETED ${removed?.name || ''}`);
});

// Share link
$('#share').addEventListener('click', async () => {
  const patch = diffPatch(synth.params, defaultParams());
  const hash = `#sl1=${encodeShare(state.presetName.replace(/ \*$/, ''), patch)}`;
  history.replaceState(null, '', hash);
  const url = location.href;
  try {
    await navigator.clipboard.writeText(url);
    flash('LINK COPIED');
  } catch {
    flash('LINK IN ADDRESS BAR');
  }
});

// ─── Boot ─────────────────────────────────────────────────────────────────

buildPanel();
renderPresetList('f:0');

const shared = decodeShare(location.hash);
if (shared) {
  applyPatch(shared.patch, shared.name);
  flash('SHARED PATCH LOADED');
} else {
  renderPresetName();
  showParam('CLICK OR PLAY', 'TO START');
}
renderStatus();

// Expose for debugging in the console.
window.synthLab = { engine, synth };
