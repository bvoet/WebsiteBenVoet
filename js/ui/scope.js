// Phosphor-style oscilloscope / spectrum display on a canvas.

export class Scope {
  constructor(canvas) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.mode = 'scope'; // scope | spectrum
    this.analyser = null;
    this.raf = 0;
    this._resize = this._resize.bind(this);
    new ResizeObserver(this._resize).observe(canvas);
    this._resize();
    this._loop = this._loop.bind(this);
    this.raf = requestAnimationFrame(this._loop);
  }

  setAnalyser(a) {
    this.analyser = a;
    this.time = new Float32Array(a.fftSize);
    this.freq = new Uint8Array(a.frequencyBinCount);
  }

  toggleMode() {
    this.mode = this.mode === 'scope' ? 'spectrum' : 'scope';
    return this.mode;
  }

  _resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = this.canvas.getBoundingClientRect();
    this.w = Math.max(1, Math.round(r.width * dpr));
    this.h = Math.max(1, Math.round(r.height * dpr));
    this.canvas.width = this.w;
    this.canvas.height = this.h;
    this.dpr = dpr;
  }

  _colors() {
    const cs = getComputedStyle(this.canvas);
    return {
      trace: cs.getPropertyValue('--lcd-fg').trim() || '#9dff8a',
      grid: cs.getPropertyValue('--lcd-grid').trim() || 'rgba(120,255,120,.12)',
    };
  }

  _loop() {
    this.raf = requestAnimationFrame(this._loop);
    if (document.hidden) return;
    const { g, w, h } = this;
    if (!this._c) this._c = this._colors();
    const { trace, grid } = this._c;

    g.clearRect(0, 0, w, h);

    // Graticule
    g.strokeStyle = grid;
    g.lineWidth = 1;
    g.beginPath();
    for (let i = 1; i < 8; i++) {
      const x = Math.round((i * w) / 8) + 0.5;
      g.moveTo(x, 0);
      g.lineTo(x, h);
    }
    for (let i = 1; i < 4; i++) {
      const y = Math.round((i * h) / 4) + 0.5;
      g.moveTo(0, y);
      g.lineTo(w, y);
    }
    g.stroke();

    g.strokeStyle = trace;
    g.fillStyle = trace;
    g.lineWidth = 1.6 * this.dpr;
    g.shadowColor = trace;
    g.shadowBlur = 6 * this.dpr;

    if (!this.analyser) {
      g.beginPath();
      g.moveTo(0, h / 2);
      g.lineTo(w, h / 2);
      g.stroke();
      g.shadowBlur = 0;
      return;
    }

    if (this.mode === 'scope') this._drawScope();
    else this._drawSpectrum();
    g.shadowBlur = 0;
  }

  _drawScope() {
    const { g, w, h, time } = this;
    this.analyser.getFloatTimeDomainData(time);
    // Trigger on a rising zero crossing for a stable picture.
    const span = Math.floor(time.length / 2);
    let start = 0;
    for (let i = 1; i < span; i++) {
      if (time[i - 1] < 0 && time[i] >= 0) {
        start = i;
        break;
      }
    }
    g.beginPath();
    for (let i = 0; i < span; i++) {
      const x = (i / (span - 1)) * w;
      const y = h / 2 - time[start + i] * h * 0.9;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }

  _drawSpectrum() {
    const { g, w, h, freq } = this;
    this.analyser.getByteFrequencyData(freq);
    const nyq = this.analyser.context.sampleRate / 2;
    const fMin = 30;
    const fMax = Math.min(18000, nyq);
    const bars = Math.max(24, Math.floor(w / (6 * this.dpr)));
    const bw = w / bars;
    for (let b = 0; b < bars; b++) {
      const f0 = fMin * Math.pow(fMax / fMin, b / bars);
      const f1 = fMin * Math.pow(fMax / fMin, (b + 1) / bars);
      const i0 = Math.floor((f0 / nyq) * freq.length);
      const i1 = Math.max(i0 + 1, Math.floor((f1 / nyq) * freq.length));
      let m = 0;
      for (let i = i0; i < i1 && i < freq.length; i++) m = Math.max(m, freq[i]);
      const bh = (m / 255) * h * 0.95;
      g.fillRect(b * bw + 1, h - bh, Math.max(1, bw - 2 * this.dpr), bh);
    }
  }
}
