import { writable } from 'svelte/store';
import type { SokobanState, Dir } from '../core/types';
import { move, undo, resetLevel, loadLevel, checkWin } from '../core/engine';
import { LEVEL_DATA } from '../core/levels';
import { store as gwStore, getActiveClient } from '$lib/gateway/store.svelte';

function createInitialState(): SokobanState {
  const level = loadLevel(LEVEL_DATA[0]);
  return {
    level,
    playerPos: level.player,
    boxes: level.boxes,
    history: [],
    moves: 0,
    pushes: 0,
    status: 'playing',
    currentLevelIndex: 0,
    agentSpeech: 'Welcome to Sokoban! Push all boxes onto the target spots.',
    agentMood: 'calm'
  };
}

function createSokobanStore() {
  const { subscribe, set, update } = writable<SokobanState>(createInitialState());

  return {
    subscribe,

    movePlayer(dir: Dir) {
      update(state => {
        const newState = move(state, dir);
        if (newState.status === 'won') {
          return {
            ...newState,
            agentSpeech: 'Well done! Level complete!',
            agentMood: 'excited'
          };
        }
        return newState;
      });
    },

    undoMove() {
      update(state => undo(state));
    },

    resetCurrentLevel() {
      update(state => ({
        ...resetLevel(state),
        agentSpeech: 'Level reset. Try again!',
        agentMood: 'calm'
      }));
    },

    nextLevel() {
      update(state => {
        const nextIndex = state.currentLevelIndex + 1;
        if (nextIndex >= LEVEL_DATA.length) {
          return {
            ...state,
            agentSpeech: 'Congratulations! You completed all levels!',
            agentMood: 'excited'
          };
        }

        const level = loadLevel(LEVEL_DATA[nextIndex]);
        return {
          level,
          playerPos: level.player,
          boxes: level.boxes,
          history: [],
          moves: 0,
          pushes: 0,
          status: 'playing',
          currentLevelIndex: nextIndex,
          agentSpeech: `Level ${nextIndex + 1}: ${level.title}`,
          agentMood: 'calm'
        };
      });
    },

    loadLevelByIndex(index: number) {
      if (index < 0 || index >= LEVEL_DATA.length) return;

      update(() => {
        const level = loadLevel(LEVEL_DATA[index]);
        return {
          level,
          playerPos: level.player,
          boxes: level.boxes,
          history: [],
          moves: 0,
          pushes: 0,
          status: 'playing',
          currentLevelIndex: index,
          agentSpeech: `Level ${index + 1}: ${level.title}`,
          agentMood: 'calm'
        };
      });
    },

    async askAgent() {
      let moves = 0;
      let pushes = 0;
      let boardAscii = '';

      update(s => {
        moves = s.moves;
        pushes = s.pushes;
        boardAscii = generateBoardAscii(s);
        return {
          ...s,
          agentSpeech: 'Thinking...',
          agentMood: 'serious'
        };
      });

      const client = getActiveClient();
      if (!client) {
        update(s => ({
          ...s,
          agentSpeech: 'No AI client available',
          agentMood: 'calm'
        }));
        return;
      }

      const sessKey = gwStore.sessionKey || crypto.randomUUID();
      const prompt = `You are a Sokoban puzzle assistant. Analyze this board and give a brief hint (1-2 sentences):

${boardAscii}

Legend: @ = player, $ = box, . = target, * = box on target, # = wall

Current stats: ${moves} moves, ${pushes} pushes`;

      try {
        await client.sendChat({
          sessionKey: sessKey,
          message: prompt,
          idempotencyKey: crypto.randomUUID(),
          deliver: false
        });

        const messages = gwStore.chatMessages;
        const lastMsg = messages[messages.length - 1];
        const hint = lastMsg?.content || 'Keep trying!';

        update(s => ({
          ...s,
          agentSpeech: hint,
          agentMood: 'teasing'
        }));
      } catch (err) {
        update(s => ({
          ...s,
          agentSpeech: 'Error getting hint',
          agentMood: 'calm'
        }));
      }
    }
  };
}

function generateBoardAscii(state: SokobanState): string {
  const lines: string[] = [];

  for (let y = 0; y < state.level.height; y++) {
    let line = '';
    for (let x = 0; x < state.level.width; x++) {
      const cell = state.level.grid[y][x];
      const isPlayer = state.playerPos.x === x && state.playerPos.y === y;
      const hasBox = state.boxes.some(b => b.x === x && b.y === y);
      const isTarget = state.level.targets.some(t => t.x === x && t.y === y);

      if (cell === 'wall') {
        line += '#';
      } else if (isPlayer && isTarget) {
        line += '+';
      } else if (isPlayer) {
        line += '@';
      } else if (hasBox && isTarget) {
        line += '*';
      } else if (hasBox) {
        line += '$';
      } else if (isTarget) {
        line += '.';
      } else {
        line += ' ';
      }
    }
    lines.push(line);
  }

  return lines.join('\n');
}

export const store = createSokobanStore();
