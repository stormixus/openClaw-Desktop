<script lang="ts">
  import { onMount } from "svelte";

  // Tauri window API
  let appWindow: any = null;
  let isMaximized = $state(false);
  let isMac = $state(false);

  onMount(() => {
    // Detect macOS
    isMac = navigator.platform.toUpperCase().includes("MAC");

    // Dynamic import for Tauri API
    import("@tauri-apps/api/window").then(async (mod) => {
      appWindow = mod.getCurrentWindow();
      isMaximized = await appWindow?.isMaximized() ?? false;
      
      // Listen for maximize/unmaximize events
      appWindow?.onResized(async () => {
        isMaximized = await appWindow?.isMaximized() ?? false;
      });
    }).catch(() => {
      console.log("Not running in Tauri environment");
    });
  });

  async function minimize() {
    await appWindow?.minimize();
  }

  async function toggleMaximize() {
    if (isMaximized) {
      await appWindow?.unmaximize();
    } else {
      await appWindow?.maximize();
    }
    isMaximized = !isMaximized;
  }

  async function close() {
    await appWindow?.close();
  }

  // Programmatic drag — more reliable than data-tauri-drag-region after resize
  function handleMouseDown(e: MouseEvent) {
    // Don't drag if clicking a button or interactive element
    const target = e.target as HTMLElement;
    if (target.closest("button") || target.closest("a")) return;
    appWindow?.startDragging();
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="titlebar" data-tauri-drag-region class:mac={isMac} onmousedown={handleMouseDown}>
  {#if isMac}
    <!-- macOS style: Traffic lights on left -->
    <div class="traffic-lights">
      <button class="traffic-btn close" onclick={close} title="Close">
        <svg viewBox="0 0 12 12"><path d="M3.5 3.5l5 5M8.5 3.5l-5 5" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>
      </button>
      <button class="traffic-btn minimize" onclick={minimize} title="Minimize">
        <svg viewBox="0 0 12 12"><path d="M2 6h8" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>
      </button>
      <button class="traffic-btn maximize" onclick={toggleMaximize} title={isMaximized ? "Restore" : "Maximize"}>
        {#if isMaximized}
          <svg viewBox="0 0 12 12"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="1" fill="none"/></svg>
        {:else}
          <svg viewBox="0 0 12 12"><path d="M2 2h8v8H2z" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>
        {/if}
      </button>
    </div>
    <div class="titlebar-center" data-tauri-drag-region>
      <span class="app-title">OpenClaw</span>
    </div>
    <div class="titlebar-spacer"></div>
  {:else}
    <!-- Windows style -->
    <div class="titlebar-left" data-tauri-drag-region>
      <img src="/favicon.png" alt="OpenClaw" class="app-icon" />
      <span class="app-title">OpenClaw Desktop</span>
    </div>
    <div class="win-controls">
      <button class="win-btn" onclick={minimize} title="Minimize">
        <svg viewBox="0 0 10 10"><path d="M0 5h10" stroke="currentColor" stroke-width="1"/></svg>
      </button>
      <button class="win-btn" onclick={toggleMaximize} title={isMaximized ? "Restore" : "Maximize"}>
        {#if isMaximized}
          <svg viewBox="0 0 10 10"><rect x="0" y="2" width="7" height="7" stroke="currentColor" fill="none"/><path d="M3 2V0h7v7h-2" stroke="currentColor" fill="none"/></svg>
        {:else}
          <svg viewBox="0 0 10 10"><rect x="0" y="0" width="10" height="10" stroke="currentColor" fill="none"/></svg>
        {/if}
      </button>
      <button class="win-btn close" onclick={close} title="Close">
        <svg viewBox="0 0 10 10"><path d="M0 0l10 10M10 0L0 10" stroke="currentColor" stroke-width="1"/></svg>
      </button>
    </div>
  {/if}
</div>

<style>
  .titlebar {
    display: flex;
    align-items: center;
    height: 38px;
    padding: 0 var(--space-md);
    background: transparent;
    user-select: none;
    -webkit-user-select: none;
    position: sticky;
    top: 0;
    z-index: 1000;
  }

  .titlebar.mac {
    height: 28px;
    padding: 0 var(--space-sm);
  }

  /* macOS Traffic Lights */
  .traffic-lights {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: 0 var(--space-xs);
  }

  .traffic-btn {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all var(--duration-fast) ease;
  }

  .traffic-btn svg {
    width: 8px;
    height: 8px;
    opacity: 0;
    transition: opacity var(--duration-fast) ease;
  }

  .traffic-lights:hover .traffic-btn svg {
    opacity: 1;
  }

  .traffic-btn.close { background: #ff5f57; color: #4a0002; }
  .traffic-btn.close:hover { background: #ff3b30; }
  .traffic-btn.minimize { background: #febc2e; color: #985700; }
  .traffic-btn.minimize:hover { background: #ffcc00; }
  .traffic-btn.maximize { background: #28c840; color: #006500; }
  .traffic-btn.maximize:hover { background: #00d42a; }

  .titlebar-center {
    flex: 1;
    display: flex;
    justify-content: center;
  }

  .titlebar-spacer {
    width: 52px;
  }

  .titlebar.mac .app-title {
    font-size: 12px;
    font-weight: 500;
    color: var(--color-text-muted);
    opacity: 0.7;
    letter-spacing: 0.2px;
  }

  /* Windows Style */
  .titlebar-left {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
  }

  .app-icon {
    width: 16px;
    height: 16px;
    border-radius: var(--radius-xs);
  }

  .app-title {
    font-size: 12px;
    font-weight: 500;
    color: var(--color-text-muted);
    letter-spacing: 0.2px;
  }

  .win-controls {
    display: flex;
    align-items: center;
  }

  .win-btn {
    width: 46px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--color-text-muted);
    transition: all var(--duration-fast) ease;
  }

  .win-btn svg {
    width: 10px;
    height: 10px;
  }

  .win-btn:hover {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }

  .win-btn.close:hover {
    background: #e81123;
    color: white;
  }
</style>
