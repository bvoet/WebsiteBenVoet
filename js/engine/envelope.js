// ADSR envelope that drives an AudioParam.
//
// The envelope's level is tracked analytically (not read back from the param),
// so releasing mid-attack or retriggering mid-release is smooth in every
// browser, including ones without AudioParam.cancelAndHoldAtTime (Firefox).

const MIN_ATTACK = 0.003; // seconds; avoids clicks on note onset
const MIN_TIME = 0.002;

export class Envelope {
  /**
   * @param {AudioParam} param  the parameter to automate
   * @param {number} base       resting value of the param (envelope adds to it)
   */
  constructor(param, base = 0) {
    this.param = param;
    this.base = base;
    this.phase = 'idle'; // idle | on | release
    this.from = 0;
    this.peak = 0;
    this.start = 0;
    this.a = MIN_ATTACK;
    this.d = 0.1;
    this.s = 1;
    this.r = 0.1;
    this.relStart = 0;
    this.relLevel = 0;
    param.setValueAtTime(base, 0);
  }

  /** Envelope offset (above base) at context time t. */
  levelAt(t) {
    if (this.phase === 'idle') return 0;
    if (this.phase === 'release') {
      const dt = Math.max(0, t - this.relStart);
      return this.relLevel * Math.exp(-dt / (this.r / 4));
    }
    const dt = t - this.start;
    if (dt < 0) return this.from;
    if (dt < this.a) return this.from + (this.peak - this.from) * (dt / this.a);
    const sus = this.peak * this.s;
    return sus + (this.peak - sus) * Math.exp(-(dt - this.a) / (this.d / 4));
  }

  /**
   * Start (or retrigger) the envelope.
   * @param {number} t     context time
   * @param {{a:number,d:number,s:number,r:number}} adsr  seconds / 0..1 sustain
   * @param {number} peak  offset at the top of the attack (may be negative)
   */
  trigger(t, adsr, peak) {
    const from = this.levelAt(t);
    this.a = Math.max(MIN_ATTACK, adsr.a);
    this.d = Math.max(MIN_TIME, adsr.d);
    this.s = adsr.s;
    this.r = Math.max(MIN_TIME * 4, adsr.r);
    this.peak = peak;
    this.from = from;
    this.start = t;
    this.phase = 'on';

    const p = this.param;
    p.cancelScheduledValues(t);
    p.setValueAtTime(this.base + from, t);
    p.linearRampToValueAtTime(this.base + peak, t + this.a);
    p.setTargetAtTime(this.base + peak * this.s, t + this.a, this.d / 4);
  }

  /** Begin the release stage. Returns the time at which output is ~silent. */
  release(t) {
    const level = this.levelAt(t);
    this.relLevel = level;
    this.relStart = t;
    this.phase = 'release';
    const p = this.param;
    p.cancelScheduledValues(t);
    p.setValueAtTime(this.base + level, t);
    p.setTargetAtTime(this.base, t, this.r / 4);
    return t + this.r * 1.5 + 0.05;
  }

  /** Very fast fade, used for voice stealing. */
  kill(t) {
    const level = this.levelAt(t);
    this.relLevel = level;
    this.relStart = t;
    this.r = 0.02;
    this.phase = 'release';
    const p = this.param;
    p.cancelScheduledValues(t);
    p.setValueAtTime(this.base + level, t);
    p.setTargetAtTime(this.base, t, 0.005);
    return t + 0.04;
  }
}
