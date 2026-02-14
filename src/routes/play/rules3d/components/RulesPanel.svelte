<script lang="ts">
  import { rules3dStore } from '../store/rules3dStore';
  import { getCurrentRulesText } from '../core/ruleEngine';
  $: lines = getCurrentRulesText($rules3dStore);
</script>

<div class="panel">
  <h3>Current Rules</h3>
  {#if lines.length === 0}
    <p>활성 규칙 없음</p>
  {:else}
    <ul>{#each lines as line}<li>{line}</li>{/each}</ul>
  {/if}
</div>

<style>
.panel{padding:12px;border:1px solid var(--color-border);border-radius:10px;background:var(--color-surface)}
ul{margin:0;padding-left:18px}li{font-size:12px;color:var(--color-text-muted)}
</style>
