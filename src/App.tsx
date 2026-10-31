// ─────────────────────────────────────────────────────────────────────────────
// EIGHT MINUTES UNDER — a night-shift survival vigil.
// You are the security guard. You are also the body on the table.
// Survive the 480-second convergence.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react';
import { PostRenderer } from './engine/renderer';
import { HorrorAudio } from './engine/audio';
import { GameCore, BOOTH, GAME_LENGTH, type GameEvent } from './engine/game';
import { CAM_NAMES, PHASE_NAMES } from './data/script';
import imgDesk from './assets/img/desk.jpg';
import imgCam0 from './assets/img/cam0.jpg';
import imgCam1 from './assets/img/cam1.jpg';
import imgCam2 from './assets/img/cam2.jpg';
import imgCam3 from './assets/img/cam3.jpg';
import imgOr from './assets/img/or.jpg';

type Screen = 'menu' | 'transition' | 'playing' | 'defeat' | 'victory';

interface LogLine {
  id: number;
  text: string;
  danger?: boolean;
  flash?: boolean;
}

interface ParryUI {
  stage: 'announce' | 'window';
  cam: number;
  target: number;
  dur: number;
}

const CAM_TEX = ['cam0', 'cam1', 'cam2', 'cam3'];
const MONITOR_UV: [number, number] = [0.625, 0.5];
const REAPER_VIS: Record<number, { pos: [number, number]; size: number }> = {
  3: { pos: [0.6, 0.44], size: 0.11 },
  2: { pos: [0.42, 0.5], size: 0.145 },
  1: { pos: [0.56, 0.52], size: 0.18 },
  0: { pos: [0.46, 0.47], size: 0.22 },
};
const DEATH_TEXT = '> RESUSCITATION FAILED. TIME OF DEATH: 12:08 AM.';
const WIN_TEXT = '> PULSE RESTORED. WELCOME BACK.';

// ── JUDGE MODE: a playable step-by-step tour inside a contained shift ─────
interface GuideStep {
  id: string;
  title: string;
  body: string;
  hi?: string[]; // data-guide targets to spotlight
}

const GUIDE_STEPS: GuideStep[] = [
  {
    id: 'welcome',
    title: 'WELCOME TO SHIFT 3',
    body: 'You are the night guard at St. Lazarus General. You are also — though you do not know it yet — the body on the operating table. In a real shift you survive 8 unpausable minutes. Here, the threat is contained. Learn the desk first.',
  },
  {
    id: 'cams',
    title: '01 · THE CCTV BANK',
    hi: ['cams'],
    body: 'Four wards, four keys. Press [1] [2] [3] [4] and visit every camera at least once. Watch how each feed carries its own light and its own dread.',
  },
  {
    id: 'thermal',
    title: '02 · CAM 4 — FALSE-COLOR THERMAL',
    hi: ['cams', 'camlabel'],
    body: 'The morgue renders in thermal infrared. If the Reaper is down there he appears as absolute zero — a freezing void erasing the heat signatures. Press [4].',
  },
  {
    id: 'signal',
    title: '03 · DEFIBRILLATOR CHARGE',
    hi: ['vitals'],
    body: 'This bar is your life. It bleeds out constantly in a real shift. Hold [SPACE] to recharge it above 85% — and notice the feed cuts to static while you do. Charging means going blind.',
  },
  {
    id: 'parry',
    title: '04 · SIGNAL PARRY',
    hi: ['freq'],
    body: 'The Reaper attacks with corruption waves. A target frequency will appear — drag the slider onto it and slam [ENTER] before the bar empties. Here comes a practice wave now.',
  },
  {
    id: 'threat',
    title: '05 · THE REAPER',
    hi: ['camlabel', 'threat'],
    body: 'Press [2]. That shifting block of missing data is the Reaper. It only moves when you are NOT watching its camera. Stare at it — it freezes. Look away — it creeps toward your booth.',
  },
  {
    id: 'prox',
    title: '06 · PROXIMITY ALARM',
    hi: ['threat'],
    body: 'Top-right tells you how close it is. Four red LEDs and it is at your door. When that happens in a real shift, hold [SPACE] to discharge the defibrillator and hurl it back — you get 6.5 seconds.',
  },
  {
    id: 'breach',
    title: '07 · BREACH DRILL',
    hi: ['vitals'],
    body: 'Drill time. The entity is at the booth door right now. HOLD [SPACE] until the discharge bar fills and it is repelled.',
  },
  {
    id: 'adr',
    title: '08 · ADRENALINE SURGE',
    hi: ['syringe'],
    body: 'Three doses per shift. Press [X]: the Reaper is blinded for 15 seconds, then for 60 seconds your power drains 3× faster and the whole booth shakes. A panic button with a price.',
  },
  {
    id: 'timeline',
    title: '09 · THE 8 MINUTES',
    body: 'Wear headphones. 19Hz infrasound builds as phases escalate. At 5:00 the UI slips off its mounts; at 6:30 the text rots; at 7:00 the surgeons’ voices snap crystal clear; at 7:30 the tape burns away. At 8:00 it ends — one way or the other. Good luck.',
  },
];

