// Instrument registry. Order = order of the tabs.

import subtractive from './subtractive.js';
import fm from './fm.js';
import additive from './additive.js';
import wavetable from './wavetable.js';
import drums from './drums.js';

export const INSTRUMENTS = [subtractive, fm, additive, wavetable, drums];

export const byId = (id) => INSTRUMENTS.find((i) => i.id === id);
