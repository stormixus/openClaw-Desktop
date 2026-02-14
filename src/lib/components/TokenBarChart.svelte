<script lang="ts">
  interface Props {
    data: number[];
  }

  const { data }: Props = $props();

  const BAR_COLORS = [
    '#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6',
    '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#06b6d4',
  ];

  const maxVal = $derived(Math.max(...data, 1));

  let hoverIdx = $state<number | null>(null);
  let tooltipX = $state(0);
  let tooltipY = $state(0);

  function onBarEnter(e: MouseEvent, idx: number) {
    hoverIdx = idx;
    tooltipX = e.clientX;
    tooltipY = e.clientY - 8;
  }

  function onBarMove(e: MouseEvent) {
    tooltipX = e.clientX;
    tooltipY = e.clientY - 8;
  }

  function onBarLeave() {
    hoverIdx = null;
  }
</script>

<div class="token-bar-wrap">
  <svg class="token-bar-chart" viewBox="0 0 {Math.max(data.length * 20, 40)} 60" preserveAspectRatio="none">
    {#each data as tokens, i (i)}
      {@const barW = Math.max(100 / Math.max(data.length, 2) * 0.7, 2)}
      {@const gap = 100 / Math.max(data.length, 2)}
      {@const h = (tokens / maxVal) * 54}
      {@const color = BAR_COLORS[i % BAR_COLORS.length]}
      <rect
        x="{gap * i + (gap - barW) / 2}%"
        y={60 - h}
        width="{barW}%"
        height={h}
        rx="1.5"
        fill={color}
        opacity={hoverIdx === i ? 1 : 0.85}
        class="bar"
        style="--delay: {i * 60}ms"
        onmouseenter={(e) => onBarEnter(e, i)}
        onmousemove={onBarMove}
        onmouseleave={onBarLeave}
      />
      <!-- Invisible wider hit area for thin bars -->
      <rect
        x="{gap * i}%"
        y="0"
        width="{gap}%"
        height="60"
        fill="transparent"
        onmouseenter={(e) => onBarEnter(e, i)}
        onmousemove={onBarMove}
        onmouseleave={onBarLeave}
      />
    {/each}
  </svg>
</div>

{#if hoverIdx !== null}
  <div class="tooltip" style="left:{tooltipX}px; top:{tooltipY}px;">
    <span class="tt-turn">Turn {hoverIdx + 1}</span>
    <span class="tt-val">~{data[hoverIdx].toLocaleString()} tokens</span>
  </div>
{/if}

<style>
  .token-bar-wrap {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .token-bar-chart {
    width: 100%;
    height: 100%;
    display: block;
  }

  .bar {
    animation: bar-grow 400ms cubic-bezier(0.34, 1.56, 0.64, 1) backwards;
    animation-delay: var(--delay);
    transform-origin: bottom;
    transition: opacity 150ms ease;
  }

  @keyframes bar-grow {
    from {
      transform: scaleY(0);
    }
    to {
      transform: scaleY(1);
    }
  }

  .tooltip {
    position: fixed;
    transform: translate(-50%, -100%);
    background: rgba(0, 0, 0, 0.85);
    color: #fff;
    padding: 4px 8px;
    border-radius: 5px;
    font-size: 11px;
    white-space: nowrap;
    pointer-events: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    z-index: 9999;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  }

  .tt-turn {
    color: rgba(255,255,255,0.6);
    font-size: 10px;
  }

  .tt-val {
    font-weight: 600;
    color: #fbbf24;
  }
</style>
