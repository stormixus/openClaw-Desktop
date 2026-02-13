import { getCurrentRulesText } from './ruleEngine';
import type { WorldState } from './types';

export function getHint(state: WorldState, level: number): { highlights: { x: number; y: number; kind: 'word' | 'entity' }[]; text: string } {
  const hints = state.initialLevel.hints ?? [];
  const targets = state.initialLevel.hintTargets ?? [];
  if (hints[level]) return { highlights: targets[level] ?? [], text: hints[level] };

  const rules = getCurrentRulesText(state);
  if (!rules.some((r) => r.endsWith(' IS YOU'))) {
    return { highlights: [], text: '먼저 "PLAYER IS YOU" 규칙을 만들어 조작 대상을 확보하세요.' };
  }
  if (!rules.some((r) => r.endsWith(' IS WIN'))) {
    return { highlights: [], text: '승리 조건이 없습니다. "GOAL IS WIN" 같은 규칙을 만들어보세요.' };
  }
  return { highlights: [], text: '규칙 줄을 밀어 새로운 문장을 만들어보세요.' };
}
