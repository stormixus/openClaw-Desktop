import type { BoardMap, Color, Move } from './types';

const files = 'abcdefghi';

function boardAscii(board: BoardMap): string {
  const out: string[] = [];
  for (let r = 10; r >= 1; r--) {
    const row: string[] = [];
    for (let f = 0; f < 9; f++) {
      const s = `${files[f]}${r}`;
      const p = board[s];
      if (!p) row.push('.');
      else row.push(p.color === 'w' ? p.type[0].toUpperCase() : p.type[0]);
    }
    out.push(`${r.toString().padStart(2, '0')} ${row.join(' ')}`);
  }
  out.push('   a b c d e f g h i');
  return out.join('\n');
}

export function buildJanggiPrompt(params: { board: BoardMap; turn: Color; legal: Move[]; locale?: string }): string {
  const { board, turn, legal, locale = 'ko' } = params;
  const legalText = legal.map((m) => `${m.from}${m.to}`).join(', ');
  const turnText = turn === 'w' ? (locale === 'ko' ? '초(아래)' : 'Red(bottom)') : (locale === 'ko' ? '한(위)' : 'Blue(top)');

  if (locale === 'ko') {
    return `당신은 장기 AI입니다. 현재 차례는 ${turnText}입니다.\n\n보드:\n${boardAscii(board)}\n\n가능한 수: ${legalText}\n\n반드시 가능한 수 중 하나를 'a1a2' 형식으로 정확히 1개만 먼저 출력하고, 다음 줄에 1~2문장으로 이유를 설명하세요.`;
  }

  return `You are a Janggi AI. Current turn: ${turnText}.\n\nBoard:\n${boardAscii(board)}\n\nLegal moves: ${legalText}\n\nOutput exactly one move in 'a1a2' format from legal moves, then briefly explain in 1-2 sentences.`;
}
