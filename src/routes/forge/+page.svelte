<script lang="ts">
  import { t } from "$lib/i18n";
  import { Hammer, Table2, FileText, Presentation, Theater } from "@lucide/svelte";
</script>

<svelte:head>
  <title>{$t("nav.forge")} | {$t("app.title")}</title>
</svelte:head>

<div class="forge-page">
  <div class="coming-soon">
    <div class="icon-container">
      <Hammer size={32} strokeWidth={1.5} />
    </div>
    <h2>{$t("forge.title")}</h2>
    <p>Build and customize your AI experience</p>
    
    <div class="features-preview">
      <a href="/forge/npc" class="feature feature-active">
        <div class="feature-icon feature-icon-npc">
          <Theater size={20} strokeWidth={1.5} />
        </div>
        <span>NPC Personas</span>
        <span class="feature-badge">Ready</span>
      </a>
      <div class="feature">
        <div class="feature-icon">
          <Table2 size={20} strokeWidth={1.5} />
        </div>
        <span>Spreadsheets</span>
      </div>
      <div class="feature">
        <div class="feature-icon">
          <FileText size={20} strokeWidth={1.5} />
        </div>
        <span>Documents</span>
      </div>
      <div class="feature">
        <div class="feature-icon">
          <Presentation size={20} strokeWidth={1.5} />
        </div>
        <span>Presentations</span>
      </div>
    </div>
  </div>
</div>

<style>
  .forge-page {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    background: var(--color-bg);
  }

  .coming-soon {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-md);
    text-align: center;
  }

  .icon-container {
    width: 72px;
    height: 72px;
    border-radius: var(--radius-xl);
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-surface-elevated);
    color: var(--color-text-subtle);
    margin-bottom: var(--space-sm);
  }

  h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    color: var(--color-text);
  }

  p {
    margin: 0;
    font-size: 13px;
    color: var(--color-text-muted);
  }

  .features-preview {
    display: flex;
    gap: var(--space-md);
    margin-top: var(--space-xl);
  }

  .feature {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-xl) var(--space-2xl);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    color: var(--color-text-muted);
    font-size: 12px;
    font-weight: 500;
    transition: all var(--duration-normal) var(--ease-out);
  }

  .feature:hover {
    border-color: var(--color-border-strong);
    transform: translateY(-2px);
    box-shadow: var(--shadow-md);
  }

  .feature-icon {
    width: 44px;
    height: 44px;
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(168, 85, 247, 0.06));
    color: var(--color-primary);
  }

  .feature-active {
    text-decoration: none;
    border-color: var(--color-primary, #6366f1);
    background: var(--color-surface-elevated, rgba(25, 22, 45, 0.7));
    position: relative;
    cursor: pointer;
  }

  .feature-active:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 32px rgba(99, 102, 241, 0.3);
    border-color: rgba(139, 92, 246, 0.8);
  }

  .feature-icon-npc {
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.25), rgba(168, 85, 247, 0.15));
    color: #a78bfa;
  }

  .feature-badge {
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 2px 8px;
    border-radius: 10px;
    background: linear-gradient(135deg, #6366f1, #8b5cf6);
    color: white;
  }
</style>
