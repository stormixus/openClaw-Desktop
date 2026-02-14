<script lang="ts">
	import { lightsOutStore, tokenHistory, tokensUsed } from '../store/lightsoutStore';
	import { kt } from '../i18n';
	import { Zap } from '@lucide/svelte';
	import TokenBarChart from '$lib/components/TokenBarChart.svelte';

	let agentSpeech = $state('');
	let agentMood = $state<'calm' | 'teasing' | 'serious' | 'excited'>('calm');
	let userMessage = $state('');

	lightsOutStore.subscribe((state) => {
		agentSpeech = state.agentSpeech;
		agentMood = state.agentMood;
	});

	function handleAskAgent() {
		if (!userMessage.trim()) return;
		lightsOutStore.askAgent(userMessage);
		userMessage = '';
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleAskAgent();
		}
	}

	const moodEmojis = {
		calm: '😌',
		teasing: '😏',
		serious: '🤔',
		excited: '🎉'
	};
</script>

<div class="agent-panel">
	<div class="agent-header">
		<span class="agent-emoji">{moodEmojis[agentMood]}</span>
		<span class="agent-title">{$kt('ai_assistant')}</span>
	</div>

	<div class="agent-speech" class:excited={agentMood === 'excited'}>
		{agentSpeech}
	</div>

	<div class="agent-input">
		<textarea
			bind:value={userMessage}
			onkeydown={handleKeydown}
			placeholder={$kt('ask_placeholder')}
			rows="2"
		></textarea>
		<button class="btn-ask" onclick={handleAskAgent} disabled={!userMessage.trim()}>
			{$kt('ask')}
		</button>
	</div>

	{#if $tokenHistory.length > 0}
		<div class="token-section">
			<div class="token-header">
				<Zap size={14} />
				<span>{$kt('token_graph')}</span>
			</div>
			<div class="chart-wrap">
				<TokenBarChart data={$tokenHistory} />
			</div>
			<div class="total">
				{$kt('total')}: ~{$tokensUsed.toLocaleString()} {$kt('tokens_wasted')}
			</div>
		</div>
	{/if}
</div>

<style>
	.agent-panel {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 12px;
		background: var(--color-surface);
		border-radius: 10px;
		border: 1px solid var(--color-border);
	}

	.agent-header {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.agent-emoji {
		font-size: 1.25rem;
	}

	.agent-title {
		font-size: 13px;
		font-weight: 600;
		color: var(--color-text);
	}

	.agent-speech {
		padding: 10px;
		background: var(--color-surface-elevated);
		border-left: 3px solid var(--color-primary);
		border-radius: 6px;
		color: var(--color-text-muted);
		font-size: 12px;
		line-height: 1.6;
		min-height: 2.5rem;
		transition: all 0.3s;
	}

	.agent-speech.excited {
		border-left-color: #22c55e;
		background: rgba(34, 197, 94, 0.08);
		color: #22c55e;
	}

	.agent-input {
		display: flex;
		gap: 6px;
	}

	textarea {
		flex: 1;
		padding: 8px;
		background: var(--color-surface-elevated);
		border: 1px solid var(--color-border);
		border-radius: 6px;
		color: var(--color-text);
		font-size: 12px;
		font-family: inherit;
		resize: none;
		transition: border-color 150ms ease;
	}

	textarea:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	textarea::placeholder {
		color: var(--color-text-subtle);
	}

	.btn-ask {
		padding: 8px 12px;
		background: var(--color-primary);
		border: none;
		border-radius: 6px;
		color: white;
		font-weight: 600;
		font-size: 12px;
		cursor: pointer;
		transition: background 150ms ease;
		align-self: flex-end;
	}

	.btn-ask:hover:not(:disabled) {
		background: var(--color-primary-hover);
	}

	.btn-ask:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.token-section { margin-top: 2px; }
	.token-header { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: var(--color-text-muted); margin-bottom: 6px; }
	.chart-wrap { height: 48px; }
	.total { font-size: 11px; color: var(--color-text-subtle); margin-top: 4px; }
</style>