function fmtClock(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function App() {
  // ── DOM refs ──
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const timerEl = useRef<HTMLSpanElement>(null);
  const wallEl = useRef<HTMLSpanElement>(null);
  const sigFill = useRef<HTMLDivElement>(null);
  const sigText = useRef<HTMLSpanElement>(null);
  const sigWrap = useRef<HTMLDivElement>(null);
  const breachBar = useRef<HTMLDivElement>(null);
  const parryBar = useRef<HTMLDivElement>(null);
  const typeEl = useRef<HTMLSpanElement>(null);

  // ── engine refs ──
  const rendererRef = useRef<PostRenderer | null>(null);
  const audioRef = useRef<HorrorAudio | null>(null);
  const gameRef = useRef<GameCore | null>(null);
  const inputRef = useRef({ space: false });
  const sliderRef = useRef(60);
  const S = useRef({
    screen: 'menu' as Screen,
    bootDone: false,
    transStart: 0,
    endStart: 0,
    hitchUntil: 0,
    reaperAmt: 0,
    camShakeUntil: 0,
    lastSpace: false,
    beepAcc: 0,
    last: 0,
    logId: 0,
    typing: null as { id: number; idx: number } | null,
    guideMode: false,
  });
  const camRef = useRef(0);
  const logLinesRef = useRef<LogLine[]>([]);
  const subtitleTimeout = useRef<number | null>(null);
  const decayInterval = useRef<number | null>(null);

  // ── UI state (discrete only — fast values go through refs) ──
  const [screen, setScreenState] = useState<Screen>('menu');
  const [bootReady, setBootReady] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [cam, setCamState] = useState(0);
  const [burned, setBurned] = useState([false, false, false, false]);
  const [parry, setParry] = useState<ParryUI | null>(null);
  const [breach, setBreach] = useState(false);
  const [doses, setDoses] = useState(3);
  const [phase, setPhase] = useState<1 | 2 | 3>(1);
  const [threatNode, setThreatNode] = useState(3);
  const [tilt, setTilt] = useState(false);
  const [decay, setDecay] = useState(false);
  const [meltOn, setMeltOn] = useState(false);
  const [ekg, setEkg] = useState(false);
  const [subtitle, setSubtitle] = useState<{ text: string; urgent: boolean } | null>(null);
  const [lines, setLines] = useState<LogLine[]>([]);
  const [typingId, setTypingId] = useState<number | null>(null);
  const [toast, setToast] = useState<'hit' | 'fail' | null>(null);
  const [recharging, setRecharging] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [defeatPhase, setDefeatPhase] = useState<'black' | 'light' | 'crashed'>('black');
  const [defeatText, setDefeatText] = useState('');
  const [victoryPhase, setVictoryPhase] = useState<'static' | 'light'>('static');
  const [victoryText, setVictoryText] = useState('');
  const [clockNow, setClockNow] = useState(() => new Date());
  const [exitGlitch, setExitGlitch] = useState(false);
  const [guideMode, setGuideMode] = useState(false);
  const [guideStep, setGuideStep] = useState(0);

  const guideActiveRef = useRef(false);
  const guideStepRef = useRef(0);
  const guideLockRef = useRef(false);
  const guideVisited = useRef<Set<number>>(new Set());
  const guideThreatSeen = useRef(false);
  const guideParryDone = useRef(false);
  const guideBreachDone = useRef(false);

  const setScreen = useCallback((s: Screen) => {
    S.current.screen = s;
    setScreenState(s);
  }, []);

  const setCam = useCallback((c: number) => {
    camRef.current = c;
    setCamState(c);
  }, []);

  // ── terminal log with character-by-character typing ──
  const addLog = useCallback((text: string, danger?: boolean, flash?: boolean) => {
    const id = ++S.current.logId;
    logLinesRef.current = [...logLinesRef.current.slice(-7), { id, text, danger, flash }];
    setLines(logLinesRef.current);
    S.current.typing = { id, idx: 0 };
    setTypingId(id);
  }, []);

  // ── endings ──
  const startDefeat = useCallback((cause: 'signal' | 'breach') => {
    setScreen('defeat');
    setBreach(false);
    S.current.endStart = performance.now();
    rootRef.current?.classList.remove('adr-shake', 'impact');
    if (decayInterval.current) window.clearInterval(decayInterval.current);
    const a = audioRef.current;
    a?.alarmStop();
    a?.setVentFrantic(false);
    a?.setRecharge(false, 0);
    a?.flatline();
    setDefeatPhase('black');
    setDefeatText('');
    window.setTimeout(() => setDefeatPhase('light'), 900);
    window.setTimeout(() => {
      try { window.close(); } catch { /* browsers resist — good, the void takes over instead */ }
      setDefeatPhase('crashed');
    }, 3900);
    void cause;
  }, [setScreen]);

  const startVictory = useCallback(() => {
    setScreen('victory');
    setBreach(false);
    S.current.endStart = performance.now();
    rootRef.current?.classList.remove('adr-shake', 'impact');
    if (decayInterval.current) window.clearInterval(decayInterval.current);
    const a = audioRef.current;
    a?.alarmStop();
    a?.setVentFrantic(false);
    a?.setRecharge(false, 0);
    a?.stopFlatline();
    a?.staticBurst(0.7, 0.3);
    setVictoryPhase('static');
    setVictoryText('');
    window.setTimeout(() => a?.gasp(), 450);
    window.setTimeout(() => setVictoryPhase('light'), 950);
  }, [setScreen]);

  // type ending text once the light is up
  useEffect(() => {
    if (screen === 'defeat' && defeatPhase === 'light') {
      let i = 0;
      const iv = window.setInterval(() => {
        i++;
        setDefeatText(DEATH_TEXT.slice(0, i));
        if (i >= DEATH_TEXT.length) window.clearInterval(iv);
      }, 42);
      return () => window.clearInterval(iv);
    }
    if (screen === 'victory' && victoryPhase === 'light') {
      let i = 0;
      const iv = window.setInterval(() => {
        i++;
        setVictoryText(WIN_TEXT.slice(0, i));
        if (i >= WIN_TEXT.length) window.clearInterval(iv);
      }, 55);
      return () => window.clearInterval(iv);
    }
  }, [screen, defeatPhase, victoryPhase]);

  // ── the unified event handler: game logic → juice ──
  const onEvent = useCallback((e: GameEvent) => {
    const a = audioRef.current;
    const root = rootRef.current;
    switch (e.type) {
      case 'terminal':
        addLog(e.text, e.danger, e.flash);
        break;
      case 'voice':
        setSubtitle({ text: e.text, urgent: !!e.urgent });
        if (subtitleTimeout.current) window.clearTimeout(subtitleTimeout.current);
        subtitleTimeout.current = window.setTimeout(() => setSubtitle(null), e.duration * 1000 + 900);
        if (e.shake) S.current.camShakeUntil = performance.now() + 4000;
        break;
      case 'impact':
        S.current.hitchUntil = performance.now() + 70; // 3-frame hitch
        root?.classList.add('impact');
        window.setTimeout(() => root?.classList.remove('impact'), 110);
        a?.subDrop();
        break;
      case 'staticBurst':
        a?.staticBurst(0.4, 0.3);
        break;
      case 'parryAnnounce':
        a?.parrySting();
        setParry({ stage: 'announce', cam: e.cam, target: e.target, dur: 0 });
        break;
      case 'parryWindow':
        a?.staticBurst(0.5, 0.16);
        setParry({ stage: 'window', cam: e.cam, target: e.target, dur: e.duration });
        break;
      case 'parryHit':
        setParry(null);
        a?.parryHit();
        guideParryDone.current = true;
        setToast('hit');
        window.setTimeout(() => setToast(null), 1300);
        root?.classList.add('reboot');
        window.setTimeout(() => root?.classList.remove('reboot'), 450);
        break;
      case 'parryFail':
        setParry(null);
        a?.parryFail();
        guideParryDone.current = true;
        setToast('fail');
        window.setTimeout(() => setToast(null), 1600);
        setBurned((b) => b.map((v, i) => (i === e.cam ? true : v)));
        break;
      case 'breachStart':
        setBreach(true);
        a?.alarmStart();
        a?.defibCharge(6.0);
        S.current.hitchUntil = performance.now() + 90;
        root?.classList.add('impact');
        window.setTimeout(() => root?.classList.remove('impact'), 130);
        a?.subDrop();
        break;
      case 'breachRepelled':
        setBreach(false);
        a?.alarmStop();
        guideBreachDone.current = true;
        addLog('> DRILL COMPLETE. IN A REAL SHIFT THAT SAVED YOUR LIFE.');
        break;
      case 'phase':
        setPhase(e.phase);
        a?.setInfra(e.phase === 1 ? 0.15 : e.phase === 2 ? 0.55 : 1.0);
        addLog(`> PHASE ${e.phase} PROTOCOL: ${PHASE_NAMES[e.phase]}.`);
        break;
      case 'adrenaline': {
        const g = gameRef.current;
        if (g) setDoses(g.doses);
        a?.setVentFrantic(true);
        root?.classList.add('adr-shake');
        break;
      }
      case 'adrenalineEnd':
        a?.setVentFrantic(false);
        root?.classList.remove('adr-shake');
        break;
      case 'tilt':
        setTilt(true);
        addLog('> MOUNTING BRACKETS LOOSENING. INTERFACE MISALIGNED.');
        break;
      case 'vowelDecay':
        setDecay(true);
        addLog('> TEXT RENDERER: GLYPH BUFFER CORRUPTED.', true);
        decayInterval.current = window.setInterval(() => setNonce((n) => n + 1), 700);
        break;
      case 'filterDrop':
        a?.filterDrop();
        addLog('> AUDIO FILTER: OFF. THEY ARE IN THE ROOM.', true);
        break;
      case 'meltStart':
        setMeltOn(true);
        break;
      case 'ekg':
        setEkg(true);
        a?.beep(1150, 0.1);
        a?.flatline(); // the tone rises as the green line tears across
        window.setTimeout(() => setEkg(false), 2600);
        break;
      case 'stareCrash':
        a?.staticBurst(0.5, 0.32);
        break;
      case 'moved':
        setThreatNode(e.node);
        break;
      case 'defeat':
        startDefeat(e.cause);
        break;
      case 'victory':
        startVictory();
        break;
    }
  }, [addLog, startDefeat, startVictory]);

  // ── guide flow (declared after onEvent/addLog) ──
  const guideNext = useCallback(() => {
    if (guideLockRef.current) return;
    if (guideStepRef.current >= GUIDE_STEPS.length - 1) return;
    const stepId = GUIDE_STEPS[guideStepRef.current]?.id;
    const g = gameRef.current;
    const ready =
      stepId === 'welcome' ||
      stepId === 'prox' ||
      (stepId === 'cams' && guideVisited.current.size >= 4) ||
      (stepId === 'thermal' && guideVisited.current.has(3)) ||
      (stepId === 'signal' && (g?.signal ?? 0) >= 85) ||
      (stepId === 'parry' && guideParryDone.current) ||
      (stepId === 'threat' && guideThreatSeen.current) ||
      (stepId === 'breach' && guideBreachDone.current) ||
      (stepId === 'adr' && (g?.doses ?? 3) < 3);
    if (!ready) return;
    guideLockRef.current = true;
    guideParryDone.current = false;
    guideBreachDone.current = false;
    setGuideStep((s) => s + 1);
    audioRef.current?.uiBlip();
    addLog('> STEP COMPLETE ✓');
  }, [addLog]);

  // spotlight the relevant HUD element + fire per-step side effects
  useEffect(() => {
    guideStepRef.current = guideStep;
    guideLockRef.current = false;
    document.querySelectorAll('.guide-hi').forEach((el) => el.classList.remove('guide-hi'));
    if (!guideMode) return;
    const step = GUIDE_STEPS[guideStep];
    document.querySelectorAll('[data-guide]').forEach((el) => {
      el.classList.toggle('guide-hi', !!step?.hi?.includes(el.getAttribute('data-guide') ?? ''));
    });
    const g = gameRef.current;
    if (step?.id === 'parry') g?.forceParry();
    if (step?.id === 'threat' && g) {
      g.reaperNode = 1; // park the Reaper on the ICU feed so the judge can see it
      g.reaperFreezeUntil = -1;
    }
    if (step?.id === 'breach') g?.forceBreach();
    if (step?.id === 'cams' || step?.id === 'thermal') guideVisited.current.clear();
    if (step?.id === 'threat') guideThreatSeen.current = false;
  }, [guideStep, guideMode]);

  const beginGuide = useCallback(() => {
    if (!S.current.bootDone) return;
    const a = audioRef.current;
    a?.ensure();
    a?.uiBlip();
    S.current.guideMode = true;
    guideActiveRef.current = true;
    guideVisited.current.clear();
    guideThreatSeen.current = false;
    guideParryDone.current = false;
    guideBreachDone.current = false;
    setGuideStep(0);
    setGuideMode(true);
    S.current.transStart = performance.now();
    setScreen('transition');
  }, [setScreen]);

  /** Final step → drop the training wheels and run the real shift. */
  const launchRealShift = useCallback(() => {
    S.current.guideMode = false;
    guideActiveRef.current = false;
    setGuideMode(false);
    gameRef.current = new GameCore(
      onEvent,
      () => sliderRef.current,
      (text, urgent) => audioRef.current?.speak(text, { urgent }) ?? 2.5,
    );
    S.current.reaperAmt = 0;
    setDoses(3);
    setThreatNode(3);
    audioRef.current?.uiBlip();
    S.current.transStart = performance.now();
    setScreen('transition');
  }, [onEvent, setScreen]);

  // ── boot: renderer, textures, audio, game, rAF loop ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer: PostRenderer;
    try {
      renderer = new PostRenderer(canvas);
    } catch {
      return;
    }
    rendererRef.current = renderer;
    const audio = new HorrorAudio();
    audioRef.current = audio;
    const game = new GameCore(
      onEvent,
      () => sliderRef.current,
      (text, urgent) => audioRef.current?.speak(text, { urgent }) ?? 2.5,
    );
    gameRef.current = game;

    void Promise.all([
      renderer.loadTexture('desk', imgDesk),
      renderer.loadTexture('cam0', imgCam0),
      renderer.loadTexture('cam1', imgCam1),
      renderer.loadTexture('cam2', imgCam2),
      renderer.loadTexture('cam3', imgCam3),
      renderer.loadTexture('or', imgOr),
    ]).then(() => {
      S.current.bootDone = true;
      setBootReady(true);
    });

    const menuClock = window.setInterval(() => setClockNow(new Date()), 1000);

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const st = S.current;
      const g = gameRef.current;
      if (!g) return;
      if (st.last === 0) st.last = now;
      const elapsed = Math.max(0, (now - st.last) / 1000);
      st.last = now;
      const dt = Math.min(0.05, elapsed);

      const space = inputRef.current.space && st.screen === 'playing';
      const t = now / 1000;

      // ── advance the simulation ──
      if (st.screen === 'playing' && elapsed > 0) {
        // requestAnimationFrame is throttled in background tabs. Simulate all
        // elapsed slices on return so the 8-minute shift cannot be paused.
        let remaining = elapsed;
        while (remaining > 0.000001 && st.screen === 'playing') {
          const step = Math.min(0.05, remaining);
          g.update(step, camRef.current, inputRef.current.space);
          remaining -= step;
        }
        if (space !== st.lastSpace) {
          audioRef.current?.setRecharge(space, g.signal / 100);
          st.lastSpace = space;
          setRecharging(space);
        }
        // heart monitor — slows as the signal dies
        st.beepAcc += dt;
        const interval = 1.35 - (g.signal / 100) * 0.75;
        if (st.beepAcc > interval) {
          st.beepAcc = 0;
          audioRef.current?.beep(1150, g.signal < 25 ? 0.05 : 0.075);
        }

        // JUDGE MODE — advance the step once the judge has really done the thing
        if (guideActiveRef.current) {
          const stp = GUIDE_STEPS[guideStepRef.current];
          if (stp) {
            const done =
              (stp.id === 'cams' && guideVisited.current.size >= 4) ||
              (stp.id === 'thermal' && guideVisited.current.has(3)) ||
              (stp.id === 'signal' && g.signal >= 85) ||
              (stp.id === 'parry' && guideParryDone.current) ||
              (stp.id === 'threat' && guideThreatSeen.current) ||
              (stp.id === 'breach' && guideBreachDone.current) ||
              (stp.id === 'adr' && g.doses < 3);
            if (done) guideNext();
          }
        }
      }

      // ── build uniforms ──
      let scene = 'desk';
      let zoom = 1, curve = 0.18, tear = 0.16, grain = 0.075, scan = 0.55;
      let aberration = 0.0022, thermal = 0, staticMix = 0, whiteout = 0, dark = 0;
      let melt = 0, meltTime = 0;
      let zoomTarget: [number, number] = [0.5, 0.5];
      let pan: [number, number] = [0, 0];
      let rPos: [number, number] = [0.5, 0.5];
      let rSize = 0.15, rAmt = 0, rVoid = 0, rFrozen = 0;

      if (st.screen === 'menu' || st.screen === 'transition') {
        // diorama drift — the security desk breathes
        pan = [Math.sin(t * 0.11) * 0.010, Math.sin(t * 0.07 + 1.3) * 0.008];
        aberration = 0.0022 + Math.sin(t * 2.3) * 0.0008;
        tear = 0.16 + Math.sin(t * 0.5) * 0.08;
        if (st.screen === 'transition') {
          const p = Math.min(1, (now - st.transStart) / 1500);
          const e = p * p * p; // accelerating push
          zoom = 1 + e * 34;
          zoomTarget = MONITOR_UV;
          aberration = 0.003 + e * 0.075;
          tear = 0.2 + e * 1.2;
          grain = 0.075 + e * 0.12;
          whiteout = Math.max(0, (p - 0.82) / 0.18);
          if (p >= 1) {
            setScreen('playing');
            audioRef.current?.stopRain();
            audioRef.current?.startAmbience();
            if (S.current.guideMode) {
              g.startTraining();
              audioRef.current?.setInfra(0.12);
              addLog('> GUIDED SHIFT. FOLLOW THE AMBER PROMPTS.');
            } else {
              g.start();
              audioRef.current?.setInfra(0.15);
              addLog('> FEED LOCKED. SHIFT CLOCK RUNNING. 8 MINUTES.');
            }
          }
        }
      } else if (st.screen === 'playing') {
        const effective = inputRef.current.space ? -1 : camRef.current;
        scene = effective >= 0 ? CAM_TEX[effective] : CAM_TEX[camRef.current];
        curve = 0.2;
        scan = 0.6;
        grain = 0.08 + (t < g.shakeUntil ? 0.04 : 0);
        tear = 0.14 + g.phase * 0.05 + (t < g.shakeUntil ? 0.22 : 0) + g.melt * 0.3;
        aberration = 0.0025 + (g.phase - 1) * 0.004 + st.reaperAmt * 0.012;

        // feed state
        const offline = effective >= 0 && g.camOfflineUntil[effective] > g.t;
        staticMix = inputRef.current.space
          ? 0.92
          : effective >= 0 && g.burned[effective]
            ? 1
            : offline
              ? 0.75 + 0.2 * Math.sin(t * 43)
              : 0;
        thermal = effective === 3 && !g.burned[3] ? 1 : 0;

        // per-feed slow drift
        zoom = 1.07 + 0.015 * Math.sin(t * 0.05 + camRef.current * 2.1);
        pan = [Math.sin(t * 0.09 + camRef.current) * 0.004, Math.sin(t * 0.06) * 0.003];
        if (camRef.current === 1 && now < S.current.camShakeUntil) {
          // CAM 2 convulses when the script charges the paddles
          pan = [(Math.random() - 0.5) * 0.014, (Math.random() - 0.5) * 0.014];
          zoom += 0.01;
        }

        // the Reaper — visible only on his camera, unless he is at the door
        const frozenNow = g.t < g.reaperFreezeUntil;
        rFrozen = frozenNow ? 1 : 0;
        let targetAmt = 0;
        if (g.breach) {
          targetAmt = inputRef.current.space ? 0.55 : 0.9;
          rSize = 0.5;
          rPos = [0.5 + (Math.random() - 0.5) * 0.03, 0.55];
          rVoid = 0;
        } else if (
          !frozenNow &&
          !inputRef.current.space &&
          effective >= 0 &&
          effective === g.reaperNode &&
          !g.burned[effective] &&
          g.camOfflineUntil[effective] <= g.t
        ) {
          const vis = REAPER_VIS[g.reaperNode] ?? REAPER_VIS[3];
          targetAmt = g.phase === 1 ? 0.75 : 1;
          rSize = vis.size;
          rPos = [vis.pos[0] + 0.02 * Math.sin(t * 0.23), vis.pos[1] + 0.015 * Math.sin(t * 0.31 + 1)];
          rVoid = thermal;
        }
        st.reaperAmt += (targetAmt - st.reaperAmt) * Math.min(1, dt * 5);
        rAmt = st.reaperAmt;

        // parry flare: the targeted lens blows out with white noise
        if (parryRef.current?.stage === 'window' && parryRef.current.cam === camRef.current && !inputRef.current.space) {
          whiteout = 0.16 + 0.14 * Math.sin(t * 34);
          aberration += 0.01;
        }

        // the celluloid melt (7:30 → 8:00)
        melt = g.melt;
        meltTime = Math.max(0, g.t - 450);

        // ── HUD via refs (no re-render churn at 60fps) ──
        if (timerEl.current) {
          timerEl.current.textContent = guideActiveRef.current
            ? 'TRAINING'
            : fmtClock(Math.max(0, GAME_LENGTH - g.t));
        }
        if (wallEl.current) {
          const mins = Math.floor(g.t / 60);
          wallEl.current.textContent = `12:${mins.toString().padStart(2, '0')} AM`;
        }
        if (sigFill.current) sigFill.current.style.width = `${Math.max(0, g.signal)}%`;
        if (sigText.current) sigText.current.textContent = `${Math.ceil(Math.max(0, g.signal))}%`;
        if (sigWrap.current) {
          sigWrap.current.classList.toggle('low', g.signal < 25);
          sigWrap.current.classList.toggle('mid', g.signal >= 25 && g.signal < 55);
        }
        if (breach && breachBar.current) breachBar.current.style.width = `${Math.min(100, (g.breach?.hold ?? 0) * 100)}%`;
        if (parryRef.current?.stage === 'window' && parryBar.current && g.parry) {
          const remain = 1 - (g.t - g.parry.windowStart) / g.parry.windowDur;
          parryBar.current.style.width = `${Math.max(0, remain) * 100}%`;
        }

        // terminal typing
        const tp = st.typing;
        if (tp && typeEl.current) {
          const line = logLinesRef.current.find((l) => l.id === tp.id);
          if (line) {
            tp.idx += Math.max(dt, 1 / 60) * 46;
            if (tp.idx >= line.text.length) {
              typeEl.current.textContent = line.text;
              st.typing = null;
              setTypingId(null);
            } else {
              typeEl.current.textContent = line.text.slice(0, Math.floor(tp.idx));
            }
          }
        }
      } else {
        // endings: canvas goes dark / static behind the DOM overlays
        dark = st.screen === 'defeat' ? 1 : 0;
        staticMix = st.screen === 'victory' ? Math.max(0, 1 - (now - st.endStart) / 900) : 0;
        tear = 0.5;
        grain = 0.12;
      }

      renderer.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
      renderer.render({
        scene, time: t, curve, zoom, zoomTarget, pan, aberration, grain, tear, scan,
        thermal, melt, meltTime, staticMix, whiteout, dark,
        reaperPos: rPos, reaperSize: rSize, reaperAmt: rAmt, reaperVoid: rVoid, reaperFrozen: rFrozen,
      });
    };

    let raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(menuClock);
      audio.shutdown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keep a ref mirror of parry for the rAF loop
  const parryRef = useRef<ParryUI | null>(null);
  useEffect(() => {
    parryRef.current = parry;
  }, [parry]);

  // ── keyboard ──
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const g = gameRef.current;
      if (e.code === 'Space') {
        e.preventDefault();
        if (S.current.screen === 'playing') inputRef.current.space = true;
        return;
      }
      if (S.current.screen !== 'playing' || !g) return;
      if (e.key >= '1' && e.key <= '4') {
        const c = Number(e.key) - 1;
        if (!g.burned[c]) {
          const stepId = GUIDE_STEPS[guideStepRef.current]?.id;
          if (guideActiveRef.current && stepId === 'cams') guideVisited.current.add(c);
          if (guideActiveRef.current && stepId === 'thermal' && c === 3) guideVisited.current.add(3);
          if (guideActiveRef.current && stepId === 'threat' && c === 1) guideThreatSeen.current = true;
          setCam(c);
          audioRef.current?.uiBlip();
        } else {
          audioRef.current?.staticBurst(0.15, 0.12);
        }
      } else if (e.key === 'Enter') {
        g.confirmParry(sliderRef.current);
      } else if (e.key === 'x' || e.key === 'X') {
        g.adrenaline();
      } else if (e.key === 'Escape') {
        setShowManual(false);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') inputRef.current.space = false;
    };
    const firstGesture = () => {
      audioRef.current?.ensure();
      if (S.current.screen === 'menu') audioRef.current?.startRain();
    };
    const releaseHeldInput = () => { inputRef.current.space = false; };
    const onVisibilityChange = () => {
      if (document.hidden) releaseHeldInput();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('pointerdown', firstGesture);
    window.addEventListener('blur', releaseHeldInput);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('pointerdown', firstGesture);
      window.removeEventListener('blur', releaseHeldInput);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (decayInterval.current) window.clearInterval(decayInterval.current);
      if (subtitleTimeout.current) window.clearTimeout(subtitleTimeout.current);
    };
  }, [setCam]);

  // ── flow ──
  const beginShift = useCallback(() => {
    if (!S.current.bootDone) return;
    const a = audioRef.current;
    a?.ensure();
    a?.uiBlip();
    S.current.transStart = performance.now();
    setScreen('transition');
  }, [setScreen]);

  const resetGame = useCallback(() => {
    inputRef.current.space = false;
    audioRef.current?.shutdown();
    audioRef.current = new HorrorAudio();
    const g = new GameCore(
      onEvent,
      () => sliderRef.current,
      (text, urgent) => audioRef.current?.speak(text, { urgent }) ?? 2.5,
    );
    gameRef.current = g;
    if (decayInterval.current) window.clearInterval(decayInterval.current);
    rootRef.current?.classList.remove('adr-shake', 'impact', 'reboot');
    Object.assign(S.current, {
      screen: 'menu', transStart: 0, endStart: 0, hitchUntil: 0, reaperAmt: 0,
      camShakeUntil: 0, lastSpace: false, beepAcc: 0, typing: null, guideMode: false,
    });
    guideActiveRef.current = false;
    setGuideMode(false);
    setGuideStep(0);
    logLinesRef.current = [];
    setLines([]);
    setTypingId(null);
    setScreen('menu');
    setCam(0);
    setBurned([false, false, false, false]);
    setParry(null);
    setBreach(false);
    setDoses(3);
    setPhase(1);
    setThreatNode(3);
    setTilt(false);
    setDecay(false);
    setMeltOn(false);
    setEkg(false);
    setSubtitle(null);
    setToast(null);
    setRecharging(false);
    setDefeatPhase('black');
    setDefeatText('');
    setVictoryPhase('static');
    setVictoryText('');
  }, [onEvent, setCam, setScreen]);

  // ── presentation helpers ──
  const decayName = (name: string) => {
    if (!decay) return name;
    void nonce;
    return name
      .split('')
      .map((c) => (/[AEIOU]/.test(c) && Math.random() < 0.78 ? (Math.random() < 0.5 ? ' ' : '·') : c))
      .join('');
  };

  const threatDist = threatNode === BOOTH ? 0 : threatNode === 1 || threatNode === 0 ? 1 : threatNode === 2 ? 2 : 3;
  const camLabel = burned[cam] ? 'SIGNAL LOST' : `CAM ${cam + 1} — ${decayName(CAM_NAMES[cam])}`;
  const clockS = clockNow.getSeconds();
  const clockM = clockNow.getMinutes();
  const clockH = clockNow.getHours() % 12;
  const guideStepId = GUIDE_STEPS[guideStep]?.id;
  const guideCanAdvance =
    guideStepId === 'welcome' ||
    guideStepId === 'prox' ||
    (guideStepId === 'cams' && guideVisited.current.size >= 4) ||
    (guideStepId === 'thermal' && guideVisited.current.has(3)) ||
    (guideStepId === 'signal' && (gameRef.current?.signal ?? 0) >= 85) ||
    (guideStepId === 'parry' && guideParryDone.current) ||
    (guideStepId === 'threat' && guideThreatSeen.current) ||
    (guideStepId === 'breach' && guideBreachDone.current) ||
    (guideStepId === 'adr' && (gameRef.current?.doses ?? 3) < 3);

  return (
    <div
      ref={rootRef}
      className={`game-root ${tilt ? 'tilt' : ''} ${meltOn ? 'melting' : ''} ${screen === 'playing' ? 'in-shift' : ''}`}
    >
      <canvas ref={canvasRef} className="stage" />

      {/* CRT glass over everything */}
      <div className="crt-glass" aria-hidden />
      <div className="crt-scanlines" aria-hidden />
      <div className="crt-vignette" aria-hidden />

      {/* ─────────────────────────── BOOT ─────────────────────────── */}
      {!bootReady && (
        <div className="boot-screen">
          <span className="boot-line">MOUNTING TAPE 3 OF 1<span className="blink">▮</span></span>
        </div>
      )}

      {/* ─────────────────────────── MENU ─────────────────────────── */}
      {screen === 'menu' && bootReady && (
        <div className="menu">
          <div className="rain rain-a" aria-hidden />
          <div className="rain rain-b" aria-hidden />

          <header className="menu-top">
            <div className="menu-ident">
              <p className="ident-1">ST. LAZARUS GENERAL HOSPITAL</p>
              <p className="ident-2">SECURITY OPERATIONS — NIGHT DESK</p>
              <p className="ident-3">OS v8.04 <span className="dim">//</span> TAPE 3 OF 1 <span className="blink">▮</span></p>
            </div>
            <div className="menu-clock">
              <svg viewBox="0 0 100 100" className="clock-face">
                <circle cx="50" cy="50" r="47" className="clock-rim" />
                {Array.from({ length: 12 }, (_, i) => {
                  const a = (i / 12) * Math.PI * 2;
                  return (
                    <line
                      key={i}
                      x1={50 + Math.sin(a) * 40} y1={50 - Math.cos(a) * 40}
                      x2={50 + Math.sin(a) * 44} y2={50 - Math.cos(a) * 44}
                      className="clock-tick"
                    />
                  );
                })}
                <line x1="50" y1="50" x2={50 + Math.sin((clockH + clockM / 60) / 12 * Math.PI * 2) * 22} y2={50 - Math.cos((clockH + clockM / 60) / 12 * Math.PI * 2) * 22} className="hand hand-h" />
                <line x1="50" y1="50" x2={50 + Math.sin((clockM / 60) * Math.PI * 2) * 32} y2={50 - Math.cos((clockM / 60) * Math.PI * 2) * 32} className="hand hand-m" />
                <line x1="50" y1="50" x2={50 + Math.sin((clockS / 60) * Math.PI * 2) * 36} y2={50 - Math.cos((clockS / 60) * Math.PI * 2) * 36} className="hand hand-s" />
                <circle cx="50" cy="50" r="2" className="clock-pin" />
              </svg>
              <p className="clock-read">
                {clockNow.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </p>
              <p className="clock-sub">LOCAL TIME — SHIFT 3</p>
            </div>
          </header>

          <div className="menu-title-block">
            <p className="kicker">PATIENT ZERO PROTOCOL <span className="kicker-dim">// CLASSIFIED</span></p>
            <h1 className="game-title">
              <span className="title-line">EIGHT</span>
              <span className="title-line title-mid">MINUTES</span>
              <span className="title-line title-low">UNDER</span>
            </h1>
            <p className="tagline">A NIGHT-SHIFT SURVIVAL VIGIL. THE BODY ON THE TABLE IS YOURS.</p>
          </div>

          <nav className="menu-items">
            <button className="menu-item menu-item-go" onClick={beginShift} onMouseEnter={() => audioRef.current?.uiBlip()}>
              <span className="mi-arrow">▶</span> BEGIN SHIFT <span className="mi-hint">[ 8:00 REAL-TIME ]</span>
            </button>
            <button className="menu-item" onClick={beginGuide} onMouseEnter={() => audioRef.current?.uiBlip()}>
              <span className="mi-arrow">▶</span> GUIDED SHIFT <span className="mi-hint">[ JUDGE MODE — PLAYABLE TOUR ]</span>
            </button>
            <button className="menu-item" onClick={() => { setShowManual(true); audioRef.current?.uiBlip(); }} onMouseEnter={() => audioRef.current?.uiBlip()}>
              <span className="mi-arrow">▶</span> FIELD PROTOCOL
            </button>
            <button
              className="menu-item menu-item-exit"
              onClick={() => { setExitGlitch(true); audioRef.current?.staticBurst(0.25, 0.2); window.setTimeout(() => setExitGlitch(false), 2600); }}
              onMouseEnter={() => audioRef.current?.uiBlip()}
            >
              <span className="mi-arrow">▶</span> CLOCK OUT
            </button>
            {exitGlitch && (
              <p className="exit-glitch">THERE IS NO CLOCK-OUT. THE CONSENT FORM WAS SIGNED AT 11:58 PM.</p>
            )}
          </nav>

          <footer className="menu-controls">
            <div className="ctrl-grid">
              <span><b className="key">SPACE</b> CHARGE DEFIBRILLATOR</span>
              <span><b className="key">1–4</b> SWITCH CAMERA</span>
              <span><b className="key">ENTER</b> CONFIRM PARRY</span>
              <span><b className="key">X</b> ADRENALINE SURGE</span>
            </div>
            <p className="warn-line">⚠ HEADPHONES ADVISED — 19 Hz INFRASOUND PRESENT</p>
          </footer>

          <div className="monitor-glow" aria-hidden />
          <p className="menu-camtag">CAM 0 — SECURITY DESK <span className="live">● LIVE</span></p>
        </div>
      )}

      {/* ─────────────────────────── MANUAL ─────────────────────────── */}
      {showManual && (
        <div className="manual-backdrop" onClick={() => setShowManual(false)}>
          <div className="manual" onClick={(e) => e.stopPropagation()}>
            <h2 className="manual-title">FIELD PROTOCOL — NIGHT SHIFT</h2>
            <div className="manual-body">
              <section>
                <h3>01 // THE SHIFT</h3>
                <p>480 real seconds. Three phases. No pauses, no mercy. At 7:30 the tape starts to burn. At 8:00, whatever is left of you resolves.</p>
              </section>
              <section>
                <h3>02 // SIGNAL METER</h3>
                <p>Your defibrillator charge bleeds out constantly — faster as the night worsens. Hold <b>SPACE</b> to charge it. While charging you are blind: no cameras. At 0%, you die.</p>
              </section>
              <section>
                <h3>03 // THE THREAT</h3>
                <p>It walks between the four wards. It only moves when you are <b>not</b> watching its camera. If it reaches your booth, hold <b>SPACE</b> to discharge and hurl it back — you have 6.5 seconds. In Phase 2+, staring at it for 3s crashes the feed.</p>
              </section>
              <section>
                <h3>04 // SIGNAL PARRY</h3>
                <p>When a corruption wave is inbound, snap the frequency slider to the <b>target Hz</b> and hit <b>ENTER</b> before the window closes. Success pushes it back two sectors and reboots +10% power. Failure <b>burns that camera out forever</b>.</p>
              </section>
              <section>
                <h3>05 // ADRENALINE [X]</h3>
                <p>Three doses. Blinds and freezes the entity for 15s. Then for 60s: power drains at 3×, the ventilator panics, and the whole booth shakes. Choose your moments.</p>
              </section>
              <section>
                <h3>06 // CAM 4 — THE MORGUE</h3>
                <p>Rendered in false-color thermal. Down there, it appears as absolute zero — a void that erases heat.</p>
              </section>
            </div>
            <button className="manual-close" onClick={() => setShowManual(false)}>CLOSE [ ESC ]</button>
          </div>
        </div>
      )}

      {/* ─────────────────────────── HUD ─────────────────────────── */}
      {screen === 'playing' && (
        <div className={`hud ${recharging ? 'charging' : ''}`}>
          {/* top bar */}
          <div className="hud-top">
            <div className="panel cam-panel" data-guide="camlabel">
              <span className={`rec ${burned[cam] ? 'dead' : ''}`}>●</span>
              <span className="cam-label">{camLabel}</span>
              {burned[cam] && <span className="burned-tag">OPTICS DESTROYED</span>}
            </div>
            <div className="panel clock-panel">
              <span className="shift-label">SHIFT REMAINING</span>
              <span className="shift-timer" ref={timerEl}>8:00</span>
              <span className="wall-clock" ref={wallEl}>12:00 AM</span>
            </div>
            <div className="panel threat-panel" data-guide="threat">
              <span className="phase-name">PHASE {['I', 'II', 'III'][phase - 1]} // {PHASE_NAMES[phase]}</span>
              <div className={`proximity prox-${4 - threatDist}`}>
                <span className="prox-label">PROXIMITY</span>
                <span className="prox-leds">
                  {[0, 1, 2, 3].map((i) => (
                    <i key={i} className={`led ${i < 4 - threatDist ? 'on' : ''} ${threatDist === 0 ? 'crit' : ''}`} />
                  ))}
                </span>
                <span className="prox-sector">{threatNode === BOOTH ? 'THE DOOR' : decayName(CAM_NAMES[threatNode])}</span>
              </div>
            </div>
          </div>

          {/* camera bank */}
          <div className="cam-bank" data-guide="cams">
            {CAM_NAMES.map((name, i) => (
              <button
                key={i}
                className={`hbtn cam-btn ${cam === i ? 'active' : ''} ${burned[i] ? 'burned' : ''} ${parry && parry.cam === i ? 'parry-target' : ''}`}
                onClick={() => {
                  if (!burned[i]) {
                    const stepId = GUIDE_STEPS[guideStepRef.current]?.id;
                    if (guideActiveRef.current && stepId === 'cams') guideVisited.current.add(i);
                    if (guideActiveRef.current && stepId === 'thermal' && i === 3) guideVisited.current.add(3);
                    if (guideActiveRef.current && stepId === 'threat' && i === 1) guideThreatSeen.current = true;
                    setCam(i);
                    audioRef.current?.uiBlip();
                  }
                }}
              >
                <span className="cam-key">{i + 1}</span>
                <span className="cam-name">{burned[i] ? 'S GN L L ST' : decayName(name)}</span>
                <span className={`cam-led ${burned[i] ? 'led-dead' : cam === i ? 'led-on' : ''}`} />
              </button>
            ))}
          </div>

          {/* frequency parry deck */}
          <div className="panel freq-panel" data-guide="freq">
            <div className="freq-head">
              <span>SIGNAL FREQUENCY // MANUAL DEFLECTION</span>
              <span className="freq-read">
                <FreqReadout sliderRef={sliderRef} /> Hz
              </span>
            </div>
            <div className="track-wrap">
              <input
                type="range"
                aria-label="Manual signal frequency"
                min={20}
                max={120}
                step={0.5}
                defaultValue={60}
                className="freq-slider"
                onInput={(e) => {
                  sliderRef.current = Number((e.target as HTMLInputElement).value);
                  window.dispatchEvent(new CustomEvent('freqmove'));
                }}
              />
              {parry && (
                <span className="target-mark" style={{ left: `${((parry.target - 20) / 100) * 100}%` }}>
                  <i />
                </span>
              )}
            </div>
            {parry?.stage === 'announce' && (
              <div className="parry-announce">
                ▲ CORRUPTION WAVE INBOUND — CAM {parry.cam + 1} · TARGET <b>{parry.target} Hz</b>
              </div>
            )}
            {parry?.stage === 'window' && (
              <div className="parry-window">
                <span>MATCH <b>{parry.target} Hz</b> — SNAP + [ENTER]</span>
                <span className="parry-bar"><i ref={parryBar} /></span>
              </div>
            )}
          </div>

          {/* signal meter + syringe */}
          <div className="panel vitals-panel" data-guide="vitals">
            <div className="sig-head">
              <span>DEFIBRILLATOR CHARGE</span>
              <span className="sig-pct" ref={sigText}>100%</span>
            </div>
            <div className="sig-track" ref={sigWrap}>
              <div className="sig-fill" ref={sigFill} />
            </div>
            <p className="sig-hint">HOLD <b className="key">SPACE</b> TO CHARGE — CAMERAS OFFLINE WHILE CHARGING</p>
            <button
              className="hbtn syringe"
              data-guide="syringe"
              onClick={() => gameRef.current?.adrenaline()}
              disabled={doses <= 0}
            >
              <span className="syringe-label">ADRENALINE SURGE [X]</span>
              <span className="dose-pips">
                {[0, 1, 2].map((i) => (
                  <i key={i} className={`pip ${i < doses ? 'full' : ''}`} />
                ))}
              </span>
            </button>
          </div>

          {/* terminal */}
          <div className="touch-controls" aria-label="Touch controls">
            <button
              type="button"
              className="hbtn touch-charge"
              aria-label="Press and hold to charge the defibrillator"
              onPointerDown={(e) => {
                if (S.current.screen !== 'playing') return;
                e.preventDefault();
                inputRef.current.space = true;
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerUp={(e) => {
                inputRef.current.space = false;
                if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
              }}
              onPointerCancel={() => { inputRef.current.space = false; }}
              onLostPointerCapture={() => { inputRef.current.space = false; }}
            >
              HOLD TO CHARGE
            </button>
            {parry?.stage === 'window' && (
              <button
                type="button"
                className="hbtn touch-parry"
                onClick={() => gameRef.current?.confirmParry(sliderRef.current)}
              >
                CONFIRM PARRY
              </button>
            )}
          </div>

          <div className="panel terminal" role="log" aria-live="polite" aria-relevant="additions text">
            <p className="term-head">SYSLOG — /dev/tty0</p>
            {lines.map((l) => (
              <p key={l.id} className={`term-line ${l.danger ? 'danger' : ''} ${l.flash ? 'flash' : ''}`}>
                {l.id === typingId ? (
                  <>
                    <span ref={typeEl} />
                    <span className="blink">▮</span>
                  </>
                ) : (
                  l.text
                )}
              </p>
            ))}
          </div>

          {/* subtitles (trauma feed) */}
          {subtitle && (
            <div className={`subtitle ${subtitle.urgent ? 'urgent' : ''}`}>
              <span className="sub-tag">TRAUMA FEED</span> “{subtitle.text}”
            </div>
          )}

          {/* toast */}
          {toast === 'hit' && <div className="toast toast-hit">WAVE DEFLECTED — GRID +10%</div>}
          {toast === 'fail' && <div className="toast toast-fail">PARRY MISSED — CAMERA BURNED OUT</div>}

          {/* breach overlay */}
          {breach && (
            <div className="breach">
              <div className="breach-beacon" aria-hidden />
              <div className="breach-card">
                <p className="breach-title">⚠ ENTITY AT THE BOOTH DOOR</p>
                <p className="breach-sub">HOLD <b className="key">SPACE</b> — DISCHARGE THE DEFIBRILLATOR</p>
                <div className="breach-bar"><i ref={breachBar} /></div>
              </div>
            </div>
          )}

          {/* ── JUDGE MODE guide card ── */}
          {guideMode && (
            <div className="guide-card">
              <div className="guide-head">
                <span className="guide-stepno">GUIDE {guideStep + 1} / {GUIDE_STEPS.length}</span>
                <span className="guide-dots">
                  {GUIDE_STEPS.map((_, i) => (
                    <i key={i} className={`gdot ${i < guideStep ? 'done' : ''} ${i === guideStep ? 'now' : ''}`} />
                  ))}
                </span>
                <button className="guide-skip" onClick={resetGame}>END TOUR</button>
              </div>
              <h3 className="guide-title">{GUIDE_STEPS[guideStep].title}</h3>
              <p className="guide-body">{GUIDE_STEPS[guideStep].body}</p>
              {guideStep < GUIDE_STEPS.length - 1 ? (
                <button className="hbtn guide-next" onClick={guideNext} disabled={!guideCanAdvance}>
                  NEXT STEP ▶
                </button>
              ) : (
                <div className="guide-final">
                  <button className="hbtn guide-next" onClick={launchRealShift}>
                    ▶ START THE REAL SHIFT
                  </button>
                  <button className="hbtn guide-menu" onClick={resetGame}>
                    BACK TO MENU
                  </button>
                </div>
              )}
            </div>
          )}

          {/* EKG tear at 7:59 */}
          {ekg && (
            <svg className="ekg" viewBox="0 0 1200 140" preserveAspectRatio="none" aria-hidden>
              <path
                className="ekg-path"
                d="M0,70 H440 L462,70 L476,16 L492,124 L506,70 H560 L574,40 L588,100 L602,70 H1200"
              />
            </svg>
          )}
        </div>
      )}

      {/* ─────────────────────────── DEFEAT ─────────────────────────── */}
      {screen === 'defeat' && (
        <div className={`ending defeat ${defeatPhase}`}>
          {defeatPhase !== 'black' && (
            <>
              <div className="hospital-light" aria-hidden />
              <div className="reaper-burn" aria-hidden>
                <svg viewBox="0 0 100 110" preserveAspectRatio="xMidYMid meet">
                  <defs>
                    <clipPath id="reaperClip">
                      <path d="M50,6 C39,6 33,17 33,27 C33,35 36,41 41,46 C29,52 22,68 19,92 C18,99 20,104 24,104 L76,104 C80,104 82,99 81,92 C78,68 71,52 59,46 C64,41 67,35 67,27 C67,17 61,6 50,6 Z" />
                    </clipPath>
                    <filter id="staticF" x="-10%" y="-10%" width="120%" height="120%">
                      <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="2" seed="7" result="n">
                        <animate attributeName="seed" values="1;9;3;14;6;1" dur="0.4s" repeatCount="indefinite" />
                      </feTurbulence>
                      <feColorMatrix in="n" type="saturate" values="0" />
                      <feComponentTransfer>
                        <feFuncR type="discrete" tableValues="0 0 1 1" />
                        <feFuncG type="discrete" tableValues="0 0 1 1" />
                        <feFuncB type="discrete" tableValues="0 0 1 1" />
                      </feComponentTransfer>
                    </filter>
                  </defs>
                  <g clipPath="url(#reaperClip)">
                    <rect width="100" height="110" filter="url(#staticF)" />
                  </g>
                </svg>
              </div>
              <p className="end-text defeat-text">{defeatText}<span className="blink">▮</span></p>
            </>
          )}
          {defeatPhase === 'crashed' && (
            <div className="crashed">
              <p className="crashed-sig">SIGNAL TERMINATED</p>
              <button className="crashed-reboot" onClick={resetGame}>[ REBOOT TAPE ]</button>
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────── VICTORY ─────────────────────────── */}
      {screen === 'victory' && (
        <div className={`ending victory ${victoryPhase}`}>
          {victoryPhase === 'static' && <div className="static-flash" aria-hidden />}
          {victoryPhase === 'light' && (
            <>
              <div className="icu-light" aria-hidden />
              <p className="end-text victory-text">{victoryText}<span className="blink">▮</span></p>
              <p className="victory-sub">YOU WAKE TO BLINDING WHITE. SOMETHING IN YOUR CHEST IS BEEPING. IT IS THE BEST SOUND IN THE WORLD.</p>
              <button className="hbtn restart-btn" onClick={resetGame}>RETURN TO THE DESK</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Reads slider value through the shared ref + a custom event — no re-renders while dragging. */
function FreqReadout({ sliderRef }: { sliderRef: { current: number } }) {
  const [v, setV] = useState(60);
  useEffect(() => {
    const h = () => setV(sliderRef.current);
    window.addEventListener('freqmove', h);
    return () => window.removeEventListener('freqmove', h);
  }, [sliderRef]);
  return <>{v.toFixed(1)}</>;
}
