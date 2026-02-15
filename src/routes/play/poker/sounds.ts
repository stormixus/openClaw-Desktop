import type { ActionKind } from './engine';

const EN_ACTION_TEXT: Partial<Record<ActionKind, string>> = {
  fold: 'Fold',
  check: 'Check',
  call: 'Call',
  raise: 'Raise',
  draw: 'Draw',
  stand: 'Stand',
};

const KO_ACTION_TEXT: Partial<Record<ActionKind, string>> = {
  fold: '폴드',
  check: '체크',
  call: '콜',
  raise: '레이즈',
  draw: '교체',
  stand: '스탠드',
};

type WindowWithWebkitAudio = Window & {
  webkitAudioContext?: typeof AudioContext;
};

let audioContext: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;

function pickVoice(lang: string): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  const exact = voices.find((voice) => voice.lang.toLowerCase().startsWith(lang.toLowerCase()));
  if (exact) return exact;

  if (lang.startsWith('ko')) {
    return voices.find((voice) => voice.lang.toLowerCase().startsWith('en')) ?? voices[0] ?? null;
  }
  return voices[0] ?? null;
}

function ensureAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (audioContext && audioContext.state !== 'closed') return audioContext;

  const Ctx = window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext;
  if (!Ctx) return null;

  audioContext = new Ctx();
  noiseBuffer = null;
  return audioContext;
}

function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer;

  const length = Math.floor(ctx.sampleRate * 0.08);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    channel[i] = (Math.random() * 2 - 1) * 0.7;
  }
  noiseBuffer = buffer;
  return buffer;
}

function clampPan(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}

export function playPokerActionVoice(action: ActionKind, locale: string): void {
  try {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    const isKo = locale.startsWith('ko');
    const text = isKo ? KO_ACTION_TEXT[action] : EN_ACTION_TEXT[action];
    if (!text) return;

    const synth = window.speechSynthesis;
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = isKo ? 'ko-KR' : 'en-US';
    utter.rate = isKo ? 1.03 : 1.08;
    utter.pitch = isKo ? 1.02 : 0.98;
    utter.volume = 0.88;

    const voice = pickVoice(utter.lang);
    if (voice) utter.voice = voice;

    synth.cancel();
    synth.speak(utter);
  } catch {
    // speech synthesis unavailable
  }
}

export function playPokerDealCard(pan = 0): void {
  try {
    const ctx = ensureAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();

    const now = ctx.currentTime + 0.006;
    const master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);

    const panner = typeof StereoPannerNode === 'undefined'
      ? null
      : new StereoPannerNode(ctx, { pan: clampPan(pan) });

    const output = panner ?? master;
    if (panner) panner.connect(master);

    const noise = ctx.createBufferSource();
    noise.buffer = getNoiseBuffer(ctx);

    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.setValueAtTime(2500, now);
    band.Q.setValueAtTime(0.8, now);

    const whooshGain = ctx.createGain();
    whooshGain.gain.setValueAtTime(0.0001, now);
    whooshGain.gain.exponentialRampToValueAtTime(0.085, now + 0.008);
    whooshGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);

    noise.connect(band);
    band.connect(whooshGain);
    whooshGain.connect(output);

    const click = ctx.createOscillator();
    click.type = 'triangle';
    click.frequency.setValueAtTime(640, now);
    click.frequency.exponentialRampToValueAtTime(210, now + 0.06);

    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(0.0001, now);
    clickGain.gain.exponentialRampToValueAtTime(0.11, now + 0.004);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.065);

    click.connect(clickGain);
    clickGain.connect(output);

    noise.start(now);
    noise.stop(now + 0.085);
    click.start(now);
    click.stop(now + 0.07);

    window.setTimeout(() => {
      if (panner) panner.disconnect();
      whooshGain.disconnect();
      band.disconnect();
      clickGain.disconnect();
      master.disconnect();
    }, 180);
  } catch {
    // audio api unavailable
  }
}

export function playPokerWinJingle(): void {
  try {
    const ctx = ensureAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();

    const now = ctx.currentTime + 0.02;
    const master = ctx.createGain();
    master.gain.value = 0.72;
    master.connect(ctx.destination);

    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const start = now + idx * 0.11;
      const end = start + 0.24;

      const osc = ctx.createOscillator();
      osc.type = idx % 2 === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, start);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.13, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(4500, start);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(master);

      osc.start(start);
      osc.stop(end + 0.01);
    });

    const bass = ctx.createOscillator();
    bass.type = 'sine';
    bass.frequency.setValueAtTime(130.81, now);
    bass.frequency.exponentialRampToValueAtTime(98, now + 0.42);

    const bassGain = ctx.createGain();
    bassGain.gain.setValueAtTime(0.0001, now);
    bassGain.gain.exponentialRampToValueAtTime(0.08, now + 0.03);
    bassGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

    bass.connect(bassGain);
    bassGain.connect(master);
    bass.start(now);
    bass.stop(now + 0.46);

    window.setTimeout(() => {
      bassGain.disconnect();
      master.disconnect();
    }, 900);
  } catch {
    // audio api unavailable
  }
}
