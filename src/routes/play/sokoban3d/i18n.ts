import { derived } from 'svelte/store';
import { locale } from '$lib/i18n';

const messages: Record<string, Record<string, string>> = {
  en: {
    title: 'Sokoban 3D',
    back: 'Games',
    level: 'Level',
    moves: 'Moves',
    pushes: 'Pushes',
    undo: 'Undo (Ctrl+Z)',
    reset: 'Reset (R)',
    level_complete: 'Level Complete!',
    next_level: 'Next Level',
    all_complete: 'All levels completed!',
    controls: 'Controls',
    ctrl_move: 'WASD / Arrow Keys - Move',
    ctrl_undo: 'Ctrl+Z - Undo',
    ctrl_reset: 'R - Reset Level',
    ai_assistant: 'AI Assistant',
    ask_hint: 'Ask for Hint',
    token_graph: 'Token Waste per Turn',
    total: 'Total',
    tokens_wasted: 'tokens wasted',
  },
  ko: {
    title: '소코반 3D',
    back: '게임',
    level: '레벨',
    moves: '이동',
    pushes: '밀기',
    undo: '되돌리기 (Ctrl+Z)',
    reset: '초기화 (R)',
    level_complete: '레벨 클리어!',
    next_level: '다음 레벨',
    all_complete: '모든 레벨을 클리어했습니다!',
    controls: '조작법',
    ctrl_move: 'WASD / 방향키 - 이동',
    ctrl_undo: 'Ctrl+Z - 되돌리기',
    ctrl_reset: 'R - 레벨 초기화',
    ai_assistant: 'AI 어시스턴트',
    ask_hint: '힌트 요청',
    token_graph: '턴별 토큰 낭비',
    total: '누적',
    tokens_wasted: '토큰 낭비',
  },
};

export const kt = derived(locale, ($locale) => {
  const lang = $locale in messages ? $locale : 'en';
  const dict = messages[lang];
  const fallback = messages.en;
  return (key: string): string => dict[key] ?? fallback[key] ?? key;
});
