"use client";

class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private isMuted: boolean = true;

  // Hum nodes
  private humOsc1: OscillatorNode | null = null;
  private humOsc2: OscillatorNode | null = null;
  private humGain: GainNode | null = null;
  private humFilter: BiquadFilterNode | null = null;

  init() {
    if (this.ctx) return;

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioContextClass();
      
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.42, this.ctx.currentTime);
    } catch (e) {
      console.warn("Web Audio API not supported in this browser:", e);
    }
  }

  setMute(muted: boolean) {
    this.isMuted = muted;
    if (!this.ctx) this.init();
    if (!this.ctx || !this.masterGain) return;

    // Resume context if suspended (browser security policy)
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }

    const targetGain = muted ? 0.0 : 0.42;
    this.masterGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.08);
  }

  getMuteState() {
    return this.isMuted;
  }

  startHum() {
    if (!this.ctx) this.init();
    if (!this.ctx || !this.masterGain) return;

    // Prevent double hum
    this.stopHum();

    const ctx = this.ctx;
    
    // Low sine oscillator
    this.humOsc1 = ctx.createOscillator();
    this.humOsc1.type = "sine";
    this.humOsc1.frequency.setValueAtTime(45, ctx.currentTime); // 45Hz sub

    // Slightly detuned triangle oscillator for warm beating beating harmonics
    this.humOsc2 = ctx.createOscillator();
    this.humOsc2.type = "triangle";
    this.humOsc2.frequency.setValueAtTime(45.6, ctx.currentTime);

    this.humFilter = ctx.createBiquadFilter();
    this.humFilter.type = "lowpass";
    this.humFilter.frequency.setValueAtTime(60, ctx.currentTime);
    this.humFilter.Q.setValueAtTime(3.5, ctx.currentTime);

    this.humGain = ctx.createGain();
    this.humGain.gain.setValueAtTime(0.005, ctx.currentTime);

    // Connections
    this.humOsc1.connect(this.humFilter);
    this.humOsc2.connect(this.humFilter);
    this.humFilter.connect(this.humGain);
    this.humGain.connect(this.masterGain);

    this.humOsc1.start();
    this.humOsc2.start();
  }

  updateHumProgress(percent: number) {
    if (!this.ctx || !this.humGain || !this.humFilter || !this.humOsc1 || !this.humOsc2) return;
    const ctx = this.ctx;
    
    // Scale volume and cutoff filter frequency up with load progress
    const ratio = Math.max(0.0, Math.min(1.0, percent / 100));
    
    const targetVol = 0.008 + ratio * 0.16;
    const targetCutoff = 60 + ratio * 200; // Sweep cutoff up to 260Hz
    const targetFreq = 45 + ratio * 15;    // Pitch sweeps from 45Hz to 60Hz

    this.humGain.gain.setTargetAtTime(targetVol, ctx.currentTime, 0.12);
    this.humFilter.frequency.setTargetAtTime(targetCutoff, ctx.currentTime, 0.15);
    
    this.humOsc1.frequency.setTargetAtTime(targetFreq, ctx.currentTime, 0.2);
    this.humOsc2.frequency.setTargetAtTime(targetFreq + 0.6, ctx.currentTime, 0.2);
  }

  stopHum() {
    const ctx = this.ctx;
    const g = this.humGain;
    const o1 = this.humOsc1;
    const o2 = this.humOsc2;

    if (!ctx || !g) return;

    // Fade out hum cleanly
    g.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
    
    setTimeout(() => {
      try {
        if (o1) o1.stop();
        if (o2) o2.stop();
      } catch (e) {}
    }, 400);

    this.humOsc1 = null;
    this.humOsc2 = null;
    this.humGain = null;
    this.humFilter = null;
  }

  playImpact() {
    if (!this.ctx) this.init();
    if (!this.ctx || !this.masterGain) return;
    
    const ctx = this.ctx;
    if (ctx.state === "suspended") {
      ctx.resume();
    }

    const now = ctx.currentTime;

    // 1. Synthesize White Noise crunch for glass shatter transient
    const bufferSize = ctx.sampleRate * 2.0; // 2s length
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const channelData = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      channelData[i] = Math.random() * 2 - 1;
    }
    
    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = buffer;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.setValueAtTime(2800, now);
    noiseFilter.frequency.exponentialRampToValueAtTime(320, now + 1.8); // Time dilated filter drop
    noiseFilter.Q.setValueAtTime(3.0, now);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.24, now);
    // Slow motion crack decay tail
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);

    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.masterGain);

    // 2. Sine bell-like structural crack impact ring
    const bellOsc = ctx.createOscillator();
    bellOsc.type = "sine";
    bellOsc.frequency.setValueAtTime(2600, now);
    // Pitch sweep down representing time-dilated dilation
    bellOsc.frequency.exponentialRampToValueAtTime(88, now + 2.4);

    const bellGain = ctx.createGain();
    bellGain.gain.setValueAtTime(0.32, now);
    bellGain.gain.exponentialRampToValueAtTime(0.0001, now + 2.4);

    bellOsc.connect(bellGain);
    bellGain.connect(this.masterGain);

    // Start playback
    noiseSource.start(now);
    bellOsc.start(now);

    // Terminate sources
    noiseSource.stop(now + 2.0);
    bellOsc.stop(now + 2.5);
  }

  playChime() {
    if (!this.ctx) this.init();
    if (!this.ctx || !this.masterGain) return;

    const ctx = this.ctx;
    if (ctx.state === "suspended") {
      ctx.resume();
    }

    const now = ctx.currentTime;

    // Harmonic chord cluster for portal chime (shimmering glass vibe)
    const frequencies = [880, 1100, 1320, 1760]; // A5 major triad cluster
    
    frequencies.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now);

      const gain = ctx.createGain();
      
      // Slow attack, long dreamy decay
      gain.gain.setValueAtTime(0.0, now);
      gain.gain.linearRampToValueAtTime(0.05 - index * 0.008, now + 0.32 + index * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.8 + index * 0.1);

      // Lowpass filter to soften high frequencies
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(3200, now);

      osc.connect(gain);
      gain.connect(filter);
      filter.connect(this.masterGain!);

      osc.start(now);
      osc.stop(now + 3.2);
    });
  }
}

export const soundEngine = new AudioEngine();
