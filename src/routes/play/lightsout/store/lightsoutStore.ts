import { writable } from 'svelte/store';
import type { GridSize, LightsOutState } from '../core/types';
import { newGame, toggle, hint } from '../core/engine';
import { store as gwStore, getActiveClient } from '$lib/gateway/store.svelte';

export const tokenHistory = writable<number[]>([]);
export const tokensUsed = writable(0);

const initialState = newGame(5);

function createLightsOutStore() {
	const { subscribe, set, update } = writable<LightsOutState>(initialState);

	return {
		subscribe,
		toggleLight: (x: number, y: number) => {
			update((state) => {
				const newState = toggle(state, x, y);
				return newState;
			});
		},
		newGameAction: (size: GridSize) => {
			tokenHistory.set([]);
			tokensUsed.set(0);
			set(newGame(size));
		},
		resetGame: () => {
			tokenHistory.set([]);
			tokensUsed.set(0);
			update((state) => newGame(state.size));
		},
		getHint: () => {
			update((state) => {
				const hintMove = hint(state);
				if (hintMove) {
					return {
						...state,
						agentSpeech: `Try clicking the light at row ${hintMove.x + 1}, column ${hintMove.y + 1}.`,
						agentMood: 'teasing'
					};
				}
				return {
					...state,
					agentSpeech: "You've already won! Start a new game.",
					agentMood: 'calm'
				};
			});
		},
		askAgent: async (message: string) => {
			const client = getActiveClient();
			if (!client || !gwStore.activeGatewayId) {
				update((state) => ({
					...state,
					agentSpeech: 'No AI agent available.',
					agentMood: 'calm'
				}));
				return;
			}

			update((state) => ({
				...state,
				agentSpeech: 'Thinking...',
				agentMood: 'serious'
			}));

			try {
				const currentState = await new Promise<LightsOutState>((resolve) => {
					const unsubscribe = subscribe((state) => {
						resolve(state);
						unsubscribe();
					});
				});

				const lightsOn = currentState.grid.flat().filter(Boolean).length;
				const prompt = `You are a helpful Lights Out puzzle assistant. The current game state:
- Grid size: ${currentState.size}x${currentState.size}
- Lights on: ${lightsOn}
- Moves made: ${currentState.moves}
- Status: ${currentState.status}

User question: ${message}

Keep responses brief and encouraging (2-3 sentences). If asked for help, provide strategic hints about patterns in Lights Out puzzles.`;

				const sessKey = `lightsout-${crypto.randomUUID().slice(0, 8)}`;
				await client.sendChat({
					sessionKey: sessKey,
					message: prompt,
					idempotencyKey: crypto.randomUUID(),
					deliver: false
				});

				let response = '';
				for (let i = 0; i < 30; i++) {
					await new Promise((r) => setTimeout(r, 1000));
					try {
						const hist = await client.getChatHistory(sessKey);
						const assist = hist.find((m: any) => m.role === 'assistant');
						if (assist?.content) {
							response = assist.content;
							break;
						}
					} catch {
						/* polling */
					}
				}

				if (response) {
					const est = Math.round(response.length * 1.3);
					tokensUsed.update((n) => n + est);
					tokenHistory.update((h) => [...h, est]);
				}
				update((state) => ({
					...state,
					agentSpeech: response || 'No response received.',
					agentMood: 'calm'
				}));
			} catch (error) {
				update((state) => ({
					...state,
					agentSpeech: 'Error communicating with agent.',
					agentMood: 'serious'
				}));
			}
		}
	};
}

export const lightsOutStore = createLightsOutStore();
