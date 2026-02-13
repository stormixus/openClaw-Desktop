import type { GoPuzzle, Highlight } from './types';

export function getHints(puzzle: GoPuzzle, level: number): { highlights: Highlight[]; textHint: string } {
  const a = puzzle.answers[0];
  if (!a) return { highlights: [], textHint: '정답 좌표 데이터가 없습니다.' };

  if (level <= 0) {
    return { highlights: [], textHint: '급소를 먼저 보세요. 연결과 눈을 동시에 확인하세요.' };
  }

  if (level === 1) {
    return {
      highlights: [{ type: 'region', x: a.x, y: a.y, r: 2 }],
      textHint: '핵심은 이 주변입니다. 형태를 먼저 읽어보세요.',
    };
  }

  if (level === 2) {
    return {
      highlights: puzzle.answers.map((p) => ({ type: 'candidate', x: p.x, y: p.y })),
      textHint: '정답 후보 좌표를 표시했습니다.',
    };
  }

  return {
    highlights: puzzle.answers.map((p) => ({ type: 'candidate', x: p.x, y: p.y })),
    textHint: `첫 수 정답은 ${puzzle.answers.map((p) => `(${p.x},${p.y})`).join(', ')} 입니다.`,
  };
}
