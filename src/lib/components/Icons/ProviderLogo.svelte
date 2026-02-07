<script lang="ts">
  interface Props {
    provider: string;
    size?: number;
  }

  const { provider, size = 16 }: Props = $props();

  // Normalize provider name for matching
  const normalizedProvider = provider.toLowerCase().replace(/[^a-z0-9]/g, '');
</script>

{#if normalizedProvider.includes('openai') || normalizedProvider.includes('gpt')}
  <!-- OpenAI -->
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/>
  </svg>
{:else if normalizedProvider.includes('anthropic') || normalizedProvider.includes('claude')}
  <!-- Anthropic -->
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.304 3.541l-5.296 16.918h3.293l5.296-16.918h-3.293zm-7.305 0l-5.296 16.918h3.293L13.292 3.54H9.999z"/>
  </svg>
{:else if normalizedProvider.includes('google') || normalizedProvider.includes('gemini')}
  <!-- Google -->
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
{:else if normalizedProvider.includes('xai') || normalizedProvider.includes('grok')}
  <!-- xAI -->
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M2.3 21L11.3 7l-4-6h4l2.5 3.8L16.3 1h4l-4 6 9 14h-4.3l-7-10.8-7 10.8z"/>
  </svg>
{:else if normalizedProvider.includes('meta') || normalizedProvider.includes('llama')}
  <!-- Meta -->
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2.04c-5.5 0-10 4.49-10 10.02 0 5 3.66 9.15 8.44 9.9v-7H7.9v-2.9h2.54V9.85c0-2.51 1.49-3.89 3.78-3.89 1.09 0 2.24.19 2.24.19v2.47h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.45 2.9h-2.33v7a10 10 0 0 0 8.44-9.9c0-5.53-4.5-10.02-10-10.02z"/>
  </svg>
{:else if normalizedProvider.includes('mistral')}
  <!-- Mistral -->
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <rect x="2" y="2" width="4" height="4"/>
    <rect x="18" y="2" width="4" height="4"/>
    <rect x="2" y="6" width="4" height="4"/>
    <rect x="6" y="6" width="4" height="4" fill="#F7D046"/>
    <rect x="14" y="6" width="4" height="4" fill="#F7D046"/>
    <rect x="18" y="6" width="4" height="4"/>
    <rect x="2" y="10" width="4" height="4"/>
    <rect x="6" y="10" width="4" height="4"/>
    <rect x="10" y="10" width="4" height="4" fill="#F2A73B"/>
    <rect x="14" y="10" width="4" height="4"/>
    <rect x="18" y="10" width="4" height="4"/>
    <rect x="2" y="14" width="4" height="4"/>
    <rect x="10" y="14" width="4" height="4" fill="#EE792F"/>
    <rect x="18" y="14" width="4" height="4"/>
    <rect x="2" y="18" width="4" height="4"/>
    <rect x="6" y="18" width="4" height="4"/>
    <rect x="10" y="18" width="4" height="4"/>
    <rect x="14" y="18" width="4" height="4"/>
    <rect x="18" y="18" width="4" height="4"/>
  </svg>
{:else if normalizedProvider.includes('cohere')}
  <!-- Cohere -->
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <circle cx="12" cy="12" r="10"/>
  </svg>
{:else if normalizedProvider.includes('deepseek')}
  <!-- DeepSeek -->
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
  </svg>
{:else if normalizedProvider.includes('groq')}
  <!-- Groq -->
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
  </svg>
{:else}
  <!-- Default/Unknown -->
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
  </svg>
{/if}

<style>
  svg {
    flex-shrink: 0;
  }
</style>
