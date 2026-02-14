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

/** 체스 착수음: 밝고 crisp한 클릭 */
export function playChessPiecePlace(): void {
  try {
    const ac = getCtx();
    const t = ac.currentTime;

    const n = noise(ac, 0.028, 0.58);
    const nFilter = ac.createBiquadFilter();
    nFilter.type = 'highpass';
    nFilter.frequency.setValueAtTime(1400, t);
    const nGain = ac.createGain();
    nGain.gain.setValueAtTime(0.085, t);
    nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    connect(ac, n, nFilter, nGain);
    n.start(t);
    n.stop(t + 0.032);

    const body = ac.createOscillator();
    body.type = 'triangle';
    body.frequency.setValueAtTime(260, t);
    body.frequency.exponentialRampToValueAtTime(180, t + 0.07);
    const bodyGain = ac.createGain();
    bodyGain.gain.setValueAtTime(0.1, t);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, t + 0.075);
    connect(ac, body, bodyGain);
    body.start(t);
    body.stop(t + 0.08);

    const overtone = ac.createOscillator();
    overtone.type = 'sine';
    overtone.frequency.setValueAtTime(620, t);
    overtone.frequency.exponentialRampToValueAtTime(380, t + 0.045);
    const overGain = ac.createGain();
    overGain.gain.setValueAtTime(0.03, t);
    overGain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    connect(ac, overtone, overGain);
    overtone.start(t);
    overtone.stop(t + 0.055);
  } catch {
    // Audio not available
  }
}
