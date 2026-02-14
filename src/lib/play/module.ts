export type GameModuleStatus = 'playable' | 'soon';
export type GameModuleSource = 'builtin' | 'plugin';

export interface GameModule {
  id: string;
  route: string;
  emoji: string;
  titleKey: string;
  descKey: string;
  status: GameModuleStatus;
  source: GameModuleSource;
  visible: boolean;
  sortOrder: number;
  pluginId?: string;
  icon?: string;
  version?: string;
}
