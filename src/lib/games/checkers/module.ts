import type { GameModule } from '$lib/games/module';

export const checkersModule: GameModule = {
  id: 'checkers',
  route: '/games/checkers',
  emoji: '⛀',
  titleKey: 'games.module.checkers.title',
  descKey: 'games.module.checkers.desc',
  status: 'playable',
};
