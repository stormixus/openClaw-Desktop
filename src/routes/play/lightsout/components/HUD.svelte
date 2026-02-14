<script lang="ts">
	import { lightsOutStore } from '../store/lightsoutStore';
	import type { GridSize } from '../core/types';

	let size = $state<GridSize>(5);
	let moves = $state(0);
	let lightsOn = $state(0);
	let status = $state<'playing' | 'won'>('playing');

	lightsOutStore.subscribe((state) => {
		size = state.size;
		moves = state.moves;
		lightsOn = state.grid.flat().filter(Boolean).length;
		status = state.status;
	});

	function handleSizeChange(newSize: GridSize) {
		lightsOutStore.newGameAction(newSize);
	}

	function handleNewGame() {
		lightsOutStore.resetGame();
	}

	const sizes: GridSize[] = [3, 4, 5, 6, 7];
</script>

<div class="hud">
	<div class="hud-section">
		<label for="size-select">Grid Size:</label>
		<select id="size-select" value={size} onchange={(e) => handleSizeChange(Number(e.currentTarget.value) as GridSize)}>
			{#each sizes as s}
				<option value={s}>{s}x{s}</option>
			{/each}
		</select>
	</div>

	<div class="hud-section stats">
		<div class="stat">
			<span class="stat-label">Moves:</span>
			<span class="stat-value">{moves}</span>
		</div>
		<div class="stat">
			<span class="stat-label">Lights On:</span>
			<span class="stat-value">{lightsOn}</span>
		</div>
	</div>

	<div class="hud-section">
		<button class="btn-primary" onclick={handleNewGame}>New Game</button>
	</div>

	{#if status === 'won'}
		<div class="win-message">
			<span class="win-emoji">🎉</span>
			<span>All lights out in {moves} moves!</span>
		</div>
	{/if}
</div>

<style>
	.hud {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		padding: 1.5rem;
		background: rgba(15, 23, 42, 0.95);
		border-radius: 0.5rem;
		border: 1px solid rgba(148, 163, 184, 0.1);
	}

	.hud-section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	label {
		font-size: 0.875rem;
		color: #94a3b8;
		font-weight: 500;
	}

	select {
		padding: 0.5rem;
		background: rgba(30, 41, 59, 0.8);
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 0.375rem;
		color: #e2e8f0;
		font-size: 0.875rem;
		cursor: pointer;
		transition: all 0.2s;
	}

	select:hover {
		border-color: rgba(148, 163, 184, 0.4);
	}

	select:focus {
		outline: none;
		border-color: #3b82f6;
	}

	.stats {
		gap: 0.75rem;
	}

	.stat {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.5rem;
		background: rgba(30, 41, 59, 0.5);
		border-radius: 0.375rem;
	}

	.stat-label {
		font-size: 0.875rem;
		color: #94a3b8;
	}

	.stat-value {
		font-size: 1.125rem;
		font-weight: 600;
		color: #fbbf24;
	}

	.btn-primary {
		padding: 0.75rem 1.5rem;
		background: linear-gradient(135deg, #3b82f6, #2563eb);
		border: none;
		border-radius: 0.375rem;
		color: white;
		font-weight: 600;
		font-size: 0.875rem;
		cursor: pointer;
		transition: all 0.2s;
	}

	.btn-primary:hover {
		background: linear-gradient(135deg, #2563eb, #1d4ed8);
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
	}

	.btn-primary:active {
		transform: translateY(0);
	}

	.win-message {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 1rem;
		background: linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(22, 163, 74, 0.2));
		border: 1px solid rgba(34, 197, 94, 0.3);
		border-radius: 0.5rem;
		color: #86efac;
		font-weight: 600;
		animation: slideIn 0.3s ease-out;
	}

	.win-emoji {
		font-size: 1.5rem;
	}

	@keyframes slideIn {
		from {
			opacity: 0;
			transform: translateY(-10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
