<script lang="ts">
  import { 
    store, 
    sendMessage, 
    abortMessage,
    getCurrentAgent,
    parseNpcDirectives,
    setNpcEmotion,
    setNpcAction,
    setNpcBackground,
    getAssistantMeta
  } from "$lib/gateway/store.svelte";
  import { 
    npcThemeState, 
    getActiveTheme, 
    getThemeAvatar,
    getCharacterImage,
    getCharacterFaceLayer,
    loadThemeForGateway 
  } from "$lib/gateway/npcThemeStore.svelte";
  import { t } from "$lib/i18n";
  import ChatInput from "./ChatInput.svelte";
  import ThemeSelector from "./ThemeSelector.svelte";
  import { Bot } from "@lucide/svelte";
  import { marked } from "marked";

  // Theme selector toggle
  let showThemeSelector = $state(false);
  let messagesEl = $state<HTMLDivElement | null>(null);

  // Eye blink state
  let isBlinking = $state(false);

  // Blink timer
  $effect(() => {
    function scheduleBlink() {
      const delay = 3000 + Math.random() * 4000; // 3-7s random
      const timer = setTimeout(() => {
        isBlinking = true;
        setTimeout(() => {
          isBlinking = false;
          scheduleBlink();
        }, 150); // blink duration
      }, delay);
      return timer;
    }
    const timer = scheduleBlink();
    return () => clearTimeout(timer);
  });

  // Load theme for current gateway on mount
  $effect(() => {
    loadThemeForGateway(store.activeGatewayId);
  });

  // Active theme
  const activeTheme = $derived(getActiveTheme());

  // Current agent info
  const agent = $derived(getCurrentAgent());

  // All messages for the panel
  const messages = $derived(store.chatMessages);

  // Latest assistant message for directive parsing
  const latestAssistant = $derived(() => {
    const msgs = store.chatMessages.filter(m => m.role === "assistant");
    return msgs[msgs.length - 1] ?? null;
  });

  // Current streaming or last message content
  const displayContent = $derived(() => {
    if (store.isStreaming && store.streamingContent) {
      return store.streamingContent;
    }
    const msg = latestAssistant();
    return msg?.content ?? "";
  });

  // Parse all directing tags from the display content
  const parsed = $derived(() => {
    const raw = displayContent();
    if (!raw) return { cleanContent: "", face: null, act: null, bg: null };
    return parseNpcDirectives(raw);
  });

  // Update NPC states whenever directives change
  $effect(() => {
    const { face, act, bg } = parsed();
    if (face) setNpcEmotion(face);
    if (act) setNpcAction(act);
    if (bg) setNpcBackground(bg);
  });

  // Auto-scroll to bottom on new messages
  $effect(() => {
    const _len = messages.length;
    const _streaming = store.streamingContent;
    if (messagesEl) {
      requestAnimationFrame(() => {
        messagesEl!.scrollTop = messagesEl!.scrollHeight;
      });
    }
  });

  // Current states
  const emotion = $derived(store.npcEmotion);
  const action = $derived(store.npcAction);
  const background = $derived(
    store.npcBackground !== "default" ? store.npcBackground : activeTheme.background
  );

  const BG_PRESETS = ["default", "forest", "space", "cozy", "ocean", "sunset"];
  const isCustomBg = $derived(background && !BG_PRESETS.includes(background));

  // Character display
  const characterName = $derived(
    activeTheme.id !== "default" ? activeTheme.name 
    : (store.assistantMeta?.name ?? agent?.name ?? agent?.id ?? "Agent")
  );

  const characterEmoji = $derived(
    activeTheme.id !== "default" ? getThemeAvatar(activeTheme, emotion)
    : (store.assistantMeta?.emoji ?? agent?.emoji ?? "🤖")
  );

  // Character art: full image (fallback) or layered parts
  const characterArtSrc = $derived(getCharacterImage(activeTheme, emotion));
  const hasParts = $derived(!!activeTheme.characterParts?.body);
  const bodySrc = $derived(activeTheme.characterParts?.body ?? null);
  const faceSrc = $derived(getCharacterFaceLayer(activeTheme, emotion));
  const armLeftSrc = $derived(activeTheme.characterParts?.arm_left ?? null);
  const armRightSrc = $derived(activeTheme.characterParts?.arm_right ?? null);
  const eyesOpenSrc = $derived(activeTheme.characterParts?.eyes_open ?? null);
  const eyesClosedSrc = $derived(activeTheme.characterParts?.eyes_closed ?? null);

  // Gesture text
  const gestureText: Record<string, string> = {
    neutral: "", happy: "✨", thinking: "💭", excited: "🎉",
    sad: "💧", surprised: "❗", angry: "💢", calm: "🍃",
  };

  // Strip directives from message content
  function stripDirectives(text: string): string {
    return text.replace(/\[(?:face|act|bg):[^\]]*\]/gi, '').trim();
  }

  function renderMarkdown(text: string): string {
    const clean = stripDirectives(text);
    if (!clean) return "";
    try { return marked.parse(clean, { async: false }) as string; }
    catch { return clean; }
  }

  async function handleSend(content: string) { await sendMessage(content); }
  async function handleAbort() { await abortMessage(); }
  function handleActionAnimEnd() { setNpcAction(null); }
