let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function noise(ac: AudioContext, duration: number, gain: number): AudioBufferSourceNode {
  const len = ac.sampleRate * duration;
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * gain;
  const src = ac.createBufferSource();
  src.buffer = buf;
  return src;
}

function connect(ac: AudioContext, src: AudioNode, ...chain: AudioNode[]): void {
  let prev = src;
  for (const node of chain) {
    prev.connect(node);
    prev = node;
  }
  prev.connect(ac.destination);
}

export function playCardSlap(): void {
  try {
    const ac = getCtx();
    const t = ac.currentTime;

    const n = noise(ac, 0.06, 0.8);
    const nGain = ac.createGain();
    nGain.gain.setValueAtTime(0.35, t);
    nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    const nFilter = ac.createBiquadFilter();
    nFilter.type = 'bandpass';
    nFilter.frequency.value = 800;
    nFilter.Q.value = 1.5;
    connect(ac, n, nFilter, nGain);
    n.start(t);
    n.stop(t + 0.06);

    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.08);
    const oGain = ac.createGain();
    oGain.gain.setValueAtTime(0.3, t);
    oGain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    connect(ac, osc, oGain);
    osc.start(t);
    osc.stop(t + 0.1);
  } catch {
    // Audio not available
  }
}

export function playCardFlip(): void {
  try {
    const ac = getCtx();
    const t = ac.currentTime;

    const n = noise(ac, 0.05, 0.5);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    const f = ac.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 2000;
    connect(ac, n, f, g);
    n.start(t);
    n.stop(t + 0.05);
  } catch {
    // Audio not available
  }
}

export function playCardShuffle(): void {
  try {
    const ac = getCtx();
    const t = ac.currentTime;
    const bursts = 12;
    const dur = 0.85;

    for (let i = 0; i < bursts; i++) {
      const offset = (i / bursts) * dur;
      const n = noise(ac, 0.07, 0.6);
      const filt = ac.createBiquadFilter();
      filt.type = 'bandpass';
      filt.frequency.setValueAtTime(1200 + Math.sin(i * 0.8) * 600, t + offset);
      filt.Q.value = 1.2;
      const g = ac.createGain();
      const vol = 0.12 + Math.sin((i / bursts) * Math.PI) * 0.08;
      g.gain.setValueAtTime(vol, t + offset);
      g.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.07);
      connect(ac, n, filt, g);
      n.start(t + offset);
      n.stop(t + offset + 0.07);
    }
  } catch {
    // Audio not available
  }
}

export function playCapture(): void {
  try {
    const ac = getCtx();
    const t = ac.currentTime;

    const n = noise(ac, 0.12, 0.6);
    const nGain = ac.createGain();
    nGain.gain.setValueAtTime(0.001, t);
    nGain.gain.linearRampToValueAtTime(0.2, t + 0.03);
    nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    const nf = ac.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.setValueAtTime(3000, t);
    nf.frequency.exponentialRampToValueAtTime(800, t + 0.12);
    nf.Q.value = 0.8;
    connect(ac, n, nf, nGain);
    n.start(t);
    n.stop(t + 0.13);

    const osc = ac.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 1200;
    const og = ac.createGain();
    og.gain.setValueAtTime(0.08, t + 0.04);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    connect(ac, osc, og);
    osc.start(t + 0.04);
    osc.stop(t + 0.26);
  } catch {
    // Audio not available
  }
}

