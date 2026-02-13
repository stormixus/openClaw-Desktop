import { derived } from 'svelte/store';
import { locale } from '$lib/i18n';

const messages: Record<string, Record<string, string>> = {
  en: {
    title: 'Janggi',
    desc: 'Korean chess with a 3D board and AI opponent.',
    back: 'Games',
    your_turn: 'Your turn',
    ai_turn: "AI's turn",
    ai_thinking: 'AI is thinking...',
    win: 'You win!',
    lose: 'AI wins!',
    new_game: 'New Game',
    mode: 'Opponent',
    agent: 'AI Agent',
    offline: 'Offline',
    moves: 'Moves',
    token_graph: 'Token Usage per AI Turn',
    total: 'Total',
    tokens_used: 'tokens used',
    ai_commentary: 'AI Commentary',
    no_gateway: 'No gateway connected. Playing random move.',
    ai_timeout: 'AI timed out. Playing random move.',
    ai_error: 'Communication error. Playing random move.',
    parse_fail: 'Could not parse AI response. Playing random move.',
    no_legal: 'No legal move available.',
    session: 'Gateway Session',
    no_session: 'Not connected',
  },
  ko: {
    title: '장기',
    desc: '3D 보드에서 AI와 대국하는 한국 장기.',
    back: '게임',
    your_turn: '당신의 차례',
    ai_turn: 'AI의 차례',
    ai_thinking: 'AI가 생각 중...',
    win: '승리!',
    lose: '패배!',
    new_game: '새 게임',
    mode: '상대',
    agent: 'AI 에이전트',
    offline: '오프라인',
    moves: '수순',
    token_graph: '턴별 토큰 소비',
    total: '누적',
    tokens_used: '토큰 사용',
    ai_commentary: 'AI 코멘터리',
    no_gateway: '게이트웨이 미연결, 랜덤 수를 둡니다.',
    ai_timeout: 'AI 시간 초과, 랜덤 수를 둡니다.',
    ai_error: 'AI 통신 오류, 랜덤 수를 둡니다.',
    parse_fail: 'AI 응답 파싱 실패, 랜덤 수를 둡니다.',
    no_legal: '가능한 수가 없습니다.',
    session: '게이트웨이 세션',
    no_session: '미연결',
  },
};

export const jt = derived(locale, ($locale) => {
  const lang = $locale in messages ? $locale : 'en';
  const dict = messages[lang];
  const fallback = messages.en;
  return (key: string): string => dict[key] ?? fallback[key] ?? key;
});