</script>

<div class="npc-vn emotion-{emotion} bg-{isCustomBg ? 'custom' : background}">
  <!-- ===== LEFT: Character Panel ===== -->
  <div class="char-panel">
    <!-- Background layers -->
    <div class="char-bg">
      <div class="char-bg-gradient"></div>
      {#if isCustomBg}
        <div class="char-bg-image" style="background-image: url('{background}')"></div>
      {/if}
      <!-- Particles -->
      <div class="char-particles">
        {#each Array(8) as _, i}
          <div class="particle" style="--delay: {i * 0.7}s; --x: {10 + Math.random() * 80}%; --y: {Math.random() * 100}%"></div>
        {/each}
      </div>
    </div>

    <!-- Character layers -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div 
      class="char-figure emotion-{emotion}"
      class:action-wave={action === 'wave'}
      class:action-nod={action === 'nod'}
      class:action-shake={action === 'shake'}
      class:action-bounce={action === 'bounce'}
      class:action-bow={action === 'bow'}
      onanimationend={handleActionAnimEnd}
    >
      {#if hasParts}
        <!-- LAYERED MODE: separate body parts -->
        <div class="layer-stack">
          <!-- Body base -->
          {#if bodySrc}
            <img src={bodySrc} alt="body" class="layer layer-body" />
          {/if}
          <!-- Arms -->
          {#if armLeftSrc}
            <img src={armLeftSrc} alt="" class="layer layer-arm-left" />
          {/if}
          {#if armRightSrc}
            <img src={armRightSrc} alt="" class="layer layer-arm-right" />
          {/if}
          <!-- Face (crossfade on emotion change) -->
          {#if faceSrc}
            {#key emotion}
              <img src={faceSrc} alt="" class="layer layer-face" />
            {/key}
          {/if}
          <!-- Eye blink overlay -->
          {#if eyesOpenSrc && eyesClosedSrc}
            <img 
              src={isBlinking ? eyesClosedSrc : eyesOpenSrc} 
              alt="" 
              class="layer layer-eyes"
              class:blink={isBlinking}
            />
          {/if}
        </div>
      {:else if characterArtSrc}
        <!-- SINGLE IMAGE MODE: full character per expression -->
        <img src={characterArtSrc} alt={characterName} class="char-full-img" />
      {:else}
        <!-- EMOJI FALLBACK -->
        <div class="char-emoji-fallback">
          <span>{characterEmoji}</span>
        </div>
      {/if}

      <!-- Gesture indicator -->
      {#if gestureText[emotion]}
        <div class="gesture-float">
          <span>{gestureText[emotion]}</span>
        </div>
      {/if}
    </div>

    <!-- Character name plate -->
    <div class="char-nameplate">
      <span class="char-nameplate-text">{characterName}</span>
      <button class="theme-btn" onclick={() => showThemeSelector = true} title="Change Theme">🎭</button>
    </div>
  </div>

  <!-- ===== RIGHT: Dialog Panel ===== -->
  <div class="dialog-panel">
    <!-- Messages list -->
    <div class="msg-list" bind:this={messagesEl}>
      {#if messages.length === 0 && !store.isStreaming}
        <div class="msg-empty">
          <p>Start a conversation...</p>
        </div>
      {/if}

      {#each messages as msg, idx (idx)}
        <div class="msg-bubble msg-{msg.role}">
          {#if msg.role === "assistant"}
            <div class="msg-avatar">
              {#if characterArtSrc}
                <img src={characterArtSrc} alt="" class="msg-avatar-img" />
              {:else}
                <span>{characterEmoji}</span>
              {/if}
            </div>
          {/if}
          <div class="msg-content">
            {#if msg.role === "assistant"}
              <span class="msg-name">{characterName}</span>
            {:else}
              <span class="msg-name you">You</span>
            {/if}
            <div class="msg-text">
              {@html renderMarkdown(msg.content)}
            </div>
          </div>
        </div>
      {/each}

      <!-- Streaming message -->
      {#if store.isStreaming}
        <div class="msg-bubble msg-assistant">
          <div class="msg-avatar">
            {#if characterArtSrc}
              <img src={characterArtSrc} alt="" class="msg-avatar-img" />
            {:else}
              <span>{characterEmoji}</span>
            {/if}
          </div>
          <div class="msg-content">
            <span class="msg-name">{characterName}</span>
            {#if store.streamingContent}
              <div class="msg-text">
                {@html renderMarkdown(store.streamingContent)}
              </div>
            {:else}
              <div class="typing-dots">
                <span></span><span></span><span></span>
              </div>
            {/if}
          </div>
        </div>
      {/if}
    </div>

    <!-- Input -->
    <div class="npc-input-wrapper">
      <ChatInput 
        onsend={handleSend}
        onabort={handleAbort}
      />
    </div>
  </div>
</div>

{#if showThemeSelector}
  <ThemeSelector onclose={() => showThemeSelector = false} />
{/if}

<style>
  /* ============================================ */
  /* VN Container — Horizontal Split */
  /* ============================================ */
  .npc-vn {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    position: relative;

    --color-bg: #0a0a0f;
    --color-surface: rgba(15, 12, 30, 0.85);
    --color-surface-elevated: rgba(25, 22, 45, 0.9);
    --color-surface-hover: rgba(129, 140, 248, 0.12);
    --color-text: #f0f0f5;
    --color-text-muted: #8b8b9e;
    --color-text-subtle: #6c6c85;
    --color-border: rgba(147, 130, 255, 0.15);
    --color-border-strong: rgba(147, 130, 255, 0.25);
    --color-primary: #818cf8;
    --color-primary-hover: #6366f1;
    --color-accent: #a78bfa;
    --shadow-md: 0 4px 16px rgba(0, 0, 0, 0.45);
  }

  /* ============================================ */
  /* LEFT: Character Panel (~40%) */
  /* ============================================ */
  .char-panel {
    width: 40%;
    min-width: 280px;
    max-width: 480px;
    position: relative;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* Background */
  .char-bg {
    position: absolute;
    inset: 0;
    z-index: 0;
  }

  .char-bg-gradient {
    position: absolute;
    inset: 0;
    transition: background 1s ease;
  }

  .char-bg-image {
    position: absolute;
    inset: 0;
    background-size: cover;
    background-position: center;
    opacity: 0.7;
    transition: opacity 1s ease;
  }

  /* BG presets */
  .bg-default .char-bg-gradient {
    background: linear-gradient(180deg, #1a1032 0%, #2d1b69 30%, #1e1145 70%, #0d0a1a 100%);
  }
  .bg-forest .char-bg-gradient {
    background: linear-gradient(180deg, #0a1f0a 0%, #1a4a1a 20%, #2d7a2d 45%, #0f3020 85%, #081a10 100%);
  }
  .bg-space .char-bg-gradient {
    background: linear-gradient(180deg, #020010 0%, #0a0025 25%, #0f0040 45%, #050020 70%, #020010 100%);
  }
  .bg-cozy .char-bg-gradient {
    background: linear-gradient(180deg, #2a1a0a 0%, #4a2a10 25%, #6a4020 45%, #3a2510 70%, #1a0f05 100%);
  }
  .bg-ocean .char-bg-gradient {
    background: linear-gradient(180deg, #001020 0%, #003050 25%, #005a7a 45%, #002040 85%, #001020 100%);
  }
  .bg-sunset .char-bg-gradient {
    background: linear-gradient(180deg, #1a0a20 0%, #6a2050 20%, #d04a30 40%, #f0a050 55%, #3a1030 90%, #1a0510 100%);
  }

  /* Emotion-specific BG tints */
  .emotion-happy .char-bg-gradient {
    background: linear-gradient(180deg, #2d1b00 0%, #6b3a00 30%, #c47b1a 55%, #4a2800 80%, #1a0f00 100%);
  }
  .emotion-thinking .char-bg-gradient {
    background: linear-gradient(180deg, #0a1628 0%, #0d2847 35%, #1a4a7a 55%, #0d2847 80%, #060d1a 100%);
  }
  .emotion-sad .char-bg-gradient {
    background: linear-gradient(180deg, #0d0f14 0%, #1a2030 35%, #2a3550 55%, #141920 80%, #0a0c10 100%);
  }
  .emotion-angry .char-bg-gradient {
    background: linear-gradient(180deg, #1a0505 0%, #4a0e0e 35%, #7a1a1a 55%, #3a0808 80%, #1a0303 100%);
  }
  .emotion-excited .char-bg-gradient {
    background: linear-gradient(180deg, #2d0a2d 0%, #6b1a5c 30%, #c44a8a 50%, #e87530 65%, #1a0a1a 100%);
  }
  .emotion-calm .char-bg-gradient {
    background: linear-gradient(180deg, #0a1a15 0%, #143a2a 35%, #1a5a40 55%, #0f3020 80%, #081510 100%);
  }

  /* Particles */
  .char-particles {
    position: absolute;
    inset: 0;
    z-index: 1;
  }
  .particle {
    position: absolute;
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.15);
    left: var(--x);
    top: var(--y);
    animation: particleFloat 8s ease-in-out var(--delay) infinite;
  }
  .bg-forest .particle { background: rgba(100, 255, 100, 0.2); }
  .bg-space .particle { background: rgba(200, 200, 255, 0.3); }
  .bg-cozy .particle { background: rgba(255, 180, 80, 0.25); }
  .bg-ocean .particle { background: rgba(100, 200, 255, 0.2); }
  .bg-sunset .particle { background: rgba(255, 150, 100, 0.25); }

  @keyframes particleFloat {
    0%, 100% { transform: translateY(0) scale(1); opacity: 0.1; }
    50% { transform: translateY(-30px) scale(1.5); opacity: 0.4; }
  }

  /* ============================================ */
  /* Character Figure (layered) */
  /* ============================================ */
  .char-figure {
    position: relative;
    z-index: 2;
    flex: 1;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding: 0 20px 0;
    min-height: 0;
    transition: transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  /* Layer stack (for parts mode) */
  .layer-stack {
    position: relative;
    width: 100%;
    height: 100%;
    max-width: 320px;
  }

  .layer {
    position: absolute;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    max-height: 100%;
    max-width: 100%;
    object-fit: contain;
    object-position: bottom center;
  }

  .layer-body {
    z-index: 1;
    filter: drop-shadow(0 4px 20px rgba(0, 0, 0, 0.4));
  }

  .layer-arm-left {
    z-index: 2;
    transform-origin: 72% 22%;
    animation: arm-left-idle 3.6s ease-in-out infinite;
  }

  .layer-arm-right {
    z-index: 2;
    transform-origin: 28% 22%;
    animation: arm-right-idle 3.6s ease-in-out infinite;
  }

  /* Emotion-driven arm motion for layered characters */
  .char-figure.emotion-happy .layer-arm-left,
  .char-figure.emotion-excited .layer-arm-left {
    animation: arm-left-cheer 1.8s ease-in-out infinite;
  }

  .char-figure.emotion-happy .layer-arm-right,
  .char-figure.emotion-excited .layer-arm-right {
    animation: arm-right-cheer 1.8s ease-in-out infinite;
  }

  .char-figure.emotion-thinking .layer-arm-left {
    animation: arm-left-think 2.8s ease-in-out infinite;
  }

  .char-figure.emotion-thinking .layer-arm-right {
    animation: arm-right-think 2.8s ease-in-out infinite;
  }

  .layer-face {
    z-index: 3;
    animation: faceIn 0.3s ease-out;
  }

  @keyframes faceIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes arm-left-idle {
    0%, 100% { transform: translateX(-50%) rotate(-2deg); }
    50% { transform: translateX(-50%) rotate(4deg); }
  }

  @keyframes arm-right-idle {
    0%, 100% { transform: translateX(-50%) rotate(2deg); }
    50% { transform: translateX(-50%) rotate(-4deg); }
  }

  @keyframes arm-left-cheer {
    0%, 100% { transform: translateX(-50%) rotate(-9deg) translateY(0); }
    50% { transform: translateX(-50%) rotate(11deg) translateY(-2px); }
  }

  @keyframes arm-right-cheer {
    0%, 100% { transform: translateX(-50%) rotate(9deg) translateY(0); }
    50% { transform: translateX(-50%) rotate(-11deg) translateY(-2px); }
  }

  @keyframes arm-left-think {
    0%, 100% { transform: translateX(-50%) rotate(2deg); }
    50% { transform: translateX(-50%) rotate(-6deg) translateY(1px); }
  }

  @keyframes arm-right-think {
    0%, 100% { transform: translateX(-50%) rotate(-2deg); }
    50% { transform: translateX(-50%) rotate(6deg) translateY(1px); }
  }

  .layer-eyes {
    z-index: 4;
    transition: opacity 0.05s linear;
  }

  .layer-eyes.blink {
    animation: blinkAnim 0.15s steps(1) forwards;
  }

  @keyframes blinkAnim {
    0% { opacity: 1; }
    100% { opacity: 1; }
  }

  /* Single full image mode */
  .char-full-img {
    max-height: 100%;
    max-width: 100%;
    object-fit: contain;
    object-position: bottom center;
    filter: drop-shadow(0 4px 24px rgba(100, 80, 200, 0.4));
    animation: art-idle-sway 6s ease-in-out infinite;
  }

  @keyframes art-idle-sway {
    0%, 100% { transform: rotate(0deg); }
    33% { transform: rotate(0.4deg); }
    66% { transform: rotate(-0.4deg); }
  }

  /* Emoji fallback */
  .char-emoji-fallback {
    width: 160px;
    height: 160px;
    border-radius: 50%;
    background: linear-gradient(135deg, rgba(100, 80, 200, 0.3), rgba(60, 40, 140, 0.5));
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 64px;
    border: 2px solid rgba(147, 130, 255, 0.3);
    margin-bottom: 40px;
  }

  /* Gesture float */
  .gesture-float {
    position: absolute;
    top: 15%;
    right: 10%;
    font-size: 28px;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.4));
    animation: gesture-bob 2s ease-in-out infinite;
    z-index: 10;
  }

  @keyframes gesture-bob {
    0%, 100% { transform: translateY(0); opacity: 0.7; }
    50% { transform: translateY(-8px); opacity: 1; }
  }

  /* Nameplate */
  .char-nameplate {
    position: relative;
    z-index: 5;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(12px);
    border-top: 1px solid rgba(147, 130, 255, 0.15);
  }

  .char-nameplate-text {
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    color: var(--color-accent);
  }

  .theme-btn {
    background: none;
    border: none;
    font-size: 18px;
    cursor: pointer;
    opacity: 0.5;
    transition: all 0.2s;
    padding: 2px 6px;
    border-radius: 6px;
    line-height: 1;
  }

  .theme-btn:hover {
    opacity: 1;
    background: rgba(147, 130, 255, 0.15);
    transform: scale(1.1);
  }

  /* ============================================ */
  /* Emotion Animations */
  /* ============================================ */
  .char-figure.emotion-neutral {
    animation: idle-breathe 4s ease-in-out infinite;
  }
  .char-figure.emotion-happy {
    animation: happy-breathe 2.5s ease-in-out infinite;
  }
  .char-figure.emotion-thinking {
    animation: think-sway 3s ease-in-out infinite;
  }
  .char-figure.emotion-excited {
    animation: excited-bounce 1.5s ease-in-out infinite;
  }
  .char-figure.emotion-sad {
    animation: sad-droop 4s ease-in-out infinite;
    filter: brightness(0.85) saturate(0.8);
  }
  .char-figure.emotion-surprised {
    animation: surprised-pop 0.6s ease-out forwards;
  }
  .char-figure.emotion-angry {
    animation: angry-tremble 0.4s ease-in-out infinite;
  }
  .char-figure.emotion-calm {
    animation: calm-breathe 5s ease-in-out infinite;
  }

  @keyframes idle-breathe {
    0%, 100% { transform: translateY(0) scale(1); }
    50% { transform: translateY(-4px) scale(1.008); }
  }
  @keyframes happy-breathe {
    0%, 100% { transform: translateY(0) scale(1); }
    50% { transform: translateY(-8px) scale(1.02); }
  }
  @keyframes think-sway {
    0%, 100% { transform: rotate(0deg) translateX(0); }
    30% { transform: rotate(-1.5deg) translateX(-3px); }
    70% { transform: rotate(1deg) translateX(2px); }
  }
  @keyframes excited-bounce {
    0%, 100% { transform: translateY(0) scale(1) rotate(0deg); }
    25% { transform: translateY(-12px) scale(1.03) rotate(-1deg); }
    75% { transform: translateY(-12px) scale(1.03) rotate(1deg); }
  }
  @keyframes sad-droop {
    0%, 100% { transform: translateY(0) scale(1); }
    50% { transform: translateY(3px) scale(0.99); }
  }
  @keyframes surprised-pop {
    0% { transform: scale(1); }
    30% { transform: scale(1.08); }
    60% { transform: scale(0.98); }
    100% { transform: scale(1); }
  }
  @keyframes angry-tremble {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-2px); }
    75% { transform: translateX(2px); }
  }
  @keyframes calm-breathe {
    0%, 100% { transform: scale(1) translateY(0); }
    50% { transform: scale(1.01) translateY(-3px); }
  }

  /* Action animations */
  .char-figure.action-wave {
    animation: action-wave 1.2s ease-in-out 1 forwards !important;
  }
  .char-figure.action-nod {
    animation: action-nod 0.8s ease-in-out 1 forwards !important;
  }
  .char-figure.action-shake {
    animation: action-shake-head 0.6s ease-in-out 2 forwards !important;
  }
  .char-figure.action-bounce {
    animation: action-bounce-action 0.6s ease-in-out 2 forwards !important;
  }
  .char-figure.action-bow {
    animation: action-bow 1.2s ease-in-out 1 forwards !important;
  }

  @keyframes action-wave {
    0% { transform: rotate(0deg); }
    15% { transform: rotate(-15deg); }
    30% { transform: rotate(15deg); }
    45% { transform: rotate(-12deg); }
    60% { transform: rotate(12deg); }
    80% { transform: rotate(-5deg); }
    100% { transform: rotate(0deg); }
  }
  @keyframes action-nod {
    0%, 100% { transform: translateY(0) rotate(0deg); }
    25% { transform: translateY(8px) rotate(5deg); }
    50% { transform: translateY(0) rotate(0deg); }
    75% { transform: translateY(6px) rotate(3deg); }
  }
  @keyframes action-shake-head {
    0%, 100% { transform: translateX(0); }
    20% { transform: translateX(-8px); }
    40% { transform: translateX(8px); }
    60% { transform: translateX(-5px); }
    80% { transform: translateX(5px); }
  }
  @keyframes action-bounce-action {
    0%, 100% { transform: translateY(0) scale(1); }
    40% { transform: translateY(-25px) scale(1.1); }
    60% { transform: translateY(-5px) scale(0.95); }
  }
  @keyframes action-bow {
    0% { transform: translateY(0) rotate(0deg) scale(1); }
    30% { transform: translateY(15px) rotate(15deg) scale(0.9); }
    60% { transform: translateY(15px) rotate(15deg) scale(0.9); }
    100% { transform: translateY(0) rotate(0deg) scale(1); }
  }

  /* ============================================ */
  /* RIGHT: Dialog Panel (~60%) */
  /* ============================================ */
  .dialog-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: var(--color-bg);
    border-left: 1px solid var(--color-border);
    min-width: 0;
  }

  /* Message list */
  .msg-list {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .msg-empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-subtle);
    font-style: italic;
    font-size: 14px;
  }

  .msg-bubble {
    display: flex;
    gap: 10px;
    max-width: 100%;
  }

  .msg-user {
    flex-direction: row-reverse;
  }

  .msg-avatar {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: rgba(100, 80, 200, 0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    flex-shrink: 0;
    overflow: hidden;
  }

  .msg-avatar-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .msg-content {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    max-width: 85%;
  }

  .msg-name {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-accent);
  }

  .msg-name.you {
    color: var(--color-text-muted);
    text-align: right;
  }

  .msg-text {
    background: rgba(25, 22, 50, 0.8);
    border: 1px solid var(--color-border);
    border-radius: 12px;
    padding: 10px 14px;
    font-size: 14px;
    line-height: 1.6;
    color: var(--color-text);
  }

  .msg-user .msg-text {
    background: rgba(99, 102, 241, 0.15);
    border-color: rgba(99, 102, 241, 0.2);
  }

  .msg-text :global(p) {
    margin: 0 0 6px;
  }
  .msg-text :global(p:last-child) {
    margin-bottom: 0;
  }
  .msg-text :global(code) {
    background: rgba(147, 130, 255, 0.15);
    padding: 1px 5px;
    border-radius: 4px;
    font-size: 12px;
  }
  .msg-text :global(pre) {
    background: rgba(0, 0, 0, 0.4);
    padding: 10px;
    border-radius: 8px;
    overflow-x: auto;
    margin: 6px 0;
  }
  .msg-text :global(strong) {
    color: rgba(200, 185, 255, 1);
  }

  /* Typing dots */
  .typing-dots {
    display: flex;
    gap: 6px;
    padding: 8px 14px;
    background: rgba(25, 22, 50, 0.8);
    border: 1px solid var(--color-border);
    border-radius: 12px;
  }

  .typing-dots span {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: rgba(147, 130, 255, 0.5);
    animation: typingBounce 1.2s ease-in-out infinite;
  }
  .typing-dots span:nth-child(2) { animation-delay: 0.15s; }
  .typing-dots span:nth-child(3) { animation-delay: 0.3s; }

  @keyframes typingBounce {
    0%, 60%, 100% { transform: translateY(0); opacity: 0.3; }
    30% { transform: translateY(-6px); opacity: 1; }
  }

  /* Input wrapper */
  .npc-input-wrapper {
    border-top: 1px solid var(--color-border);
  }

  .npc-input-wrapper :global(.chat-input-area) {
    background: transparent;
    border-top: none;
  }

  .npc-input-wrapper :global(textarea) {
    background: rgba(20, 16, 40, 0.8) !important;
    backdrop-filter: blur(16px);
    border-color: rgba(147, 130, 255, 0.2) !important;
    color: #f0f0f5 !important;
  }

  .npc-input-wrapper :global(textarea::placeholder) {
    color: rgba(160, 150, 200, 0.5) !important;
  }

  .npc-input-wrapper :global(.toolbar) {
    background: rgba(20, 16, 40, 0.7);
    backdrop-filter: blur(16px);
  }

  /* Scrollbar */
  .msg-list::-webkit-scrollbar {
    width: 4px;
  }
  .msg-list::-webkit-scrollbar-track {
    background: transparent;
  }
  .msg-list::-webkit-scrollbar-thumb {
    background: rgba(147, 130, 255, 0.2);
    border-radius: 4px;
  }
  .msg-list::-webkit-scrollbar-thumb:hover {
    background: rgba(147, 130, 255, 0.4);
  }
</style>
