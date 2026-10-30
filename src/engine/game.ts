// ─────────────────────────────────────────────────────────────────────────────
// GAME CORE — the unyielding 480-second loop.
// Node graph: 0 NEONATAL ↔ 1 ICU ↔ 2 VAULT ↔ 3 MORGUE, booth = 4.
// The Reaper walks the graph toward the booth — but only while unobserved.
// ─────────────────────────────────────────────────────────────────────────────
import { SCRIPT, AMBIENT_TERMS } from '../data/script';

export const BOOTH = 4;
export const GAME_LENGTH = 480;

export type GameEvent =
  | { type: 'terminal'; text: string; danger?: boolean; flash?: boolean }
  | { type: 'voice'; text: string; urgent?: boolean; shake?: boolean; duration: number }
  | { type: 'impact' }
  | { type: 'staticBurst' }
  | { type: 'parryAnnounce'; cam: number; target: number }
  | { type: 'parryWindow'; cam: number; target: number; duration: number }
  | { type: 'parryHit' }
  | { type: 'parryFail'; cam: number }
  | { type: 'breachStart' }
  | { type: 'breachRepelled' }
  | { type: 'phase'; phase: 1 | 2 | 3 }
  | { type: 'adrenaline' }
  | { type: 'adrenalineEnd' }
  | { type: 'tilt' }
  | { type: 'vowelDecay' }
  | { type: 'filterDrop' }
  | { type: 'meltStart' }
  | { type: 'ekg' }
  | { type: 'stareCrash'; cam: number }
  | { type: 'moved'; node: number }
  | { type: 'defeat'; cause: 'signal' | 'breach' }
  | { type: 'victory' };

interface ParryState {
  stage: 'announce' | 'window';
  cam: number;
  target: number;
  windowStart: number;
  windowDur: number;
}

const MOVE_INTERVAL: Record<number, number> = { 1: 13, 2: 9, 3: 6.5 };
const PARRY_GAP: Record<number, [number, number]> = { 1: [18, 30], 2: [14, 22], 3: [10, 16] };
const PARRY_WINDOW: Record<number, number> = { 1: 2.0, 2: 1.2, 3: 0.8 };
const PARRY_TOLERANCE: Record<number, number> = { 1: 5, 2: 4, 3: 3.5 };
const DECAY_RATE: Record<number, number> = { 1: 1.5, 2: 2.0, 3: 3.0 }; // Phase 3 = 2× Phase 1
const STARE_LIMIT = 3.0;

export class GameCore {
  t = 0;
  running = false;
  signal = 100;
  phase: 1 | 2 | 3 = 1;
  reaperNode = 3; // rises from the morgue
  reaperFreezeUntil = -1;
  burned: boolean[] = [false, false, false, false];
  camOfflineUntil: number[] = [0, 0, 0, 0];
  doses = 3;
  drainUntil = -1;      // adrenaline 3× drain window
  shakeUntil = -1;      // adrenaline CSS-shake window
  breach: { tStart: number; hold: number } | null = null;
  parry: ParryState | null = null;
  melt = 0;
  /** Judge Mode: threat contained, no death, no timeline — learn by doing. */
  training = false;

  private nextMoveAt = 12;
  private nextParryAt = 24;
  private nextAmbientAt = 30;
  private ambientIdx = 0;
  private scriptIdx = 0;
  private stare = 0;
  private flags = new Set<string>();

  constructor(
    private emit: (e: GameEvent) => void,
    private getSlider: () => number,
    private speak: (text: string, urgent?: boolean) => number,
  ) {}

  start() {
    this.running = true;
    this.emit({ type: 'terminal', text: '> ACQUIRING FEED... OK.' });
  }

  startTraining() {
    this.training = true;
    this.running = true;
    this.signal = 42;
    this.nextParryAt = Infinity; // parries are triggered manually by the guide
    this.emit({ type: 'terminal', text: '> TRAINING MODE. THREAT CONTAINED. NO CLOCK. TAKE YOUR TIME.' });
  }

  /** Guide-triggered corruption wave so the judge can try a parry safely. */
  forceParry() {
    if (this.parry || !this.running) return;
    const live = [0, 1, 2, 3].filter((c) => !this.burned[c]);
    if (live.length === 0) return;
    const pcam = live[Math.floor(Math.random() * live.length)];
    const target = Math.round((30 + Math.random() * 80) * 2) / 2;
    this.parry = { stage: 'announce', cam: pcam, target, windowStart: this.t + 2.3, windowDur: 3.0 };
    this.emit({ type: 'parryAnnounce', cam: pcam, target });
  }

  /** Guide-triggered breach so the judge can drill the discharge. */
  forceBreach() {
    if (!this.running || this.breach) return;
    this.reaperNode = BOOTH;
    this.breach = { tStart: this.t, hold: 0 };
    this.emit({ type: 'breachStart' });
    this.emit({ type: 'moved', node: BOOTH });
  }

  camObserved(cam: number, recharging: boolean): boolean {
    return !recharging && cam === this.reaperNode && this.reaperNode < 4 && !this.burned[cam];
  }

