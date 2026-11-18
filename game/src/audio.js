// Prism Breaker — sound: every effect and the music loop are synthesized live
// with the Web Audio API. No audio files, no network, nothing to load.

const MUSIC_BASS = [55, 55, 65.41, 49, 55, 55, 73.42, 82.41];
const MUSIC_ARP = [220, 261.63, 329.63, 440, 329.63, 261.63];

export class SoundEngine {
  constructor() {
    this.context = null;
    this.master = null;
    this.muted = false;
    this.musicTimer = null;
    this.musicStep = 0;
  }

  /** Create the audio context on the first user gesture (browsers require one). */
  ensure() {
    if (this.context) {
      if (this.context.state === 'suspended') void this.context.resume();
      return;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.context.destination);
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.5;
  }

  /** A short oscillator blip with a pitch slide. */
  tone(freq, endFreq, seconds, type, volume, delay = 0) {
    if (!this.context || this.muted) return;
    const t0 = this.context.currentTime + delay;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t0 + seconds);
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + seconds);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + seconds + 0.02);
  }

  /** A burst of filtered noise (explosions, impacts). */
  noise(seconds, volume, delay = 0) {
    if (!this.context || this.muted) return;
    const t0 = this.context.currentTime + delay;
    const length = Math.max(1, Math.floor(this.context.sampleRate * seconds));
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1800;
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + seconds);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start(t0);
  }

  /** Paddle hit: a low, tight blip. */
  paddle() {
    this.tone(190, 130, 0.07, 'square', 0.16);
  }

  /** Brick pop: pitch climbs with the combo, so streaks sound rewarding. */
  brick(combo) {
    const base = 420 + Math.min(combo, 24) * 22;
    this.tone(base, base * 1.6, 0.09, 'triangle', 0.2);
    this.tone(base * 2, base * 2.4, 0.05, 'sine', 0.08);
  }

  /** Power-up catch: a rising three-note arpeggio. */
  powerup() {
    this.tone(523.25, 523.25, 0.09, 'sine', 0.16);
    this.tone(659.25, 659.25, 0.09, 'sine', 0.16, 0.08);
    this.tone(783.99, 783.99, 0.14, 'sine', 0.16, 0.16);
  }

  /** Volatile brick: noise burst plus a low thump. */
  explosion() {
    this.noise(0.35, 0.3);
    this.tone(120, 40, 0.3, 'sine', 0.3);
  }

  /** Ball lost: a falling two-note sigh. */
  loseLife() {
    this.tone(392, 392, 0.14, 'triangle', 0.18);
    this.tone(311.13, 233.08, 0.28, 'triangle', 0.18, 0.14);
  }

  /** Level clear: a bright four-note fanfare. */
  fanfare() {
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      this.tone(freq, freq, 0.16, 'triangle', 0.18, i * 0.11);
    });
  }

  /** Game over: a slow descending phrase. */
  gameOver() {
    [392, 349.23, 311.13, 261.63].forEach((freq, i) => {
      this.tone(freq, freq * 0.94, 0.3, 'sawtooth', 0.1, i * 0.22);
    });
  }

  /** Menu click: a tiny tick. */
  click() {
    this.tone(700, 900, 0.05, 'sine', 0.12);
  }

  /** Laser shot: a quick zap. */
  laser() {
    this.tone(1200, 300, 0.12, 'sawtooth', 0.1);
  }

  /** Quiet bassline + arpeggio loop, one quiet step every 240 ms. */
  startMusic() {
    if (!this.context || this.musicTimer) return;
    this.musicTimer = window.setInterval(() => {
      if (this.muted) return;
      const step = this.musicStep;
      const bass = MUSIC_BASS[step % MUSIC_BASS.length];
      this.tone(bass, bass, 0.22, 'triangle', 0.07);
      if (step % 2 === 0) {
        const note = MUSIC_ARP[(step / 2) % MUSIC_ARP.length];
        this.tone(note, note, 0.18, 'sine', 0.035);
      }
      this.musicStep += 1;
    }, 240);
  }

  stopMusic() {
    if (this.musicTimer) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }
}
