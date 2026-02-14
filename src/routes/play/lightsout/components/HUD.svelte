<script lang="ts">
	import { lightsOutStore } from '../store/lightsoutStore';
	import { kt } from '../i18n';
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
		<label for="size-select">{$kt('grid_size')}:</label>
		<select id="size-select" value={size} onchange={(e) => handleSizeChange(Number(e.currentTarget.value) as GridSize)}>
			{#each sizes as s}
				<option value={s}>{s}x{s}</option>
			{/each}
		</select>
	</div>

	<div class="hud-section stats">
		<div class="stat">
			<span class="stat-label">{$kt('moves')}:</span>
			<span class="stat-value">{moves}</span>
		</div>
		<div class="stat">
			<span class="stat-label">{$kt('lights_on')}:</span>
			<span class="stat-value">{lightsOn}</span>
		</div>
	</div>

	<div class="hud-section">
		<button class="btn-primary" onclick={handleNewGame}>{$kt('new_game')}</button>
	</div>

	{#if status === 'won'}
		<div class="win-message">
			<span class="win-emoji">🎉</span>
			<span>{$kt('win_message', moves)}</span>
		</div>
	{/if}
</div>

<style>
	.hud {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 12px;
		background: var(--color-surface);
		border-radius: 10px;
		border: 1px solid var(--color-border);
	}

	.hud-section {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	label {
		font-size: 12px;
		color: var(--color-text-muted);
		font-weight: 500;
	}

	select {
		padding: 6px 8px;
		background: var(--color-surface-elevated);
		border: 1px solid var(--color-border);
		border-radius: 6px;
		color: var(--color-text);
		font-size: 13px;
		cursor: pointer;
		transition: border-color 150ms ease;
	}

	select:hover {
		border-color: var(--color-border-strong);
	}

	select:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.stats {
		gap: 8px;
	}

	.stat {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 6px 8px;
		background: var(--color-surface-elevated);
		border-radius: 6px;
	}

	.stat-label {
		font-size: 12px;
		color: var(--color-text-muted);
	}

	.stat-value {
		font-size: 14px;
		font-weight: 600;
		color: var(--color-primary);
	}

	.btn-primary {
		padding: 8px 12px;
		background: var(--color-primary);
		border: none;
		border-radius: 8px;
		color: white;
		font-weight: 600;
		font-size: 13px;
		cursor: pointer;
		transition: background 150ms ease;
	}

	.btn-primary:hover {
		background: var(--color-primary-hover);
	}

	.win-message {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px;
		background: rgba(34, 197, 94, 0.12);
		border: 1px solid rgba(34, 197, 94, 0.25);
		border-radius: 8px;
		color: #22c55e;
		font-weight: 600;
		font-size: 13px;
		animation: slideIn 0.3s ease-out;
	}

	.win-emoji {
		font-size: 1.25rem;
	}

	@keyframes slideIn {
		from { opacity: 0; transform: translateY(-8px); }
		to { opacity: 1; transform: translateY(0); }
	}
</style>
