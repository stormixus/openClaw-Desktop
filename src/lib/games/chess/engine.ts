/**
 * Chess Engine - chess.js wrapper + LLM integration utilities
 */
import { Chess } from 'chess.js';

export { Chess };

export type Difficulty = 'easy' | 'normal' | 'hard';

const difficultyPrompts: Record<Difficulty, Record<string, string>> = {
  easy: {
    en: 'You are a beginner chess player. Make a reasonable but not optimal move. Occasionally make minor mistakes like missing a better capture or leaving a piece slightly exposed.',
    ko: '당신은 체스 초보자입니다. 합리적이지만 최적이 아닌 수를 두세요. 가끔 더 나은 캡처를 놓치거나 기물을 약간 노출하는 실수를 하세요.',
  },
  normal: {
    en: 'You are an intermediate chess player. Play solid, standard moves. Consider tactics but don\'t always find the absolute best move.',
    ko: '당신은 중급 체스 플레이어입니다. 견고하고 정석적인 수를 두세요. 전술을 고려하되 항상 최선의 수를 찾지는 마세요.',
  },
  hard: {
    en: 'You are a grandmaster-level chess player. Play the strongest possible move. Maximize positional advantage, calculate deep tactics, and exploit every weakness.',
    ko: '당신은 그랜드마스터급 체스 플레이어입니다. 가능한 가장 강력한 수를 두세요. 포지션 우위를 극대화하고, 깊은 전술을 계산하며, 모든 약점을 공략하세요.',
  },
};

const promptLabels: Record<string, {
  position: string;
  board: string;
  moves: string;
  legal: string;
  instruction: (example: string) => string;
  colors: [string, string];
}> = {
  en: {
    position: 'Position (FEN)',
    board: 'Board',
    moves: 'Moves so far',
    legal: 'Legal moves',
    instruction: (ex) => `Reply with EXACTLY one move from the legal moves list (e.g. "${ex}"). Then briefly explain your reasoning in 1-2 sentences.`,
    colors: ['White', 'Black'],
  },
  ko: {
    position: '포지션 (FEN)',
    board: '보드',
    moves: '지금까지의 수',
    legal: '가능한 수',
    instruction: (ex) => `가능한 수 목록에서 정확히 하나의 수를 골라 답하세요 (예: "${ex}"). 그리고 1-2문장으로 이유를 간략히 설명하세요.`,
    colors: ['백', '흑'],
  },
};

/**
 * Build a prompt for the LLM to play chess as the current turn's color.
 */
export function buildChessPrompt(game: Chess, locale: string = 'en', difficulty: Difficulty = 'normal'): string {
  const labels = promptLabels[locale] ?? promptLabels.en;
  const diffPrompt = difficultyPrompts[difficulty][locale] ?? difficultyPrompts[difficulty].en;
  const legalMoves = game.moves();
  const history = game.history();
  const turnColor = game.turn() === 'b' ? labels.colors[1] : labels.colors[0];

  let prompt = `${diffPrompt}\n\nYou are playing as ${turnColor}.\n\n`;
  prompt += `${labels.position}: ${game.fen()}\n\n`;
  prompt += `${labels.board}:\n${game.ascii()}\n\n`;

  if (history.length > 0) {
    prompt += `${labels.moves}: ${formatPgn(history)}\n\n`;
  }

  prompt += `${labels.legal}: ${legalMoves.join(', ')}\n\n`;
  prompt += labels.instruction(legalMoves[0] || 'e5');

  return prompt;
}

function formatPgn(history: string[]): string {
  let pgn = '';
  for (let i = 0; i < history.length; i += 2) {
    const num = Math.floor(i / 2) + 1;
    pgn += `${num}. ${history[i]}`;
    if (i + 1 < history.length) pgn += ` ${history[i + 1]} `;
  }
  return pgn.trim();
}

/**
 * Parse an LLM response to extract a valid chess move in SAN notation.
 * Tries multiple strategies: exact SAN match, relaxed match, coordinate notation.
 */
export function parseLlmMove(response: string, game: Chess): string | null {
  const legalMoves = game.moves();
  if (legalMoves.length === 0) return null;

  // 1. Exact SAN match (longest first to prefer "Nbd7" over "Nd7")
  const sorted = [...legalMoves].sort((a, b) => b.length - a.length);
  for (const move of sorted) {
    const escaped = move.replace(/[+#?!]/g, '\\$&');
    const re = new RegExp(`(?:^|[\\s,."'(])${escaped}[+#?!]?(?=[\\s,."')]|$)`);
    if (re.test(response)) return move;
  }

  // 2. Relaxed: move string appears anywhere
  for (const move of sorted) {
    if (response.includes(move)) return move;
  }

  // 3. Coordinate notation (e2e4, e2-e4, e2 e4)
  const coordPattern = /([a-h][1-8])[\s-]?([a-h][1-8])([nbrq])?/gi;
  for (const match of response.matchAll(coordPattern)) {
    const from = match[1].toLowerCase();
    const to = match[2].toLowerCase();
    const promo = match[3]?.toLowerCase() as 'n' | 'b' | 'r' | 'q' | undefined;
    try {
      const result = game.move({ from: from as any, to: to as any, promotion: promo });
      if (result) {
        const san = result.san;
        game.undo();
        return san;
      }
    } catch { /* not valid */ }
  }

  return null;
}
