<script lang="ts">
	import { lightsOutStore } from '../store/lightsoutStore';

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
		<span class="agent-title">AI Assistant</span>
	</div>

	<div class="agent-speech" class:excited={agentMood === 'excited'}>
		{agentSpeech}
	</div>

	<div class="agent-input">
		<textarea
			bind:value={userMessage}
			onkeydown={handleKeydown}
			placeholder="Ask for help or strategy tips..."
			rows="2"
		></textarea>
		<button class="btn-ask" onclick={handleAskAgent} disabled={!userMessage.trim()}>
			Ask
		</button>
	</div>
</div>

<style>
	.agent-panel {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1.5rem;
		background: rgba(15, 23, 42, 0.95);
		border-radius: 0.5rem;
		border: 1px solid rgba(148, 163, 184, 0.1);
	}

	.agent-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.agent-emoji {
		font-size: 1.5rem;
	}

	.agent-title {
		font-size: 1rem;
		font-weight: 600;
		color: #e2e8f0;
	}

	.agent-speech {
		padding: 1rem;
		background: rgba(30, 41, 59, 0.6);
		border-left: 3px solid #3b82f6;
		border-radius: 0.375rem;
		color: #cbd5e1;
		font-size: 0.875rem;
		line-height: 1.6;
		min-height: 3rem;
		transition: all 0.3s;
	}

	.agent-speech.excited {
		border-left-color: #22c55e;
		background: rgba(34, 197, 94, 0.1);
		color: #86efac;
	}

	.agent-input {
		display: flex;
		gap: 0.5rem;
	}

	textarea {
		flex: 1;
		padding: 0.75rem;
		background: rgba(30, 41, 59, 0.8);
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 0.375rem;
		color: #e2e8f0;
		font-size: 0.875rem;
		font-family: inherit;
		resize: none;
		transition: all 0.2s;
	}

	textarea:focus {
		outline: none;
		border-color: #3b82f6;
		background: rgba(30, 41, 59, 0.95);
	}

	textarea::placeholder {
		color: #64748b;
	}

	.btn-ask {
		padding: 0.75rem 1.5rem;
		background: linear-gradient(135deg, #8b5cf6, #7c3aed);
		border: none;
		border-radius: 0.375rem;
		color: white;
		font-weight: 600;
		font-size: 0.875rem;
		cursor: pointer;
		transition: all 0.2s;
		align-self: flex-end;
	}

	.btn-ask:hover:not(:disabled) {
		background: linear-gradient(135deg, #7c3aed, #6d28d9);
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(139, 92, 246, 0.4);
	}

	.btn-ask:active:not(:disabled) {
		transform: translateY(0);
	}

	.btn-ask:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
