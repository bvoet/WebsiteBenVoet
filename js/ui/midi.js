// Web MIDI input. Requested only on user action (browsers show a permission
// prompt). Not available in Safari — callers should check `midiSupported`.

export const midiSupported = typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;

/**
 * @param {{noteOn, noteOff, pitchBend, modWheel, sustain, allOff, onDevices}} h
 * @returns {Promise<MIDIAccess>}
 */
export async function connectMidi(h) {
  const access = await navigator.requestMIDIAccess();

  const onMessage = (e) => {
    const [status, d1 = 0, d2 = 0] = e.data;
    const type = status & 0xf0;
    switch (type) {
      case 0x90:
        if (d2 > 0) h.noteOn(d1, d2 / 127);
        else h.noteOff(d1); // note-on with velocity 0 = note-off
        break;
      case 0x80:
        h.noteOff(d1);
        break;
      case 0xb0:
        if (d1 === 1) h.modWheel(d2 / 127);
        else if (d1 === 64) h.sustain(d2 >= 64);
        else if (d1 === 120 || d1 === 123) h.allOff();
        break;
      case 0xe0: {
        const v = ((d2 << 7) | d1) - 8192;
        h.pitchBend(v / 8192);
        break;
      }
    }
  };

  const wire = () => {
    const names = [];
    for (const input of access.inputs.values()) {
      input.onmidimessage = onMessage;
      names.push(input.name);
    }
    h.onDevices(names);
  };

  access.onstatechange = wire;
  wire();
  return access;
}
