// ─────────────────────────────────────────────────────────────────────────────
// The 8-minute bleed-through script — synthesized from narrative_and_lore.md
// and narrative_and_convergence.md. Two overlapping channels:
//   • TERMINAL: green console text, security logs decaying into diagnostics
//   • VOICE:    the surgical team, muffled until 7:00, then in the room
// ─────────────────────────────────────────────────────────────────────────────

export type ScriptEvent =
  | { t: number; kind: 'term'; text: string; danger?: boolean; flash?: boolean }
  | { t: number; kind: 'voice'; text: string; urgent?: boolean; shake?: boolean }
  | { t: number; kind: 'fx'; fx: 'tilt' | 'vowelDecay' | 'filterDrop' | 'ekg' };

export const SCRIPT: ScriptEvent[] = [
  // ── PHASE 1 — COGNITIVE SETUP (0:00 – 3:00). The illusion is stable. ──
  { t: 15, kind: 'term', text: '> SYSTEM BOOT. SHIFT START. ALL WARDS SECURE.' },
  { t: 42, kind: 'term', text: '> PERIMETER SENSORS NOMINAL. EXTERIOR DOORS LOCKED.' },
  { t: 60, kind: 'voice', text: 'BP is dropping. Push two milligrams of epinephrine.' },
  { t: 75, kind: 'term', text: '> UNKNOWN AUDIO DETECTED ON FREQUENCY. ATTEMPTING FILTER...' },
  { t: 108, kind: 'term', text: '> CAM 4 MOTION SENSOR: FALSE POSITIVE. LOGGING.' },
  { t: 150, kind: 'term', text: '> ERROR: SIGNAL DECAY IN SECTOR 4.' },
  { t: 165, kind: 'voice', text: 'Check the central line. I am not getting a read.' },

  // ── PHASE 2 — SPATIAL DECAY (3:01 – 6:00). Architecture becomes anatomy. ──
  { t: 200, kind: 'term', text: '> WARNING: UNAUTHORIZED ACCESS IN ATRIUM. OXYGEN SATURATION DROPPING.' },
  { t: 224, kind: 'term', text: '> NOTE: HALLWAY LENGTHS DO NOT MATCH BUILDING SCHEMATIC.' },
  { t: 240, kind: 'voice', text: 'He is crashing! Get the crash cart in here now!', urgent: true },
  { t: 250, kind: 'term', text: '> CORRUPTION DETECTED. VENTRICLE SHUTDOWN IMMINENT.', danger: true },
  { t: 283, kind: 'term', text: '> REQUESTING BACKUP... BACKUP LINE DEAD.' },
  { t: 300, kind: 'fx', fx: 'tilt' }, // 5:00 — the UI starts to slip off its mounts
  { t: 315, kind: 'term', text: '> IT IS IN THE BLOODSTREAM. IT IS IN THE HALLWAYS.', danger: true },
  { t: 350, kind: 'voice', text: 'I cannot stop the bleeding! Clamp that artery!', urgent: true },

  // ── PHASE 3 — THE BREACH (6:01 – 8:00). Total systemic collapse. ──
  { t: 366, kind: 'term', text: '> THE WALLS ARE MEMBRANES. THE DOORS ARE VALVES.', danger: true },
  { t: 370, kind: 'term', text: '> MULTIPLE SYSTEM FAILURES. CORTEX COMPROMISED. DO NOT LET HIM IN.', danger: true },
  { t: 390, kind: 'fx', fx: 'vowelDecay' }, // 6:30 — labels lose their vowels
  { t: 405, kind: 'voice', text: 'Charge to two hundred! Clear! ... Nothing. Charge to three hundred! CLEAR!', urgent: true, shake: true },
  { t: 420, kind: 'fx', fx: 'filterDrop' }, // 7:00 — the low-pass wall snaps off
  { t: 421, kind: 'term', text: '> THEY ARE CUTTING INTO US. THEY ARE CUTTING INTO US.', danger: true },
  { t: 438, kind: 'term', text: '> MEMORY SECTOR 7 PURGED. REMAINING ASSET: SELF.', danger: true },
  { t: 450, kind: 'voice', text: 'Come on, stay with us! Do not you slip away!', urgent: true },
  { t: 465, kind: 'term', text: '> FLATLINE DETECTED. PURGING MEMORY BANKS.', danger: true, flash: true },
  { t: 479, kind: 'fx', fx: 'ekg' }, // 7:59 — the green line tears across
];

/** Ambient security-chatter to keep Phase 1 from feeling silent. */
export const AMBIENT_TERMS: string[] = [
  '> COFFEE MACHINE, FLOOR 2: OUT OF ORDER. AGAIN.',
  '> LOOP 7 ARCHIVE: 98% INTEGRITY.',
  '> NIGHT SHIFT LOG: NO INCIDENTS. NO VISITORS. NO ONE.',
  '> ELEVATOR B CALLED TO FLOOR 0. THERE IS NO FLOOR 0.',
  '> HEATING SYSTEM REPORT: COLD SPOT IN WING C.',
];

export const CAM_NAMES = ['NEONATAL UNIT', 'ICU // THE BODY', 'VENTILATOR VAULT', 'THE MORGUE'];

export const PHASE_NAMES = ['', 'COGNITIVE SETUP', 'SPATIAL DECAY', 'THE BREACH'];
