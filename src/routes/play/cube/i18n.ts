import { derived } from 'svelte/store';
import { locale } from '$lib/i18n';

const messages: Record<string, Record<string, string>> = {
  en: {
    title: "Rubik's Cube",
    back: 'Games',
    subtitle: 'Solve the classic 3x3x3 puzzle cube',
    moves: 'Moves',
    status: 'Status',
    solved: 'Solved!',
    playing: 'Playing',
    scramble: 'Scramble',
    reset: 'Reset',
    undo: 'Undo',
    move_history: 'Moves',
    ask_placeholder: 'Ask the agent for help...',
    ask: 'Ask',
    token_graph: 'Token Waste per Turn',
    total: 'Total',
    tokens_wasted: 'tokens wasted',
  },
  ko: {
    title: '루빅 큐브',
    back: '게임',
    subtitle: '클래식 3x3x3 퍼즐 큐브를 풀어보세요',
    moves: '이동',
    status: '상태',
    solved: '완성!',
    playing: '플레이 중',
    scramble: '섞기',
    reset: '초기화',
    undo: '되돌리기',
    move_history: '수순',
    ask_placeholder: '에이전트에게 도움을 요청하세요...',
    ask: '질문',
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