/** Sharp "딱!" of two hwatu cards slapping together */
export function playCardMatch(): void {
  try {
    const ac = getCtx();
    const t = ac.currentTime;

    // 1. Sharp crack — card edges hitting
    const crack = noise(ac, 0.02, 1.0);
    const crackFilt = ac.createBiquadFilter();
    crackFilt.type = 'bandpass';
    crackFilt.frequency.value = 3200;
    crackFilt.Q.value = 0.7;
    const crackGain = ac.createGain();
    crackGain.gain.setValueAtTime(0.6, t);
    crackGain.gain.exponentialRampToValueAtTime(0.001, t + 0.02);
    connect(ac, crack, crackFilt, crackGain);
    crack.start(t);
    crack.stop(t + 0.025);

    // 2. Body thump — card body resonance
    const thump = ac.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(320, t);
    thump.frequency.exponentialRampToValueAtTime(100, t + 0.05);
    const thumpGain = ac.createGain();
    thumpGain.gain.setValueAtTime(0.3, t);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    connect(ac, thump, thumpGain);
    thump.start(t);
    thump.stop(t + 0.07);

    // 3. Secondary tap — slight bounce
    const tap = ac.createOscillator();
    tap.type = 'triangle';
    tap.frequency.value = 480;
    const tapGain = ac.createGain();
    tapGain.gain.setValueAtTime(0, t);
    tapGain.gain.linearRampToValueAtTime(0.12, t + 0.025);
    tapGain.gain.exponentialRampToValueAtTime(0.001, t + 0.055);
    connect(ac, tap, tapGain);
    tap.start(t + 0.018);
    tap.stop(t + 0.06);
  } catch {
    // Audio not available
  }
}

export function playDing(): void {
  try {
    const ac = getCtx();
    const t = ac.currentTime;

    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 880;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    connect(ac, osc, g);
    osc.start(t);
    osc.stop(t + 0.31);
  } catch {
    // Audio not available
  }
}

export function playTurnNotify(): void {
  try {
    const ac = getCtx();
    const t = ac.currentTime;

    for (let i = 0; i < 2; i++) {
      const offset = i * 0.12;
      const osc = ac.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = i === 0 ? 660 : 880;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.1, t + offset);
      g.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.15);
      connect(ac, osc, g);
      osc.start(t + offset);
      osc.stop(t + offset + 0.16);
    }
  } catch {
    // Audio not available
  }
}

export function playGo(): void {
  try {
    const ac = getCtx();
    const t = ac.currentTime;
    const notes = [523, 659, 784];

    for (let i = 0; i < notes.length; i++) {
      const offset = i * 0.08;
      const osc = ac.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = notes[i];
      const g = ac.createGain();
      g.gain.setValueAtTime(0.12, t + offset);
      g.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.2);
      connect(ac, osc, g);
      osc.start(t + offset);
      osc.stop(t + offset + 0.21);
    }
  } catch {
    // Audio not available
  }
}

export function playStop(): void {
  try {
    const ac = getCtx();
    const t = ac.currentTime;
    const notes = [784, 659, 523];

    for (let i = 0; i < notes.length; i++) {
      const offset = i * 0.1;
      const osc = ac.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = notes[i];
      const g = ac.createGain();
      g.gain.setValueAtTime(0.1, t + offset);
      g.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.25);
      connect(ac, osc, g);
      osc.start(t + offset);
      osc.stop(t + offset + 0.26);
    }
  } catch {
    // Audio not available
  }
}

export function playWin(): void {
  try {
    const ac = getCtx();
    const t = ac.currentTime;
    const notes = [523, 659, 784, 1047];

    for (let i = 0; i < notes.length; i++) {
      const offset = i * 0.1;
      const osc = ac.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = notes[i];
      const g = ac.createGain();
      g.gain.setValueAtTime(0.15, t + offset);
      g.gain.linearRampToValueAtTime(0.15, t + offset + 0.15);
      g.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.5);
      connect(ac, osc, g);
      osc.start(t + offset);
      osc.stop(t + offset + 0.51);
    }
  } catch {
    // Audio not available
  }
}

export function playLose(): void {
  try {
    const ac = getCtx();
    const t = ac.currentTime;
    const notes = [440, 392, 349];

    for (let i = 0; i < notes.length; i++) {
      const offset = i * 0.15;
      const osc = ac.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = notes[i];
      const g = ac.createGain();
      g.gain.setValueAtTime(0.1, t + offset);
      g.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.35);
      connect(ac, osc, g);
      osc.start(t + offset);
      osc.stop(t + offset + 0.36);
    }
  } catch {
    // Audio not available
  }
}
