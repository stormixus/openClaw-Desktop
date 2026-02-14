import { derived } from 'svelte/store';
import { locale } from '$lib/i18n';

const messages: Record<string, Record<string, string>> = {
  en: {
    title: 'Checkers',
    back: 'Games',
    your_turn: 'Your turn',
    ai_turn: "AI's turn",
    win: 'You win!',
    lose: 'AI wins!',
    draw: 'Draw',
    new_game: 'New Game',
    moves: 'Moves',
    mode: 'Opponent',
    agent: 'AI Agent',
    offline: 'Offline',
  },
  ko: {
    title: '체커',
    back: '게임',
    your_turn: '당신의 차례',
    ai_turn: 'AI의 차례',
    win: '승리!',
    lose: '패배!',
    draw: '무승부',
    new_game: '새 게임',
    moves: '수순',
    mode: '상대',
    agent: 'AI 에이전트',
    offline: '오프라인',
  },
};

export const kt = derived(locale, ($locale) => {
  const lang = $locale in messages ? $locale : 'en';
  const dict = messages[lang];
  const fallback = messages.en;
  return (key: string): string => dict[key] ?? fallback[key] ?? key;
});
