export type GameModuleStatus = 'playable' | 'soon';

export interface GameModule {
  id: string;
  route: string;
  emoji: string;
  titleKey: string;
  descKey: string;
  status: GameModuleStatus;
}
