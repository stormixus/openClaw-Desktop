import { derived } from 'svelte/store';
import { locale } from '$lib/i18n';

const messages: Record<string, Record<string, string>> = {
  en: {
    title: 'Lights Out',
    back: 'Games',
    subtitle: 'Toggle the lights to turn them all off',
    grid_size: 'Grid Size',
    moves: 'Moves',
    lights_on: 'Lights On',
    new_game: 'New Game',
    win_message: 'All lights out in {0} moves!',
    ai_assistant: 'AI Assistant',
    ask_placeholder: 'Ask for help or strategy tips...',
    ask: 'Ask',
    token_graph: 'Token Waste per Turn',
    total: 'Total',
    tokens_wasted: 'tokens wasted',
  },
  ko: {
    title: '라이츠 아웃',
    back: '게임',
    subtitle: '모든 불을 꺼보세요',
    grid_size: '격자 크기',
    moves: '이동 횟수',
    lights_on: '켜진 불',
    new_game: '새 게임',
    win_message: '{0}번 만에 모든 불을 껐습니다!',
    ai_assistant: 'AI 어시스턴트',
    ask_placeholder: '도움이나 전략 팁을 물어보세요...',
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
  return (key: string, ...args: (string | number)[]): string => {
    let text = dict[key] ?? fallback[key] ?? key;
    args.forEach((arg, i) => {
      text = text.replace(`{${i}}`, String(arg));
    });
    return text;
  };
});
