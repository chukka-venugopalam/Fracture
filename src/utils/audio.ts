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

  // Material hum nodes
  private matOsc1: OscillatorNode | null = null;
  private matOsc2: OscillatorNode | null = null;
  private matHighOsc: OscillatorNode | null = null;
  private matHighGain: GainNode | null = null;
  private matLFO: OscillatorNode | null = null;
  private matLfoAmpNode: GainNode | null = null;
  private matFilter: BiquadFilterNode | null = null;
  private matGain: GainNode | null = null;

  startMaterialHum() {
    if (!this.ctx) this.init();
    if (!this.ctx || !this.masterGain) return;

    // Prevent double hum nodes
    this.stopMaterialHum();

    const ctx = this.ctx;
    const now = ctx.currentTime;

    // 1. Low triangle oscillator
    this.matOsc1 = ctx.createOscillator();
    this.matOsc1.type = "triangle";
    this.matOsc1.frequency.setValueAtTime(55, now); // A1 base

    // 2. Slightly detuned triangle for beating
    this.matOsc2 = ctx.createOscillator();
    this.matOsc2.type = "triangle";
    this.matOsc2.frequency.setValueAtTime(55.4, now);

    // 3. High pitch sine for crystal ringing
    this.matHighOsc = ctx.createOscillator();
    this.matHighOsc.type = "sine";
    this.matHighOsc.frequency.setValueAtTime(440, now); // A4 ringing

    this.matHighGain = ctx.createGain();
    this.matHighGain.gain.setValueAtTime(0.0, now); // Starts silent

    // 4. LFO oscillator for plasma pulsing (modulates master volume gain)
    this.matLFO = ctx.createOscillator();
    this.matLFO.type = "sine";
    this.matLFO.frequency.setValueAtTime(2.0, now); // 2Hz pulse

    this.matLfoAmpNode = ctx.createGain();
    this.matLfoAmpNode.gain.setValueAtTime(0.0, now); // Starts at 0 intensity

    // Lowpass filter
    this.matFilter = ctx.createBiquadFilter();
    this.matFilter.type = "lowpass";
    this.matFilter.frequency.setValueAtTime(180, now);
    this.matFilter.Q.setValueAtTime(2.0, now);

    // Dynamic Gain Nodes
    this.matGain = ctx.createGain();
    this.matGain.gain.setValueAtTime(0.06, now);

    // Connections
    this.matOsc1.connect(this.matFilter);
    this.matOsc2.connect(this.matFilter);
    
    this.matHighOsc.connect(this.matHighGain);
    this.matHighGain.connect(this.matFilter);
    
    // Connect LFO through amp node to master gain parameter (creates amplitude modulation)
    this.matLFO.connect(this.matLfoAmpNode);
    this.matLfoAmpNode.connect(this.matGain.gain);
    
    this.matFilter.connect(this.matGain);
    this.matGain.connect(this.masterGain);

    // Start all oscillators
    this.matOsc1.start(now);
    this.matOsc2.start(now);
    this.matHighOsc.start(now);
    this.matLFO.start(now);
  }

  updateMaterialHum(scrollProgress: number) {
    if (!this.ctx || !this.matFilter || !this.matOsc1 || !this.matOsc2 || !this.matHighOsc || !this.matHighGain || !this.matLfoAmpNode || !this.matGain) return;

    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Linearly morph audio parameters across the 5 states
    let targetCutoff = 180;
    let targetQ = 2.0;
    let targetBaseFreq = 55.0;
    let targetHighGain = 0.0;
    let targetPulseIntensity = 0.0;
    let targetMasterVol = 0.06;

    if (scrollProgress <= 0.2) {
      // State 0: Faceted Glass -> Glassy, thin, clean
      const ratio = scrollProgress / 0.2;
      targetCutoff = 280 - ratio * 100;
      targetQ = 1.0 + ratio * 1.0;
      targetBaseFreq = 55.0;
      targetHighGain = 0.0;
      targetPulseIntensity = 0.0;
    } else if (scrollProgress <= 0.4) {
      // State 1: Liquid Metal -> Sweeping, fluid, detuned
      const ratio = (scrollProgress - 0.2) / 0.2;
      targetCutoff = 180 + Math.sin(now * 3.0) * 30; // Sweeping cutoff
      targetQ = 2.0 + ratio * 2.0;
      targetBaseFreq = 55.0 + ratio * 5.0; // detuning rising
      targetHighGain = 0.0;
      targetPulseIntensity = 0.0;
    } else if (scrollProgress <= 0.6) {
      // State 2: Crystal Growth -> Resonant, high-pitched metallic ringing
      const ratio = (scrollProgress - 0.4) / 0.2;
      targetCutoff = 350;
      targetQ = 6.0; // High resonance
      targetBaseFreq = 60.0;
      targetHighGain = 0.02 * ratio; // High harmonic ringing active
      this.matHighOsc.frequency.setTargetAtTime(440 + ratio * 110, now, 0.1);
    } else if (scrollProgress <= 0.8) {
      // State 3: Dark Obsidian -> Muffled, deep sub-bass
      const ratio = (scrollProgress - 0.6) / 0.2;
      targetCutoff = 350 - ratio * 270; // Drops to 80Hz
      targetQ = 6.0 - ratio * 5.0;     // Drops to 1.0
      targetBaseFreq = 60.0 - ratio * 15.0; // Drops base pitch to 45Hz sub
      targetHighGain = 0.02 * (1.0 - ratio);
    } else {
      // State 4: Pure Light & Closing -> Pulsing, warm plasma glow
      const ratio = Math.min(1.0, (scrollProgress - 0.8) / 0.2);
      targetCutoff = 80 + ratio * 140; // Rises to 220Hz
      targetQ = 1.0 + ratio * 2.0;     // Rises to 3.0
      targetBaseFreq = 45.0 + ratio * 10.0; // 55Hz
      targetHighGain = 0.0;
      targetPulseIntensity = 0.015 * ratio; // Modulates sound volume rhythmically
      targetMasterVol = 0.06 + ratio * 0.015;
    }

    // Apply targets smoothly
    this.matFilter.frequency.setTargetAtTime(targetCutoff, now, 0.25);
    this.matFilter.Q.setTargetAtTime(targetQ, now, 0.2);
    this.matOsc1.frequency.setTargetAtTime(targetBaseFreq, now, 0.3);
    this.matOsc2.frequency.setTargetAtTime(targetBaseFreq + 0.4, now, 0.3);
    
    this.matHighGain.gain.setTargetAtTime(targetHighGain, now, 0.25);
    this.matLfoAmpNode.gain.setTargetAtTime(targetPulseIntensity, now, 0.15);
    this.matGain.gain.setTargetAtTime(targetMasterVol, now, 0.2);
  }

  stopMaterialHum() {
    const ctx = this.ctx;
    if (!ctx) return;

    const o1 = this.matOsc1;
    const o2 = this.matOsc2;
    const oh = this.matHighOsc;
    const ol = this.matLFO;
    const g = this.matGain;

    if (g) {
      g.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
    }

    setTimeout(() => {
      try {
        if (o1) o1.stop();
        if (o2) o2.stop();
        if (oh) oh.stop();
        if (ol) ol.stop();
      } catch (e) {}
    }, 300);

    this.matOsc1 = null;
    this.matOsc2 = null;
    this.matHighOsc = null;
    this.matLFO = null;
    this.matGain = null;
    this.matHighGain = null;
    this.matLfoAmpNode = null;
    this.matFilter = null;
  }
}

export const soundEngine = new AudioEngine();
