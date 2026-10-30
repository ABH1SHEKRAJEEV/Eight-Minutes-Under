// ─────────────────────────────────────────────────────────────────────────────
// Procedural horror audio — zero external assets.
// 4.3s mechanical ventilator loop · 19Hz infrasound · sub-bass impact drops ·
// muffled surgical-team "voices" (formant babble through a low-pass wall that
// snaps open at 7:00) · flatline · gasp · rain · alarms.
// ─────────────────────────────────────────────────────────────────────────────

export class HorrorAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private voiceOut: GainNode | null = null;
  private ventSrc: AudioBufferSourceNode | null = null;
  private ventGain: GainNode | null = null;
  private ventLfo: OscillatorNode | null = null;
  private ventLfoGain: GainNode | null = null;
  private infraGain: GainNode | null = null;
  private rainGain: GainNode | null = null;
  private alarmOsc: OscillatorNode | null = null;
  private alarmGain: GainNode | null = null;
  private flatOsc: OscillatorNode | null = null;
  private rechargeGain: GainNode | null = null;
  private rechargeFilter: BiquadFilterNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private voiceClarity = 0; // 0 = underwater, 1 = filter dropped

  /** Must be called from a user gesture. */
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    this.ctx = ctx;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 7;
    comp.attack.value = 0.004;
    comp.release.value = 0.24;
    const master = ctx.createGain();
    master.gain.value = 0.85;
    master.connect(comp);
    comp.connect(ctx.destination);
    this.master = master;

    // voice chain → gentle saturation → master
    const voiceOut = ctx.createGain();
    voiceOut.gain.value = 0.9;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * 2 - 1;
      curve[i] = Math.tanh(x * 1.6);
    }
    shaper.curve = curve;
    voiceOut.connect(shaper);
    shaper.connect(master);
    this.voiceOut = voiceOut;

    // 2s white noise workhorse buffer
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;
  }

  private noiseSource(loop = true): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = loop;
    return src;
  }

  // ── MENU: rain on the security-booth window ───────────────────────────────
  startRain() {
    if (!this.ctx || this.rainGain) return;
    const ctx = this.ctx;
    const src = this.noiseSource();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2600;
    bp.Q.value = 0.45;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 5200;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(0.10, ctx.currentTime + 2.5);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.17;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.035;
    lfo.connect(lfoG);
    lfoG.connect(g.gain);
    src.connect(bp); bp.connect(lp); lp.connect(g); g.connect(this.master!);
    src.start(); lfo.start();
    this.rainGain = g;
  }

  stopRain() {
    if (!this.ctx || !this.rainGain) return;
    this.rainGain.gain.linearRampToValueAtTime(0.0001, this.ctx.currentTime + 0.8);
    this.rainGain = null;
  }

  // ── PLAYING: ventilator hum (4.3s mechanical breath) + 19Hz infrasound ────
  startAmbience() {
    if (!this.ctx || this.ventSrc) return;
    const ctx = this.ctx;

    // synthesize one 4.3s mechanical breath
    const sr = ctx.sampleRate;
    const len = Math.floor(4.3 * sr);
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      let e: number;
      if (t < 0.22) e = t / 0.22;
      else if (t < 1.5) e = 1;
      else if (t < 1.75) e = 1 - ((t - 1.5) / 0.25) * 0.35;
      else if (t < 3.0) e = 0.65 * (1 - ((t - 1.75) / 1.25) * 0.72);
      else e = 0.19 * Math.exp(-(t - 3.0) * 3.2);
      const w = Math.random() * 2 - 1;
      lp += 0.1 * (w - lp); // leaky integrator = breath-like pink noise
      const hiss = w * 0.14;
      const kick = t < 0.3 ? Math.sin(2 * Math.PI * 38 * t) * Math.exp(-t * 26) * 1.1 : 0;
      const t2 = t - 1.5;
      const valve = t2 > 0 && t2 < 0.05 ? Math.sin(2 * Math.PI * 2400 * t2) * Math.exp(-t2 * 700) * 0.22 : 0;
      d[i] = (lp + hiss) * e * 0.55 + kick * 0.4 + valve;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const flt = ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = 720;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 2.0);
    src.connect(flt); flt.connect(g); g.connect(this.master!);
    src.start();
    this.ventSrc = src;
    this.ventGain = g;

    // 19Hz infrasound bed (with a 57Hz overtone so laptop speakers still dread it)
    const infraGain = ctx.createGain();
    infraGain.gain.value = 0;
    const o1 = ctx.createOscillator(); o1.frequency.value = 19;
    const o2 = ctx.createOscillator(); o2.frequency.value = 57;
    const g2 = ctx.createGain(); g2.gain.value = 0.28;
    o1.connect(infraGain);
    o2.connect(g2); g2.connect(infraGain);
    infraGain.connect(this.master!);
    o1.start(); o2.start();
    this.infraGain = infraGain;

    // recharge loop (defibrillator capacitor whine while SPACE held)
    const rn = this.noiseSource();
    const rf = ctx.createBiquadFilter();
    rf.type = 'bandpass';
    rf.frequency.value = 900;
    rf.Q.value = 1.4;
    const rg = ctx.createGain();
    rg.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 3.1;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.05;
    lfo.connect(lfoG); lfoG.connect(rg.gain);
    rn.connect(rf); rf.connect(rg); rg.connect(this.master!);
    rn.start(); lfo.start();
    this.rechargeGain = rg;
    this.rechargeFilter = rf;
  }

  /** 0..1 — ramps the 19Hz dread as phases escalate. */
  setInfra(level: number) {
    if (!this.ctx || !this.infraGain) return;
    this.infraGain.gain.linearRampToValueAtTime(level * 0.34, this.ctx.currentTime + 3.0);
  }

  setVentFrantic(on: boolean) {
    if (!this.ctx || !this.ventSrc || !this.ventGain) return;
    const t = this.ctx.currentTime;
    this.ventSrc.playbackRate.linearRampToValueAtTime(on ? 1.9 : 1.0, t + 0.4);
    if (on && !this.ventLfo) {
      const lfo = this.ctx.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = 2.1; // frantic thumping
      const lg = this.ctx.createGain();
      lg.gain.value = 0.22;
      lfo.connect(lg);
      lg.connect(this.ventGain.gain);
      lfo.start();
      this.ventLfo = lfo;
      this.ventLfoGain = lg;
    } else if (!on && this.ventLfo) {
      this.ventLfo.stop();
      this.ventLfo.disconnect();
      this.ventLfoGain?.disconnect();
      this.ventLfo = null;
      this.ventLfoGain = null;
      this.ventGain.gain.setTargetAtTime(0.5, t, 0.3);
    }
  }

  setRecharge(on: boolean, level: number) {
    if (!this.ctx || !this.rechargeGain || !this.rechargeFilter) return;
    const t = this.ctx.currentTime;
    this.rechargeGain.gain.setTargetAtTime(on ? 0.16 : 0.0, t, 0.05);
    this.rechargeFilter.frequency.setTargetAtTime(500 + level * 1400, t, 0.08);
  }

  // ── IMPACTS ────────────────────────────────────────────────────────────────
  /** Localized sub-bass drop — the room falls out from under you. */
  subDrop() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(88, t);
    o.frequency.exponentialRampToValueAtTime(27, t + 0.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.95, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o.connect(g); g.connect(this.master!);
    o.start(t); o.stop(t + 0.55);

    const thump = ctx.createBufferSource();
    thump.buffer = this.noiseBuf;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 190;
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0.5, t);
    tg.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    thump.connect(lp); lp.connect(tg); tg.connect(this.master!);
    thump.start(t); thump.stop(t + 0.14);
  }

  staticBurst(dur = 0.3, vol = 0.28) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = this.noiseSource(false);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1100;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(hp); hp.connect(g); g.connect(this.master!);
    src.start(t); src.stop(t + dur + 0.05);
  }

  beep(freq = 1150, vol = 0.085) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    o.connect(g); g.connect(this.master!);
    o.start(t); o.stop(t + 0.1);
  }

  uiBlip() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(240, t);
    o.frequency.exponentialRampToValueAtTime(120, t + 0.05);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    o.connect(g); g.connect(this.master!);
    o.start(t); o.stop(t + 0.07);
  }

  // ── PARRY ──────────────────────────────────────────────────────────────────
  parrySting() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = this.noiseSource(false);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    src.connect(hp); hp.connect(g); g.connect(this.master!);
    src.start(t); src.stop(t + 0.5);

    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(1350, t);
    const vib = ctx.createOscillator();
    vib.frequency.value = 31;
    const vibG = ctx.createGain();
    vibG.gain.value = 210;
    vib.connect(vibG); vibG.connect(o.frequency);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.06, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o.connect(og); og.connect(this.master!);
    o.start(t); vib.start(t);
    o.stop(t + 0.55); vib.stop(t + 0.55);
  }

  parryHit() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(200, t);
    o.frequency.exponentialRampToValueAtTime(920, t + 0.16);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g); g.connect(this.master!);
    o.start(t); o.stop(t + 0.32);
    const o2 = ctx.createOscillator();
    o2.frequency.setValueAtTime(1200, t);
    o2.frequency.exponentialRampToValueAtTime(2400, t + 0.28);
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.13, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
    o2.connect(g2); g2.connect(this.master!);
    o2.start(t); o2.stop(t + 0.36);
    this.subDrop();
  }

  parryFail() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(280, t);
    o.frequency.exponentialRampToValueAtTime(52, t + 0.7);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.34, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    o.connect(g); g.connect(this.master!);
    o.start(t); o.stop(t + 0.85);
    for (let i = 0; i < 3; i++) {
      const src = this.noiseSource(false);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      const cg = ctx.createGain();
      const ct = t + i * 0.09;
      cg.gain.setValueAtTime(0.2, ct);
      cg.gain.exponentialRampToValueAtTime(0.001, ct + 0.07);
      src.connect(lp); lp.connect(cg); cg.connect(this.master!);
      src.start(ct); src.stop(ct + 0.09);
    }
  }

  // ── BREACH ─────────────────────────────────────────────────────────────────
  alarmStart() {
    if (!this.ctx || this.alarmOsc) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 540;
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 1.3;
    const lg = ctx.createGain();
    lg.gain.value = 160;
    lfo.connect(lg); lg.connect(o.frequency);
    const g = ctx.createGain();
    g.gain.value = 0.07;
    o.connect(g); g.connect(this.master!);
    o.start(); lfo.start();
    this.alarmOsc = o;
    this.alarmGain = g;
  }

  alarmStop() {
    if (this.alarmOsc) {
      try { this.alarmOsc.stop(); } catch { /* already stopped */ }
      this.alarmOsc.disconnect();
      this.alarmGain?.disconnect();
      this.alarmOsc = null;
      this.alarmGain = null;
    }
  }

  defibCharge(dur: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(280, t);
    o.frequency.exponentialRampToValueAtTime(1500, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.14, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur + 0.1);
    o.connect(g); g.connect(this.master!);
    o.start(t); o.stop(t + dur + 0.15);
  }

  // ── TRAUMA VOICES: formant babble through a low-pass wall ─────────────────
  /** Returns the spoken duration in seconds. */
  speak(text: string, opts: { urgent?: boolean } = {}): number {
    if (!this.ctx || !this.voiceOut) return 2;
    const ctx = this.ctx;
    const urgent = !!opts.urgent;
    const clear = this.voiceClarity > 0.5;
    const t0 = ctx.currentTime + 0.06;

    const bus = ctx.createGain();
    bus.gain.value = urgent ? 0.62 : 0.4;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = clear ? 4200 : 480; // the wall snaps open at 7:00
    lp.Q.value = 0.6;
    const delay = ctx.createDelay(0.5);
    delay.delayTime.value = 0.115; // broken PA slapback
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const wet = ctx.createGain();
    wet.gain.value = 0.38;
    bus.connect(lp);
    lp.connect(this.voiceOut!);
    lp.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(wet);
    wet.connect(this.voiceOut!);

    const base = urgent ? 152 : 118;
    let t = t0;
    let sylIndex = 0;
    for (const word of text.split(/\s+/)) {
      const nSyl = Math.min(4, 1 + Math.floor(word.length / 3));
      for (let s = 0; s < nSyl; s++) {
        const dur = (0.07 + Math.random() * 0.09) * (urgent ? 0.72 : 1);
        const f = base * (0.82 + Math.random() * 0.5) + (clear ? 24 : 0);
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f * 1.09, t);
        o.frequency.exponentialRampToValueAtTime(f * 0.8, t + dur);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 360 + Math.random() * 1500;
        bp.Q.value = 6;
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.0001, t);
        env.gain.exponentialRampToValueAtTime(0.5 + Math.random() * 0.4, t + 0.024);
        env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(bp); bp.connect(env); env.connect(bus);
        o.start(t); o.stop(t + dur + 0.03);
        t += dur + 0.014;
        sylIndex++;
      }
      t += 0.05 + Math.random() * (urgent ? 0.06 : 0.12);
    }
    // breath noise bed under the line
    const nb = this.noiseSource(false);
    const nlp = ctx.createBiquadFilter();
    nlp.type = 'lowpass';
    nlp.frequency.value = clear ? 2600 : 380;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t0);
    ng.gain.linearRampToValueAtTime(urgent ? 0.07 : 0.04, t0 + 0.1);
    ng.gain.linearRampToValueAtTime(0.0001, t);
    nb.connect(nlp); nlp.connect(ng); ng.connect(bus);
    nb.start(t0); nb.stop(t + 0.05);
    void sylIndex;
    return t - t0 + 0.15;
  }

  /** 7:00 — the low-pass wall snaps off. The surgeons are suddenly IN the room. */
  filterDrop() {
    if (!this.ctx || !this.voiceOut) return;
    this.voiceClarity = 1;
    const t = this.ctx.currentTime;
    this.voiceOut.gain.cancelScheduledValues(t);
    this.voiceOut.gain.setValueAtTime(this.voiceOut.gain.value, t);
    this.voiceOut.gain.linearRampToValueAtTime(1.5, t + 0.4);
    this.staticBurst(0.2, 0.2);
  }

  // ── ENDINGS ────────────────────────────────────────────────────────────────
  flatline() {
    if (!this.ctx || this.flatOsc) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.value = 968;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.08);
    o.connect(g); g.connect(this.master!);
    o.start();
    this.flatOsc = o;
  }

  stopFlatline() {
    if (!this.ctx || !this.flatOsc) return;
    const t = this.ctx.currentTime;
    this.flatOsc.stop(t + 0.6);
    this.flatOsc = null;
  }

  /** Violent gasping breath + returning heartbeat. */
  gasp() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    // inhale
    const src = this.noiseSource(false);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.1;
    bp.frequency.setValueAtTime(800, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + 0.55);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.65, t + 0.3);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.75);
    src.connect(bp); bp.connect(g); g.connect(this.master!);
    src.start(t); src.stop(t + 0.8);
    // exhale
    const src2 = this.noiseSource(false);
    const bp2 = ctx.createBiquadFilter();
    bp2.type = 'bandpass';
    bp2.Q.value = 0.9;
    bp2.frequency.setValueAtTime(1400, t + 0.9);
    bp2.frequency.exponentialRampToValueAtTime(500, t + 1.9);
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.0001, t + 0.9);
    g2.gain.exponentialRampToValueAtTime(0.35, t + 1.1);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 2.0);
    src2.connect(bp2); bp2.connect(g2); g2.connect(this.master!);
    src2.start(t + 0.9); src2.stop(t + 2.1);
    // heartbeat returns
    for (let b = 0; b < 4; b++) {
      for (const [off, amp] of [[0, 0.5], [0.16, 0.32]] as const) {
        const bt = t + 1.2 + b * 0.95 + off;
        const o = ctx.createOscillator();
        o.frequency.setValueAtTime(58, bt);
        o.frequency.exponentialRampToValueAtTime(40, bt + 0.16);
        const bg = ctx.createGain();
        bg.gain.setValueAtTime(amp, bt);
        bg.gain.exponentialRampToValueAtTime(0.001, bt + 0.2);
        o.connect(bg); bg.connect(this.master!);
        o.start(bt); o.stop(bt + 0.24);
      }
    }
  }

  shutdown() {
    if (!this.ctx) return;
    this.alarmStop();
    this.stopFlatline();
    try { void this.ctx.close(); } catch { /* noop */ }
    this.ctx = null;
    this.master = null;
    this.voiceOut = null;
    this.ventSrc = null;
    this.ventGain = null;
    this.ventLfo = null;
    this.ventLfoGain = null;
    this.infraGain = null;
    this.rainGain = null;
    this.flatOsc = null;
    this.rechargeGain = null;
    this.rechargeFilter = null;
    this.noiseBuf = null;
    this.voiceClarity = 0;
  }
}