  update(dt: number, cam: number, space: boolean) {
    if (!this.running) return;
    this.t += dt;
    const t = this.t;

    // ── phase escalation ──
    const newPhase: 1 | 2 | 3 = t < 180 ? 1 : t < 360 ? 2 : 3;
    if (newPhase !== this.phase) {
      this.phase = newPhase;
      this.emit({ type: 'phase', phase: newPhase });
    }

    // ── the scripted bleed-through ──
    while (!this.training && this.scriptIdx < SCRIPT.length && SCRIPT[this.scriptIdx].t <= t) {
      const ev = SCRIPT[this.scriptIdx++];
      if (ev.kind === 'term') {
        this.emit({ type: 'terminal', text: ev.text, danger: ev.danger, flash: ev.flash });
      } else if (ev.kind === 'voice') {
        const dur = this.speak(ev.text, ev.urgent);
        this.emit({ type: 'voice', text: ev.text, urgent: ev.urgent, shake: ev.shake, duration: dur });
      } else {
        if (ev.fx === 'tilt') this.emit({ type: 'tilt' });
        else if (ev.fx === 'vowelDecay') this.emit({ type: 'vowelDecay' });
        else if (ev.fx === 'filterDrop') this.emit({ type: 'filterDrop' });
        else if (ev.fx === 'ekg') this.emit({ type: 'ekg' });
      }
    }

    // ── ambient security chatter (Phase 1 only) ──
    if (!this.training && this.phase === 1 && t >= this.nextAmbientAt && this.ambientIdx < AMBIENT_TERMS.length) {
      this.emit({ type: 'terminal', text: AMBIENT_TERMS[this.ambientIdx++] });
      this.nextAmbientAt = t + 24 + Math.random() * 10;
    }

    // ── melt (7:30 → 8:00) ──
    if (!this.training && t >= 450 && !this.flags.has('melt')) {
      this.flags.add('melt');
      this.emit({ type: 'meltStart' });
    }
    this.melt = this.training ? 0 : Math.min(1, Math.max(0, (t - 450) / 30));

    // ── the signal meter: defibrillator charge, always bleeding out ──
    if (!this.breach) {
      if (space) {
        this.signal = Math.min(100, this.signal + 16 * dt);
      } else {
        let rate = this.training ? 0.35 : DECAY_RATE[this.phase];
        if (!this.training && t < this.drainUntil) rate *= 3; // adrenaline penalty
        if (!this.training && this.melt > 0) rate *= 0.6;
        this.signal -= rate * dt;
      }
      if (this.training) {
        this.signal = Math.max(18, this.signal); // it never dies in training
      } else if (this.signal <= 0) {
        this.signal = 0;
        this.finish('defeat', { type: 'defeat', cause: 'signal' });
        return;
      }
    }

    // ── breach: it is at the door. Hold SPACE to discharge. ──
    if (this.breach) {
      if (space) {
        this.breach.hold += dt / 0.9;
        this.signal = Math.min(100, this.signal + 5 * dt);
        if (this.breach.hold >= 1) {
          this.breach = null;
          this.reaperNode = 2; // hurled back to the vault
          this.nextMoveAt = t + 7;
          this.emit({ type: 'breachRepelled' });
          this.emit({ type: 'impact' });
          this.emit({ type: 'terminal', text: '> SURGE DISCHARGED. ENTITY REPELLED TWO SECTORS.' });
        }
      } else {
        this.breach.hold = Math.max(0, this.breach.hold - dt * 1.6);
      }
      if (this.breach && !this.training && t - this.breach.tStart > 6.5) {
        this.finish('defeat', { type: 'defeat', cause: 'breach' });
        return;
      }
    }

    // ── the Reaper walks — never while observed, never while blinded ──
    const frozen = t < this.reaperFreezeUntil;
    if (!this.training && !frozen && !this.breach && t >= this.nextMoveAt && !this.isMeltOver()) {
      const observed = this.camObserved(cam, space);
      if (observed) {
        this.nextMoveAt = t + 1.5; // it waits, patient as death
      } else {
        const from = this.reaperNode;
        this.reaperNode = this.stepNode(from);
        this.nextMoveAt = t + MOVE_INTERVAL[this.phase] * (0.8 + Math.random() * 0.4);
        if (this.reaperNode !== from) {
          this.emit({ type: 'moved', node: this.reaperNode });
          if (this.reaperNode === BOOTH) {
            this.breach = { tStart: t, hold: 0 };
            this.emit({ type: 'breachStart' });
          } else if (this.reaperNode === 0 || this.reaperNode === 1 || this.phase >= 2) {
            this.emit({ type: 'impact' }); // adjacent room — the lights bow
          }
        }
      }
    }

    // ── staring into missing data (Phase 2+): the feed crashes ──
    if (!this.training && this.phase >= 2 && this.camObserved(cam, space) && !frozen) {
      this.stare += dt;
      if (this.stare > STARE_LIMIT) {
        this.stare = 0;
        this.signal = Math.max(0, this.signal - 12);
        this.camOfflineUntil[cam] = t + 4;
        this.emit({ type: 'stareCrash', cam });
        this.emit({ type: 'staticBurst' });
        this.emit({ type: 'terminal', text: '> OPTICS OVERLOAD. FEED RECALIBRATING...', danger: true });
      }
    } else {
      this.stare = Math.max(0, this.stare - dt * 2);
    }

    // ── parry machine ──
    if (!this.parry && !frozen && t >= this.nextParryAt && this.melt === 0) {
      const live = [0, 1, 2, 3].filter((c) => !this.burned[c]);
      if (live.length > 0) {
        const pcam = live[Math.floor(Math.random() * live.length)];
        const target = Math.round((30 + Math.random() * 80) * 2) / 2;
        this.parry = { stage: 'announce', cam: pcam, target, windowStart: t + 2.3, windowDur: PARRY_WINDOW[this.phase] };
        this.emit({ type: 'parryAnnounce', cam: pcam, target });
      }
    }
    if (this.parry) {
      if (this.parry.stage === 'announce' && t >= this.parry.windowStart) {
        this.parry.stage = 'window';
        this.emit({ type: 'parryWindow', cam: this.parry.cam, target: this.parry.target, duration: this.parry.windowDur });
      } else if (this.parry.stage === 'window' && t >= this.parry.windowStart + this.parry.windowDur) {
        this.resolveParry(this.getSlider());
      }
    }

    // ── adrenaline expiry ──
    if (this.flags.has('adr') && t >= this.shakeUntil) {
      this.flags.delete('adr');
      this.emit({ type: 'adrenalineEnd' });
    }

    // ── 8:00 — convergence resolves ──
    if (!this.training && t >= GAME_LENGTH) {
      this.finish('victory', { type: 'victory' });
    }
  }

