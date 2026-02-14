import { derived } from 'svelte/store';
import { locale } from '$lib/i18n';

const messages: Record<string, Record<string, string>> = {
  en: {
    token_graph: 'Token Waste per Turn',
    total: 'Total',
    tokens_wasted: 'tokens wasted',
  },
  ko: {
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
