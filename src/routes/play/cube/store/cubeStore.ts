import { writable, get } from 'svelte/store';
import type { CubeState } from '../core/types';
import { newGame, applyMove, scramble, isSolved } from '../core/engine';
import { store as gwStore, getActiveClient } from '$lib/gateway/store.svelte';

function createCubeStore() {
  const initialState = newGame();
  const store = writable<CubeState>(initialState);
  const { subscribe, set, update } = store;

  return {
    subscribe,
    set,

    doMove(move: string) {
      update((state) => {
        const newState = applyMove(state, move);
        const solved = isSolved(newState);

        const result: CubeState = {
          ...newState,
          moves: [...state.moves, move],
          moveCount: state.moveCount + 1,
          status: solved ? 'solved' : 'playing',
          agentSpeech: solved
            ? 'Congratulations! You solved the cube!'
            : state.agentSpeech,
          agentMood: solved ? 'excited' : state.agentMood
        };

        return result;
      });
    },

    scrambleCube() {
      update((state) => {
        const scrambled = scramble(state, 20);
        return {
          ...scrambled,
          agentSpeech: 'Cube scrambled. Good luck!',
          agentMood: 'teasing'
        };
      });
    },

    resetCube() {
      set({
        ...newGame(),
        agentSpeech: 'Fresh start! Scramble when ready.',
        agentMood: 'calm'
      });
    },

    undoMove() {
      update((state) => {
        if (state.moves.length === 0) return state;

        // Rebuild state from scratch by replaying all moves except the last one
        let newState = newGame();
        const movesToReplay = state.moves.slice(0, -1);

        for (const move of movesToReplay) {
          newState = applyMove(newState, move);
        }

        return {
          ...newState,
          moves: movesToReplay,
          moveCount: Math.max(0, state.moveCount - 1),
          scrambled: state.scrambled,
          status: isSolved(newState) ? 'solved' : 'playing',
          agentSpeech: 'Move undone.',
          agentMood: 'calm'
        };
      });
    },

    async askAgent(question: string) {
      const client = getActiveClient();
      if (!client || !gwStore.activeGatewayId) {
        update((state) => ({
          ...state,
          agentSpeech: 'Agent not connected.',
          agentMood: 'calm'
        }));
        return;
      }

      update((state) => ({
        ...state,
        agentSpeech: 'Thinking...',
        agentMood: 'serious'
      }));

      const currentState = get(store);

      try {
        // Send cube state to LLM
        const faceState = JSON.stringify(currentState.faces, null, 2);
        const prompt = `You are a Rubik's Cube solving assistant. The current cube state is:\n\n${faceState}\n\nMoves so far: ${currentState.moves.join(' ')}\n\nUser question: ${question}\n\nProvide a helpful hint or next move suggestion. Keep it concise (1-2 sentences).`;

        const sessKey = `cube-${crypto.randomUUID().slice(0, 8)}`;
        await client.sendChat({
          sessionKey: sessKey,
          message: prompt,
          idempotencyKey: crypto.randomUUID(),
          deliver: false
        });

        // Listen for response
        const handleMessage = (msg: any) => {
          if (msg.role === 'assistant' && msg.content) {
            update((state) => ({
              ...state,
              agentSpeech: msg.content,
              agentMood: 'excited'
            }));
          }
        };

        client.onMessage(handleMessage);
      } catch (error) {
        console.error('Agent error:', error);
        update((state) => ({
          ...state,
          agentSpeech: 'Error communicating with agent.',
          agentMood: 'calm'
        }));
      }
    }
  };
}

export const cubeStore = createCubeStore();