  private isMeltOver(): boolean {
    return this.melt >= 1;
  }

  private stepNode(from: number): number {
    // retreat bias when the phase is young; relentless later
    if (this.phase === 1 && Math.random() < 0.3 && from < 3) return from + 1;
    if (from === 3) return 2;
    if (from === 2) return 1;
    if (from === 1) return Math.random() < 0.72 ? BOOTH : 0;
    if (from === 0) return BOOTH;
    return 2;
  }

  /** Player slams ENTER — is the slider on the target frequency? */
  confirmParry(value: number) {
    if (!this.parry || this.parry.stage !== 'window') return;
    this.resolveParry(value);
  }

  private resolveParry(value: number) {
    const p = this.parry;
    if (!p) return;
    this.parry = null;
    const gap = PARRY_GAP[this.phase];
    this.nextParryAt = this.t + gap[0] + Math.random() * (gap[1] - gap[0]);
    if (Math.abs(value - p.target) <= PARRY_TOLERANCE[this.phase]) {
      // DEFLECTED — hurled back two rooms, grid reboots +10%
      const order = [3, 2, 1, 0];
      const idx = order.indexOf(this.reaperNode === BOOTH ? 1 : this.reaperNode);
      const newIdx = Math.min(3, (idx === -1 ? 1 : idx) + 2);
      this.reaperNode = order[newIdx];
      if (this.breach) this.breach = null;
      this.signal = Math.min(100, this.signal + 10);
      this.emit({ type: 'parryHit' });
      this.emit({ type: 'moved', node: this.reaperNode });
      this.emit({ type: 'terminal', text: '> WAVE DEFLECTED. ENTITY PUSHED BACK 2 SECTORS. GRID +10%.' });
    } else {
      // MISSED — the lens burns out for good (forgiven in training)
      if (!this.training) this.burned[p.cam] = true;
      this.emit({ type: 'parryFail', cam: p.cam });
      this.emit({
        type: 'terminal',
        text: this.training
          ? `> PARRY MISSED: CAM ${p.cam + 1}. IN A REAL SHIFT THAT FEED WOULD BE GONE.`
          : `> OPTICS BURNED OUT: CAM ${p.cam + 1}. FEED LOST PERMANENTLY.`,
        danger: !this.training,
      });
    }
  }

  /** Syringe pump override: blind it for 15s, pay for 60. */
  adrenaline(): boolean {
    if (this.doses <= 0 || this.t < this.reaperFreezeUntil || !this.running || this.melt > 0) return false;
    this.doses -= 1;
    this.reaperFreezeUntil = this.t + 15;
    this.drainUntil = this.t + 60;
    this.shakeUntil = this.t + 60;
    this.flags.add('adr');
    this.emit({ type: 'adrenaline' });
    this.emit({ type: 'terminal', text: '> SYRINGE PUMP OVERRIDE. ADRENALINE SURGE — 15 SECOND BLIND.' });
    return true;
  }

  private finish(key: 'defeat' | 'victory', ev: GameEvent) {
    if (this.flags.has('ended')) return;
    this.flags.add('ended');
    this.running = false;
    this.emit(ev);
    void key;
  }
}
