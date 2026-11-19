'use strict';

/**
 * Measures a MediaStream and reports on every animation frame a smoothed overall level and per-band levels,
 * all between 0 and 1.
 */
class Level {
  /** Creates (or resumes) the shared AudioContext; call it from a click handler so mobile browsers allow audio. */
  static unlock() {
    Level.audio = Level.audio || new (window.AudioContext || window.webkitAudioContext)();
    if (Level.audio.state === 'suspended') Level.audio.resume().catch(() => {});
    return Level.audio;
  }

  /** onLevel(level, bands) is called while a stream is attached and until the levels have decayed to 0 afterwards. */
  constructor(onLevel, bandCount = 0) {
    this.onLevel = onLevel;
    this.level = 0;
    this.bands = new Array(bandCount).fill(0);
    this.raf = 0;
    this.analyser = null;
  }

  /** Starts measuring the given stream. */
  attach(stream) {
    this.detach();
    const audio = Level.unlock();
    this.source = audio.createMediaStreamSource(stream);
    this.analyser = audio.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.6;
    this.wave = new Uint8Array(this.analyser.fftSize);
    this.spectrum = new Uint8Array(this.analyser.frequencyBinCount);
    this.source.connect(this.analyser);
    this.run();
  }

  /** Stops measuring; the levels decay smoothly to 0. */
  detach() {
    this.source?.disconnect();
    this.source = null;
    this.analyser = null;
  }

  run() {
    if (this.raf) return;
    const ease = (current, target) => current + (target - current) * (target > current ? 0.35 : 0.08);
    const step = () => {
      let target = 0;
      const targets = this.bands.map(() => 0);
      if (this.analyser) {
        this.analyser.getByteTimeDomainData(this.wave);
        let sum = 0;
        for (let i = 0; i < this.wave.length; i++) sum += (this.wave[i] - 128) ** 2;
        target = Math.min(1, Math.sqrt(sum / this.wave.length) / 48);
        if (targets.length) {
          // Logarithmic bands between ~90 Hz and ~8 kHz, where speech has its energy.
          this.analyser.getByteFrequencyData(this.spectrum);
          const binHz = this.analyser.context.sampleRate / this.analyser.fftSize;
          targets.forEach((_, b) => {
            const from = Math.max(1, Math.floor((90 * 89 ** (b / targets.length)) / binHz));
            const to = Math.max(from + 1, Math.floor((90 * 89 ** ((b + 1) / targets.length)) / binHz));
            let peak = 0;
            for (let i = from; i < to && i < this.spectrum.length; i++) peak = Math.max(peak, this.spectrum[i]);
            targets[b] = Math.min(1, Math.max(0, (peak - 60) / 170));
          });
        }
      }
      this.level = ease(this.level, target);
      this.bands = this.bands.map((value, b) => ease(value, targets[b]));
      if (!this.analyser && this.level < 0.003 && this.bands.every((v) => v < 0.003)) {
        this.raf = 0;
        this.level = 0;
        this.bands.fill(0);
        this.onLevel(0, this.bands);
        return;
      }
      this.onLevel(this.level, this.bands);
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }
}

/** Draws thin, softly moving rings around the play button; each ring follows one frequency band. */
class Rings {
  constructor(canvas, count = 4) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.count = count;
    this.phase = 0;
    this.frame = 0;
    new ResizeObserver(() => this.resize()).observe(canvas);
  }

  resize() {
    const ratio = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(this.canvas.clientWidth * ratio);
    this.canvas.height = Math.round(this.canvas.clientHeight * ratio);
    this.draw(this.lastBands || [], this.active);
  }

  /** Draws the rings for the given band levels; inactive rings are not drawn. */
  draw(bands, active) {
    this.lastBands = bands;
    this.active = active;
    const { ctx, canvas } = this;
    const size = Math.min(canvas.width, canvas.height);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!active || !size) return;
    if (!this.color || this.frame++ % 30 === 0) this.color = getComputedStyle(canvas).getPropertyValue('--primary').trim() || '#6aa7ff';
    const ratio = window.devicePixelRatio || 1;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const inner = size * 0.33;
    const outer = size * 0.5 - 3 * ratio;
    this.phase += 0.012;
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 1.6 * ratio;
    const lane = (outer - inner) / this.count;
    for (let i = 0; i < this.count; i++) {
      const band = bands[i] || 0;
      const wobble = lane * (0.04 + band * 0.12);
      const radius = inner + lane * (i + 0.2 + band * 0.6);
      const turn = this.phase * (i % 2 ? -1 : 1) * (1 + i * 0.3) + i * 1.7;
      ctx.globalAlpha = Math.min(1, 0.25 + band * 0.75) * (1 - i * 0.15);
      ctx.beginPath();
      for (let s = 0; s <= 120; s++) {
        const angle = (s / 120) * Math.PI * 2;
        const r = radius + wobble * Math.sin(angle * 3 + turn);
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        if (s === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}
