/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

class AudioSynthesizer {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private ambianceNode: AudioWorkletNode | ScriptProcessorNode | null = null;
  private ambianceGain: GainNode | null = null;
  private isMuted: boolean = false;

  private init() {
    if (this.ctx) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.5, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    } catch (e) {
      console.warn('Web Audio API not supported in this browser', e);
    }
  }

  private resume() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setMute(mute: boolean) {
    this.isMuted = mute;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(mute ? 0 : 0.5, this.ctx.currentTime);
    }
  }

  getMuted(): boolean {
    return this.isMuted;
  }

  playKick(power: number = 0.5) {
    this.resume();
    if (!this.ctx || !this.masterGain || this.isMuted) return;

    const now = this.ctx.currentTime;
    
    // Low-end thud (kick ball)
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, now);
    // sweep pitch down rapidly
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.15);
    
    gain.gain.setValueAtTime(power * 0.8, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    
    osc.connect(gain);
    gain.connect(this.masterGain);
    
    osc.start(now);
    osc.stop(now + 0.22);

    // Beating click noise
    const noiseBuffer = this.createNoiseBuffer();
    if (noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(250, now);
      filter.Q.setValueAtTime(4.0, now);
      
      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(power * 0.4, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      
      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.masterGain);
      
      noise.start(now);
      noise.stop(now + 0.06);
    }
  }

  playNetSwish() {
    this.resume();
    if (!this.ctx || !this.masterGain || this.isMuted) return;

    const now = this.ctx.currentTime;
    const noiseBuffer = this.createNoiseBuffer();
    if (!noiseBuffer) return;

    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(600, now);
    // Open band filter to simulate net vibration
    filter.frequency.exponentialRampToValueAtTime(150, now + 0.4);
    filter.Q.setValueAtTime(1.5, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start(now);
    noise.stop(now + 0.5);
  }

  playPostClang() {
    this.resume();
    if (!this.ctx || !this.masterGain || this.isMuted) return;

    const now = this.ctx.currentTime;
    
    // High metal ring frequencies
    const freqs = [640, 960, 1320, 1800];
    freqs.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      
      // longer ring for lower elements
      const duration = 0.4 - idx * 0.08;
      
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + duration + 0.05);
    });

    // Thud sound of hit
    this.playKick(0.4);
  }

  playWhistle() {
    this.resume();
    if (!this.ctx || !this.masterGain || this.isMuted) return;

    const now = this.ctx.currentTime;
    
    // Standard referee whistle is two high frequencies (e.g. 2000Hz, 2150Hz) beat-interfering with rapid modulation
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.frequency.setValueAtTime(1900, now);
    osc2.frequency.setValueAtTime(2050, now);

    // Rapid vibrato LFO
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.setValueAtTime(32, now); // 32 Hz warble
    lfoGain.gain.setValueAtTime(40, now); // pitch width

    lfo.connect(lfoGain);
    lfoGain.connect(osc1.frequency);
    lfoGain.connect(osc2.frequency);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.25, now + 0.05); // sharp build-up
    gain.gain.setValueAtTime(0.25, now + 0.25);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5); // clean stop

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.masterGain);

    lfo.start(now);
    osc1.start(now);
    osc2.start(now);

    lfo.stop(now + 0.55);
    osc1.stop(now + 0.55);
    osc2.stop(now + 0.55);
  }

  playGoalCheer() {
    this.resume();
    if (!this.ctx || !this.masterGain || this.isMuted) return;

    const now = this.ctx.currentTime;
    const noiseBuffer = this.createNoiseBuffer();
    if (!noiseBuffer) return;

    // Cheer consists of full band roaring noise building up
    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(350, now);
    // dynamic swell of crowd tone
    filter.frequency.exponentialRampToValueAtTime(800, now + 0.8);
    filter.Q.setValueAtTime(1.0, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.6, now + 0.3); // rapid roar swell
    gain.gain.setValueAtTime(0.6, now + 1.2);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 3.0); // gradual decay

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start(now);
    noise.stop(now + 3.1);

    // Horn blow overlay
    setTimeout(() => {
      this.playAirHorn();
    }, 150);
  }

  private playAirHorn() {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;

    // Classic stadium airhorn is multiple square waves close in pitch (e.g. 330Hz, 440Hz, etc.)
    const pitches = [233, 235, 349, 466]; // F-major-ish stadium chord
    pitches.forEach(pitch => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(pitch, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.08, now + 0.05);
      gain.gain.setValueAtTime(0.08, now + 0.8);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + 1.05);
    });
  }

  playMissGroan() {
    this.resume();
    if (!this.ctx || !this.masterGain || this.isMuted) return;

    const now = this.ctx.currentTime;
    const noiseBuffer = this.createNoiseBuffer();
    if (!noiseBuffer) return;

    // Groan is a low frequency sliding down filter
    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(300, now);
    filter.frequency.exponentialRampToValueAtTime(100, now + 0.8);
    filter.Q.setValueAtTime(2.0, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.4, now + 0.15);
    gain.gain.setValueAtTime(0.4, now + 0.8);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.8);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start(now);
    noise.stop(now + 1.85);
  }

  startAmbiance() {
    this.resume();
    if (!this.ctx || !this.masterGain || this.ambianceNode || this.isMuted) return;

    try {
      const now = this.ctx.currentTime;
      const noiseBuffer = this.createNoiseBuffer(5.0); // 5s loop
      if (!noiseBuffer) return;

      const source = this.ctx.createBufferSource();
      source.buffer = noiseBuffer;
      source.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(250, now);

      this.ambianceGain = this.ctx.createGain();
      this.ambianceGain.gain.setValueAtTime(0.05, now); // very low hum

      // slowly modulate filter or volume to simulate cheering swell
      const lfo = this.ctx.createOscillator();
      lfo.frequency.setValueAtTime(0.15, now); // very slow: 6.6s cycle
      
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.setValueAtTime(80, now); // swing filter from 170 to 330 Hz

      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);

      source.connect(filter);
      filter.connect(this.ambianceGain);
      this.ambianceGain.connect(this.masterGain);

      lfo.start(now);
      source.start(now);

      // Save reference to stop later
      this.ambianceNode = source as any; // mock cast to track
    } catch (err) {
      console.warn('Could not launch stadium ambiance', err);
    }
  }

  stopAmbiance() {
    if (this.ambianceNode) {
      try {
        (this.ambianceNode as any).stop();
      } catch (e) {}
      this.ambianceNode = null;
    }
  }

  // Helpers to generate white noise
  private createNoiseBuffer(duration: number = 1.5): AudioBuffer | null {
    if (!this.ctx) return null;
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }
}

export const soundEffects = new AudioSynthesizer();
