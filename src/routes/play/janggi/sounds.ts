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

/** 장기 착수음: 낮고 단단한 목재 톤 */
export function playPiecePlace(): void {
  try {
    const ac = getCtx();
    const t = ac.currentTime;

    const n = noise(ac, 0.04, 0.62);
    const nGain = ac.createGain();
    nGain.gain.setValueAtTime(0.1, t);
    nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    const nFilter = ac.createBiquadFilter();
    nFilter.type = 'bandpass';
    nFilter.frequency.setValueAtTime(760, t);
    nFilter.Q.value = 1.1;
    connect(ac, n, nFilter, nGain);
    n.start(t);
    n.stop(t + 0.055);

    const body = ac.createOscillator();
    body.type = 'triangle';
    body.frequency.setValueAtTime(170, t);
    body.frequency.exponentialRampToValueAtTime(112, t + 0.1);
    const bodyGain = ac.createGain();
    bodyGain.gain.setValueAtTime(0.14, t);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
    connect(ac, body, bodyGain);
    body.start(t);
    body.stop(t + 0.12);

    const click = ac.createOscillator();
    click.type = 'sine';
    click.frequency.setValueAtTime(420, t);
    click.frequency.exponentialRampToValueAtTime(280, t + 0.03);
    const clickGain = ac.createGain();
    clickGain.gain.setValueAtTime(0.04, t);
    clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    connect(ac, click, clickGain);
    click.start(t);
    click.stop(t + 0.05);
  } catch {
    // Audio not available
  }
}
