<script lang="ts">
  import { store, parseNpcDirectives, setNpcEmotion, setNpcAction, setNpcBackground } from "$lib/gateway/store.svelte";
  import { getActiveTheme, getCharacterImage, loadThemeForGateway } from "$lib/gateway/npcThemeStore.svelte";

  // Load theme for current gateway
  $effect(() => {
    loadThemeForGateway(store.activeGatewayId);
  });

  const activeTheme = $derived(getActiveTheme());

  // Parse directives from latest assistant message
  const latestDirectives = $derived.by(() => {
    // During streaming, parse from streaming content
    if (store.isStreaming && store.streamingContent) {
      return parseNpcDirectives(store.streamingContent);
    }
    // Otherwise parse from last assistant message
    const msgs = store.chatMessages.filter(m => m.role === "assistant");
    const last = msgs[msgs.length - 1];
    if (last) return parseNpcDirectives(last.content);
    return { cleanContent: "", face: null, act: null, bg: null };
  });

  // Determine current face expression
  const currentFace = $derived.by(() => {
    // Thinking state: streaming started but no content yet
    if (store.isStreaming && !store.streamingContent) return "thinking";
    // Use directive face if available
    if (latestDirectives.face) return latestDirectives.face;
    // Default
    return "neutral";
  });

  // Update global NPC state when directives change
  $effect(() => {
    setNpcEmotion(currentFace);
    if (latestDirectives.act) setNpcAction(latestDirectives.act);
    if (latestDirectives.bg) setNpcBackground(latestDirectives.bg);
  });

  // Character image path
  const characterSrc = $derived(getCharacterImage(activeTheme, currentFace));

  // Background preset
  const BG_PRESETS = ["default", "forest", "space", "cozy", "ocean", "sunset"];
  const bgValue = $derived(
    latestDirectives.bg && latestDirectives.bg !== "default" 
      ? latestDirectives.bg 
      : activeTheme.background
  );
  const isCustomBg = $derived(bgValue && !BG_PRESETS.includes(bgValue));

  // Gesture particles based on emotion
  const gestureParticle = $derived.by(() => {
    const map: Record<string, string> = {
      happy: "✨", excited: "🎉", sad: "💧", angry: "💢",
      surprised: "❗", thinking: "💭", calm: "🍃"
    };
    return map[currentFace] ?? "";
  });

  // Action animation class
  const actionClass = $derived(latestDirectives.act ? `action-${latestDirectives.act}` : "");

  function handleActionEnd() {
    setNpcAction(null);
  }
</script>

