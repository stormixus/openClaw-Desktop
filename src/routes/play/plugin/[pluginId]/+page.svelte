<script lang="ts">
  import { page } from '$app/stores';
  import PluginHost from '$lib/plugin/PluginHost.svelte';

  const pluginId = $derived($page.params.pluginId ?? '');
</script>

<svelte:head>
  <title>Plugin: {pluginId}</title>
</svelte:head>

{#if pluginId}
  <PluginHost {pluginId} />
{/if}
