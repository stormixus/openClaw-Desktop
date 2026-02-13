import type { GameModule } from '$lib/games/module';

export const mines3dModule: GameModule = {
  id: 'mines3d',
  route: '/games/mines3d',
  emoji: '💣',
  titleKey: 'games.module.mines3d.title',
  descKey: 'games.module.mines3d.desc',
  status: 'playable',
};
