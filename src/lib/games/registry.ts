import type { GameModule } from '$lib/games/module';
import { chessModule } from '$lib/games/chess/module';
import { janggiModule } from '$lib/games/janggi/module';
import { go3dModule } from '$lib/games/go3d/module';
import { checkersModule } from '$lib/games/checkers/module';
import { mines3dModule } from '$lib/games/mines3d/module';
import { rules3dModule } from '$lib/games/rules3d/module';

export const GAME_MODULES: GameModule[] = [
  chessModule,
  janggiModule,
  go3dModule,
  checkersModule,
  mines3dModule,
  rules3dModule,
];
