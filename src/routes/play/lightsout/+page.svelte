<script lang="ts">
	import LightsOutViewport from './components/LightsOutViewport.svelte';
	import HUD from './components/HUD.svelte';
	import AgentPanel from './components/AgentPanel.svelte';
</script>

<div class="page">
	<header class="header">
		<h1 class="title">
			<span class="emoji">💡</span>
			<span>Lights Out</span>
		</h1>
		<p class="subtitle">Toggle the lights to turn them all off</p>
	</header>

	<div class="game-container">
		<div class="viewport-container">
			<LightsOutViewport />
		</div>

		<aside class="sidebar">
			<HUD />
			<AgentPanel />
		</aside>
	</div>
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		height: 100vh;
		background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
		color: #e2e8f0;
		overflow: hidden;
	}

	.header {
		padding: 1.5rem 2rem;
		background: rgba(15, 23, 42, 0.8);
		border-bottom: 1px solid rgba(148, 163, 184, 0.1);
		backdrop-filter: blur(10px);
	}

	.title {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-size: 2rem;
		font-weight: 700;
		margin: 0;
		background: linear-gradient(135deg, #fbbf24, #f59e0b);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.emoji {
		font-size: 2.5rem;
		filter: drop-shadow(0 0 10px rgba(251, 191, 36, 0.5));
	}

	.subtitle {
		margin: 0.5rem 0 0 0;
		font-size: 1rem;
		color: #94a3b8;
		font-weight: 400;
	}

	.game-container {
		display: grid;
		grid-template-columns: 1fr 320px;
		gap: 1.5rem;
		padding: 1.5rem;
		flex: 1;
		overflow: hidden;
	}

	.viewport-container {
		position: relative;
		border-radius: 0.75rem;
		overflow: hidden;
		background: rgba(11, 16, 32, 0.5);
		border: 1px solid rgba(148, 163, 184, 0.1);
	}

	.sidebar {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		overflow-y: auto;
		padding-right: 0.5rem;
	}

	.sidebar::-webkit-scrollbar {
		width: 6px;
	}

	.sidebar::-webkit-scrollbar-track {
		background: rgba(30, 41, 59, 0.3);
		border-radius: 3px;
	}

	.sidebar::-webkit-scrollbar-thumb {
		background: rgba(148, 163, 184, 0.3);
		border-radius: 3px;
	}

	.sidebar::-webkit-scrollbar-thumb:hover {
		background: rgba(148, 163, 184, 0.5);
	}

	@media (max-width: 1024px) {
		.game-container {
			grid-template-columns: 1fr;
			grid-template-rows: 1fr auto;
		}

		.sidebar {
			max-height: 300px;
		}
	}
</style>
