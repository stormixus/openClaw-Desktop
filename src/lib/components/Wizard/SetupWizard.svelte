<script lang="ts">
  import { onMount } from "svelte";
  import { locale, setLocale, locales, t, localeNames } from "$lib/i18n";
  import { theme, setTheme } from "$lib/theme";
  import { addGateway, connectGateway, setActiveGateway } from "$lib/gateway/store.svelte";
  import { detectLocalOpenClaw, buildLocalGatewayUrl, type LocalOpenClawConfig } from "$lib/tauri";
  import type { Locale } from "$lib/i18n";

  interface Props {
    oncomplete?: () => void;
  }

  const { oncomplete }: Props = $props();

  let step = $state(1);
  const totalSteps = 4;

  // Gateway form
  let gatewayName = $state("");
  let gatewayUrl = $state("");
  let gatewayToken = $state("");

  // Local detection state
  let localDetecting = $state(false);
  let localConfig = $state<LocalOpenClawConfig | null>(null);
  let localDetectionAttempted = $state(false);

  // When entering step 3, automatically detect local openClaw
  $effect(() => {
    if (step === 3 && !localDetectionAttempted) {
      detectLocal();
    }
  });

  async function detectLocal() {
    localDetecting = true;
    localDetectionAttempted = true;
    
    try {
      localConfig = await detectLocalOpenClaw();
      
      if (localConfig.found) {
        // Auto-fill the form
        gatewayName = "Local Gateway";
        gatewayUrl = buildLocalGatewayUrl(localConfig);
        if (localConfig.token) {
          gatewayToken = localConfig.token;
        }
      }
    } catch (e) {
      console.error("Failed to detect local openClaw:", e);
    } finally {
      localDetecting = false;
    }
  }

  function nextStep() {
    if (step < totalSteps) {
      step++;
    }
  }

  function prevStep() {
    if (step > 1) {
      step--;
    }
  }

  function selectLanguage(lang: Locale) {
    setLocale(lang);
  }

  function selectTheme(t: "system" | "light" | "dark") {
    setTheme(t);
  }

  async function addGatewayAndContinue() {
    if (gatewayName && gatewayUrl) {
      const result = await addGateway({
        name: gatewayName,
        url: gatewayUrl,
        authMethod: gatewayToken ? "token" : "tailscale",
        token: gatewayToken || undefined,
      });

      // Auto-connect if local gateway was detected
      if (!result.error && localConfig?.found) {
        await setActiveGateway(result.id);
        connectGateway(result.id);
      }
    }
    nextStep();
  }

  function finishWizard() {
    localStorage.setItem("openclaw.wizardComplete", "true");
    oncomplete?.();
  }

  function skipWizard() {
    localStorage.setItem("openclaw.wizardComplete", "true");
    oncomplete?.();
  }
</script>

