/**
 * Chess Game - Modular i18n
 * Each game owns its translations for future game-store modularity.
 */
import { derived } from 'svelte/store';
import { locale } from '$lib/i18n';

const messages: Record<string, Record<string, string>> = {
  en: {
    title: 'Chess',
    desc: 'Challenge the AI to a classic game of chess. Powered by your connected LLM agent.',
    your_turn: 'Your turn',
    ai_turn: "AI's turn",
    ai_thinking: 'AI is thinking...',
    win: 'Checkmate! You win!',
    lose: 'Checkmate! AI wins!',
    stalemate: 'Stalemate — Draw',
    draw: 'Draw',
    new_game: 'New Game',
    agent: 'AI Agent',
    offline: 'Offline',
    tokens_wasted: 'tokens wasted',
    token_graph: 'Token Waste per Turn',
    total: 'Total',
    no_gateway: 'No gateway connected. Playing random moves.',
    ai_timeout: 'AI timed out. Playing random move.',
    ai_error: 'Communication error. Playing random move.',
    parse_fail: 'Could not parse AI response. Playing random move.',
    move: 'Move',
    commentary: 'AI Commentary',
    mode: 'Opponent',
    difficulty: 'Difficulty',
    diff_easy: 'Easy',
    diff_normal: 'Normal',
    diff_hard: 'Hard',
    moves: 'Moves',
    back: 'Games',
    session: 'Gateway Session',
    no_session: 'Not connected',
  },
  ko: {
    title: '체스',
    desc: 'AI 에이전트와 클래식 체스 대결을 펼쳐보세요. 연결된 LLM이 상대합니다.',
    your_turn: '당신의 차례',
    ai_turn: 'AI의 차례',
    ai_thinking: 'AI가 생각 중...',
    win: '체크메이트! 당신이 이겼습니다!',
    lose: '체크메이트! AI가 이겼습니다!',
    stalemate: '스테일메이트 — 무승부',
    draw: '무승부',
    new_game: '새 게임',
    agent: 'AI 에이전트',
    offline: '오프라인',
    tokens_wasted: '토큰 낭비',
    token_graph: '턴별 토큰 낭비',
    total: '누적',
    no_gateway: '게이트웨이 미연결. 랜덤 수를 둡니다.',
    ai_timeout: 'AI 시간 초과. 랜덤 수를 둡니다.',
    ai_error: '통신 오류. 랜덤 수를 둡니다.',
    parse_fail: 'AI 응답 파싱 실패. 랜덤 수를 둡니다.',
    move: '수',
    commentary: 'AI 코멘터리',
    mode: '상대',
    difficulty: '난이도',
    diff_easy: '쉬움',
    diff_normal: '보통',
    diff_hard: '어려움',
    moves: '기보',
    back: '게임',
    session: '게이트웨이 세션',
    no_session: '미연결',
  },
};

/** Derived store: returns a translation function that reacts to locale changes */
export const ct = derived(locale, ($locale) => {
  const lang = $locale in messages ? $locale : 'en';
  const dict = messages[lang];
  const fallback = messages.en;
  return (key: string): string => dict[key] ?? fallback[key] ?? key;
});
