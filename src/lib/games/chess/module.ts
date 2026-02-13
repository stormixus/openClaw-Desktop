import type { GameModule } from '$lib/games/module';

export const chessModule: GameModule = {
  id: 'chess',
  route: '/games/chess',
  emoji: '♟',
  titleKey: 'games.module.chess.title',
  descKey: 'games.module.chess.desc',
  status: 'playable',
};