<div class="wizard-overlay">
  <div class="wizard-container">
    <!-- Progress Bar -->
    <div class="progress-bar">
      <div class="progress-fill" style="width: {(step / totalSteps) * 100}%"></div>
    </div>

    <!-- Step Indicator -->
    <div class="step-indicator">
      {#each Array(totalSteps) as _, i}
        <div class="step-dot" class:active={i + 1 <= step}></div>
      {/each}
    </div>

    <!-- Step Content -->
    <div class="step-content">
      {#if step === 1}
        <!-- Step 1: Language -->
        <div class="step">
          <span class="step-icon">🌐</span>
          <h2>{$t("onboarding.step2.title")}</h2>
          <p>Select your preferred language</p>
          
          <div class="language-options">
            {#each locales as lang}
              <button
                class="option-btn"
                class:selected={$locale === lang}
                onclick={() => selectLanguage(lang)}
              >
                <span class="option-icon">{lang === "en" ? "🇺🇸" : "🇰🇷"}</span>
                <span>{localeNames[lang]}</span>
              </button>
            {/each}
          </div>
        </div>

      {:else if step === 2}
        <!-- Step 2: Theme -->
        <div class="step">
          <span class="step-icon">🎨</span>
          <h2>{$t("onboarding.step2.title")}</h2>
          <p>{$t("onboarding.step2.desc")}</p>
          
          <div class="theme-options">
            <button
              class="option-btn theme-option"
              class:selected={$theme === "system"}
              onclick={() => selectTheme("system")}
            >
              <span class="option-icon">💻</span>
              <span>{$t("settings.theme.system")}</span>
            </button>
            <button
              class="option-btn theme-option"
              class:selected={$theme === "light"}
              onclick={() => selectTheme("light")}
            >
              <span class="option-icon">☀️</span>
              <span>{$t("settings.theme.light")}</span>
            </button>
            <button
              class="option-btn theme-option"
              class:selected={$theme === "dark"}
              onclick={() => selectTheme("dark")}
            >
              <span class="option-icon">🌙</span>
              <span>{$t("settings.theme.dark")}</span>
            </button>
          </div>
        </div>

      {:else if step === 3}
        <!-- Step 3: Gateway with Auto-Detection -->
        <div class="step">
          <span class="step-icon">🔗</span>
          <h2>{$t("onboarding.step1.title")}</h2>
          <p>{$t("onboarding.step1.desc")}</p>
          
          {#if localDetecting}
            <div class="detecting">
              <div class="spinner"></div>
              <p>Detecting local openClaw...</p>
            </div>
          {:else if localConfig?.found}
            <div class="local-detected">
              <div class="detected-badge">
                <span class="icon">✅</span>
                <span>Local openClaw detected!</span>
              </div>
              {#if localConfig.config_path}
                <p class="config-path">Found at: {localConfig.config_path}</p>
              {/if}
            </div>
          {/if}
          
          <div class="gateway-form">
            <div class="form-group">
              <label for="gateway-name">{$t("gateway.name")}</label>
              <input
                id="gateway-name"
                type="text"
                bind:value={gatewayName}
                placeholder="e.g. Home Server"
              />
            </div>
            <div class="form-group">
              <label for="gateway-url">{$t("gateway.url")}</label>
              <input
                id="gateway-url"
                type="text"
                bind:value={gatewayUrl}
                placeholder="ws://192.168.1.100:18789"
              />
            </div>
            <div class="form-group">
              <label for="gateway-token">{$t("gateway.token")} (optional)</label>
              <input
                id="gateway-token"
                type="password"
                bind:value={gatewayToken}
                placeholder="Leave empty for Tailscale auth"
              />
            </div>
          </div>
        </div>

      {:else if step === 4}
        <!-- Step 4: Complete -->
        <div class="step complete-step">
          <span class="step-icon">🎉</span>
          <h2>{$t("onboarding.title")}</h2>
          <p>{$t("onboarding.subtitle")}</p>
          
          <div class="complete-summary">
            <div class="summary-item">
              <span>🌐</span>
              <span>{localeNames[$locale]}</span>
            </div>
            <div class="summary-item">
              <span>🎨</span>
              <span>{$theme}</span>
            </div>
            {#if gatewayName}
              <div class="summary-item">
                <span>🔗</span>
                <span>{gatewayName}</span>
              </div>
            {/if}
          </div>
        </div>
      {/if}
    </div>

    <!-- Navigation -->
    <div class="wizard-nav">
      {#if step > 1}
        <button class="nav-btn secondary" onclick={prevStep}>
          ← Back
        </button>
      {:else}
        <button class="nav-btn skip" onclick={skipWizard}>
          {$t("onboarding.action.secondary")}
        </button>
      {/if}

      {#if step === 3}
        <button class="nav-btn primary" onclick={addGatewayAndContinue}>
          {gatewayName ? "Add & Continue" : "Skip →"}
        </button>
      {:else if step === totalSteps}
        <button class="nav-btn primary" onclick={finishWizard}>
          {$t("onboarding.action.primary")}
        </button>
      {:else}
        <button class="nav-btn primary" onclick={nextStep}>
          Continue →
        </button>
      {/if}
    </div>
  </div>
</div>

<style>
  .wizard-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .wizard-container {
    width: 480px;
    max-width: 90vw;
    background: var(--color-surface);
    border-radius: 24px;
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.4);
    overflow: hidden;
  }

  .progress-bar {
    height: 4px;
    background: var(--color-border);
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--color-primary), var(--color-accent));
    transition: width 0.4s ease;
  }

  .step-indicator {
    display: flex;
    justify-content: center;
    gap: 8px;
    padding: 24px 24px 0;
  }

  .step-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--color-border);
    transition: all 0.3s ease;
  }

  .step-dot.active {
    background: var(--color-primary);
    transform: scale(1.2);
  }

  .step-content {
    padding: 32px;
    min-height: 320px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .step {
    text-align: center;
    width: 100%;
  }

  .step-icon {
    font-size: 48px;
    display: block;
    margin-bottom: 16px;
  }

  .step h2 {
    font-size: 24px;
    font-weight: 600;
    margin: 0 0 8px;
    color: var(--color-text);
  }

  .step p {
    font-size: 14px;
    color: var(--color-text-muted);
    margin: 0 0 24px;
  }

  .language-options,
  .theme-options {
    display: flex;
    gap: 12px;
    justify-content: center;
    flex-wrap: wrap;
  }

  .option-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 16px 24px;
    min-width: 120px;
    background: var(--color-surface-elevated);
    border: 2px solid var(--color-border);
    border-radius: 16px;
    cursor: pointer;
    transition: all 0.2s ease;
    color: var(--color-text);
    font-size: 14px;
  }

  .option-btn:hover {
    border-color: var(--color-primary);
    background: var(--color-surface-hover);
  }

  .option-btn.selected {
    border-color: var(--color-primary);
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(139, 92, 246, 0.15));
  }

  .option-icon {
    font-size: 28px;
  }

  .gateway-form {
    text-align: left;
    max-width: 320px;
    margin: 0 auto;
  }

  .form-group {
    margin-bottom: 16px;
  }

  .form-group label {
    display: block;
    font-size: 12px;
    font-weight: 500;
    color: var(--color-text-muted);
    margin-bottom: 6px;
  }

  .form-group input {
    width: 100%;
    padding: 12px 16px;
    background: var(--color-surface-elevated);
    border: 1px solid var(--color-border);
    border-radius: 12px;
    color: var(--color-text);
    font-size: 14px;
    outline: none;
    transition: border-color 0.2s ease;
  }

  .form-group input:focus {
    border-color: var(--color-primary);
  }

  .form-group input::placeholder {
    color: var(--color-text-muted);
  }

  .complete-step {
    animation: fadeIn 0.5s ease;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .complete-summary {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 16px;
  }

  .summary-item {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 12px 20px;
    background: var(--color-surface-elevated);
    border-radius: 12px;
    font-size: 14px;
    color: var(--color-text);
  }

  .wizard-nav {
    display: flex;
    justify-content: space-between;
    padding: 0 32px 32px;
  }

  .nav-btn {
    padding: 12px 24px;
    border-radius: 20px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .nav-btn.primary {
    background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
    border: none;
    color: white;
  }

  .nav-btn.primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 20px rgba(59, 130, 246, 0.4);
  }

  .nav-btn.secondary {
    background: transparent;
    border: 1px solid var(--color-border);
    color: var(--color-text);
  }

  .nav-btn.secondary:hover {
    background: var(--color-surface-hover);
  }

  .nav-btn.skip {
    background: transparent;
    border: none;
    color: var(--color-text-muted);
  }

  .nav-btn.skip:hover {
    color: var(--color-text);
  }

  /* Local Detection Styles */
  .detecting {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    margin-bottom: 20px;
    color: var(--color-text-muted);
  }

  .detecting .spinner {
    width: 24px;
    height: 24px;
    border: 3px solid var(--color-border);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .detecting p {
    margin: 0;
    font-size: 13px;
  }

  .local-detected {
    margin-bottom: 20px;
    text-align: center;
  }

  .detected-badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    background: linear-gradient(135deg, rgba(34, 197, 94, 0.15), rgba(59, 130, 246, 0.15));
    border: 1px solid rgba(34, 197, 94, 0.3);
    border-radius: 20px;
    color: var(--color-success);
    font-size: 14px;
    font-weight: 500;
  }

  .detected-badge .icon {
    font-size: 16px;
  }

  .config-path {
    margin: 8px 0 0;
    font-size: 11px;
    color: var(--color-text-muted);
    font-family: monospace;
    opacity: 0.7;
  }
</style>