<div class="companion-overlay bg-{isCustomBg ? 'custom' : bgValue}">
  <!-- Background layer -->
  <div class="companion-bg">
    <div class="bg-gradient"></div>
    {#if isCustomBg}
      <div class="bg-custom-image" style="background-image: url('{bgValue}')"></div>
    {/if}
    <!-- Ambient particles -->
    <div class="bg-particles">
      {#each Array(8) as _, i}
        <div class="particle" style="--delay: {i * 0.7}s; --x: {10 + Math.random() * 80}%; --y: {10 + Math.random() * 80}%"></div>
      {/each}
    </div>
  </div>

  <!-- Character layer -->
  {#if characterSrc}
    <div 
      class="character-layer {actionClass}"
      class:thinking={currentFace === "thinking" && store.isStreaming}
      onanimationend={handleActionEnd}
    >
      <img 
        src={characterSrc} 
        alt="companion character" 
        class="character-img"
      />
      
      <!-- Gesture particle -->
      {#if gestureParticle}
        {#key currentFace}
          <div class="gesture-particle">
            <span>{gestureParticle}</span>
          </div>
        {/key}
      {/if}
    </div>
  {/if}
</div>

<style>
  .companion-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 0;
    pointer-events: none;
    overflow: hidden;
    transition: all 0.8s ease;
  }

  /* =============================== */
  /* Background Presets               */
  /* =============================== */
  .companion-bg {
    position: absolute;
    inset: 0;
  }

  .bg-gradient {
    position: absolute;
    inset: 0;
    opacity: 0.15;
    transition: all 1s ease;
  }

  .bg-default .bg-gradient {
    background: radial-gradient(ellipse at 50% 80%, rgba(99, 102, 241, 0.15), transparent 70%);
  }

  .bg-forest .bg-gradient {
    background: radial-gradient(ellipse at 50% 80%, rgba(34, 197, 94, 0.2), rgba(16, 185, 129, 0.05) 70%);
  }

  .bg-space .bg-gradient {
    background: radial-gradient(ellipse at 50% 80%, rgba(139, 92, 246, 0.2), rgba(99, 102, 241, 0.05) 70%);
  }

  .bg-cozy .bg-gradient {
    background: radial-gradient(ellipse at 50% 80%, rgba(245, 158, 11, 0.15), rgba(234, 88, 12, 0.05) 70%);
  }

  .bg-ocean .bg-gradient {
    background: radial-gradient(ellipse at 50% 80%, rgba(6, 182, 212, 0.2), rgba(59, 130, 246, 0.05) 70%);
  }

  .bg-sunset .bg-gradient {
    background: radial-gradient(ellipse at 50% 80%, rgba(244, 63, 94, 0.15), rgba(245, 158, 11, 0.05) 70%);
  }

  .bg-custom-image {
    position: absolute;
    inset: 0;
    background-size: cover;
    background-position: center;
    opacity: 0.2;
    filter: blur(2px);
  }

  /* Ambient particles */
  .bg-particles {
    position: absolute;
    inset: 0;
  }

  .particle {
    position: absolute;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--color-primary);
    opacity: 0;
    left: var(--x);
    top: var(--y);
    animation: float-particle 8s ease-in-out infinite;
    animation-delay: var(--delay);
  }

  @keyframes float-particle {
    0%, 100% { opacity: 0; transform: translateY(0) scale(0.5); }
    25% { opacity: 0.3; }
    50% { opacity: 0.15; transform: translateY(-30px) scale(1); }
    75% { opacity: 0.3; }
  }

  /* =============================== */
  /* Character Layer                  */
  /* =============================== */
  .character-layer {
    position: absolute;
    bottom: 80px; /* above chat input */
    left: 50%;
    transform: translateX(-50%);
    width: 300px;
    height: 380px;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    transition: opacity 0.6s ease, filter 0.6s ease;
    opacity: 0.22;
    filter: blur(0.3px);
    /* Live2D-like idle breathing animation — always active */
    animation: idle-breathe 4s ease-in-out infinite;
  }

  .character-img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    object-position: bottom center;
    /* Smooth crossfade when expression changes */
    transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
    filter: drop-shadow(0 8px 32px rgba(0, 0, 0, 0.3));
    /* Subtle micro-sway for organic feel */
    animation: idle-sway 6s ease-in-out infinite;
  }

  /* Live2D-like idle animations */
  @keyframes idle-breathe {
    0%, 100% { transform: translateX(-50%) translateY(0) scale(1); }
    50% { transform: translateX(-50%) translateY(-3px) scale(1.008); }
  }

  @keyframes idle-sway {
    0%, 100% { transform: rotate(0deg); }
    33% { transform: rotate(0.3deg); }
    66% { transform: rotate(-0.3deg); }
  }

  /* Thinking animation — overrides idle with more pronounced motion */
  .character-layer.thinking {
    opacity: 0.32;
    animation: thinking-breathe 2.5s ease-in-out infinite;
  }

  .character-layer.thinking .character-img {
    animation: thinking-tilt 3s ease-in-out infinite;
  }

  @keyframes thinking-breathe {
    0%, 100% { transform: translateX(-50%) translateY(0) scale(1); }
    50% { transform: translateX(-50%) translateY(-8px) scale(1.015); }
  }

  @keyframes thinking-tilt {
    0%, 100% { transform: rotate(0deg) translateX(0); }
    30% { transform: rotate(-1.5deg) translateX(-4px); }
    70% { transform: rotate(1deg) translateX(2px); }
  }

  /* Action animations */
  .character-layer.action-wave {
    animation: action-wave 0.8s ease-in-out;
  }
  .character-layer.action-nod {
    animation: action-nod 0.6s ease-in-out;
  }
  .character-layer.action-shake {
    animation: action-shake 0.6s ease-in-out;
  }
  .character-layer.action-bounce {
    animation: action-bounce 0.8s ease-in-out;
  }
  .character-layer.action-bow {
    animation: action-bow 1s ease-in-out;
  }

  @keyframes action-wave {
    0%, 100% { transform: translateX(-50%) rotate(0deg); }
    25% { transform: translateX(-50%) rotate(5deg); }
    75% { transform: translateX(-50%) rotate(-5deg); }
  }

  @keyframes action-nod {
    0%, 100% { transform: translateX(-50%) translateY(0); }
    50% { transform: translateX(-50%) translateY(8px); }
  }

  @keyframes action-shake {
    0%, 100% { transform: translateX(-50%); }
    25% { transform: translateX(calc(-50% + 8px)); }
    75% { transform: translateX(calc(-50% - 8px)); }
  }

  @keyframes action-bounce {
    0%, 100% { transform: translateX(-50%) translateY(0); }
    40% { transform: translateX(-50%) translateY(-20px); }
    60% { transform: translateX(-50%) translateY(-10px); }
  }

  @keyframes action-bow {
    0%, 100% { transform: translateX(-50%) rotate(0deg) scale(1); }
    50% { transform: translateX(-50%) rotate(8deg) scale(0.95); }
  }

  /* Gesture particle */
  .gesture-particle {
    position: absolute;
    top: 10%;
    right: -10px;
    font-size: 24px;
    animation: gesture-pop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
    pointer-events: none;
  }

  @keyframes gesture-pop {
    0% { opacity: 0; transform: scale(0) translateY(10px); }
    60% { opacity: 1; transform: scale(1.2) translateY(-5px); }
    100% { opacity: 0.7; transform: scale(1) translateY(0); }
  }

  /* Dark theme adjustments */
  :global(:root[data-theme="dark"]) .character-layer {
    opacity: 0.2;
  }
</style>
