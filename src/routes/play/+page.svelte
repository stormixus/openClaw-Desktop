<script lang="ts">
  import { onMount } from "svelte";
  import { t } from "$lib/i18n";
  import { gameModules, initGameRegistry } from "$lib/play/registry";
  import { Gamepad2, Store, Sparkles, ArrowRight } from "@lucide/svelte";

  onMount(() => initGameRegistry());

  const visibleGames = $derived($gameModules.filter((g) => g.visible));
</script>

<svelte:head>
  <title>{$t("nav.play")} | {$t("app.title")}</title>
</svelte:head>

<div class="play-page">
  <div class="play-content">
    <div class="hero-section">
      <div class="hero-icon">
        <Gamepad2 size={36} strokeWidth={1.5} />
      </div>
      <h1>{$t("games.title")}</h1>
      <p class="slogan">{$t("games.slogan")}</p>
    </div>

    <div class="card-grid">
      {#each visibleGames as game}
        <a href={game.route} class="game-card" class:playable={game.status === 'playable'}>
          <div class="card-visual">
            <span class="card-emoji">{game.emoji}</span>
            <div class="card-glow"></div>
          </div>
          <div class="card-info">
            <div class="card-header">
              <h3>{$t(game.titleKey)}</h3>
              {#if game.status === 'playable'}
                <span class="badge ready">
                  <Sparkles size={10} />
                  {$t("games.badge.playable")}
                </span>
              {:else}
                <span class="badge soon">{$t("games.badge.soon")}</span>
              {/if}
            </div>
            <p>{$t(game.descKey)}</p>
            <div class="card-footer">
              <span class="play-btn">
                {$t("games.play")}
                <ArrowRight size={14} />
              </span>
            </div>
          </div>
        </a>
      {/each}
    </div>

    <div class="store-teaser">
      <div class="store-icon">
        <Store size={22} strokeWidth={1.5} />
      </div>
      <div class="store-info">
        <h3>{$t("games.store.title")}</h3>
        <p>{$t("games.store.desc")}</p>
      </div>
      <span class="badge soon">{$t("games.badge.soon")}</span>
    </div>
  </div>
</div>

<style>
  .play-page {
    flex: 1;
    display: flex;
    overflow-y: auto;
    background: var(--color-bg);
  }

  .play-content {
    width: 100%;
    max-width: 1080px;
    margin: 0 auto;
    padding: 48px 32px;
    display: flex;
    flex-direction: column;
    gap: 32px;
  }

  .hero-section {
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    animation: fadeUp 400ms var(--ease-out);
  }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(16px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .hero-icon {
    width: 72px;
    height: 72px;
    border-radius: var(--radius-xl);
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(168, 85, 247, 0.1));
    color: var(--color-primary);
    margin-bottom: 4px;
  }

  h1 {
    margin: 0;
    font-size: 28px;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: var(--color-text);
  }

  .slogan {
    margin: 0;
    font-size: 14px;
    color: var(--color-text-muted);
    max-width: 360px;
    line-height: 1.5;
  }

  .card-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    animation: fadeUp 400ms var(--ease-out) 80ms both;
  }

  .game-card {
    display: flex;
    flex-direction: column;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    overflow: hidden;
    transition: all 200ms var(--ease-out);
    text-decoration: none;
    color: inherit;
  }

  .game-card.playable {
    cursor: pointer;
  }

  .game-card.playable:hover {
    border-color: var(--color-primary);
    transform: translateY(-3px);
    box-shadow: var(--shadow-lg), 0 0 24px rgba(99, 102, 241, 0.1);
  }

  .card-visual {
    position: relative;
    height: 120px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-surface-elevated);
    overflow: hidden;
  }

  .playable .card-visual {
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(168, 85, 247, 0.06));
  }

  .card-glow {
    position: absolute;
    width: 100px;
    height: 100px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(99, 102, 241, 0.2), transparent);
    filter: blur(24px);
  }

  .card-emoji {
    font-size: 48px;
    position: relative;
    z-index: 1;
  }

  .card-info {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex: 1;
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .card-header h3 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--color-text);
  }

  .card-info p {
    margin: 0;
    font-size: 12px;
    color: var(--color-text-muted);
    line-height: 1.5;
  }

  .card-footer {
    margin-top: auto;
    padding-top: 8px;
  }

  .play-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 600;
    color: var(--color-primary);
    transition: gap 150ms ease;
  }

  .game-card:hover .play-btn {
    gap: 10px;
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    padding: 3px 8px;
    border-radius: 4px;
    letter-spacing: 0.04em;
    flex-shrink: 0;
  }

  .badge.ready {
    background: linear-gradient(135deg, #6366f1, #8b5cf6);
    color: white;
  }

  .badge.soon {
    background: var(--color-surface-elevated);
    color: var(--color-text-subtle);
    border: 1px solid var(--color-border);
  }

  .store-teaser {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 18px 20px;
    background: var(--color-surface);
    border: 1px dashed var(--color-border);
    border-radius: var(--radius-lg);
    animation: fadeUp 400ms var(--ease-out) 160ms both;
  }

  .store-icon {
    width: 44px;
    height: 44px;
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-surface-elevated);
    color: var(--color-text-subtle);
    flex-shrink: 0;
  }

  .store-info {
    flex: 1;
  }

  .store-info h3 {
    margin: 0 0 2px;
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text);
  }

  .store-info p {
    margin: 0;
    font-size: 12px;
    color: var(--color-text-muted);
  }

  @media (max-width: 900px) {
    .card-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 640px) {
    .card-grid {
      grid-template-columns: 1fr;
    }

    .play-content {
      padding: 32px 20px;
    }
  }
</style>
