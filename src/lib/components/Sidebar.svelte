<script lang="ts">
  import { page } from "$app/stores";
  import { t } from "$lib/i18n";

  interface NavItem {
    id: string;
    icon: string;
    labelKey: string;
    href: string;
  }

  const navItems: NavItem[] = [
    { id: "home", icon: "🏠", labelKey: "nav.home", href: "/" },
    { id: "chat", icon: "💬", labelKey: "nav.chat", href: "/chat" },
    { id: "forge", icon: "📄", labelKey: "nav.forge", href: "/forge" },
    { id: "settings", icon: "⚙️", labelKey: "nav.settings", href: "/settings" },
  ];

  $: currentPath = $page.url.pathname;

  function isActive(href: string): boolean {
    if (href === "/") return currentPath === "/";
    return currentPath.startsWith(href);
  }
</script>

<aside class="sidebar">
  <div class="logo">
    <span class="logo-icon">🦞</span>
  </div>

  <nav class="nav">
    {#each navItems as item (item.id)}
      <a 
        href={item.href}
        class="nav-item"
        class:active={isActive(item.href)}
        title={$t(item.labelKey)}
      >
        <span class="nav-icon">{item.icon}</span>
        <span class="nav-label">{$t(item.labelKey)}</span>
      </a>
    {/each}
  </nav>

  <div class="sidebar-footer">
    <!-- Future: User avatar, status, etc. -->
  </div>
</aside>

<style>
  .sidebar {
    width: 80px;
    height: 100vh;
    background: var(--sidebar-bg);
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 16px 0;
    border-right: 1px solid var(--color-border);
  }

  .logo {
    width: 48px;
    height: 48px;
    background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 24px;
  }

  .logo-icon {
    font-size: 24px;
  }

  .nav {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
    padding: 0 12px;
  }

  .nav-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 12px 8px;
    border-radius: 12px;
    cursor: pointer;
    text-decoration: none;
    transition: all 0.2s ease;
    position: relative;
  }

  .nav-item:hover {
    background: var(--color-surface-hover);
  }

  .nav-item.active {
    background: var(--color-surface-elevated);
  }

  .nav-item.active::before {
    content: "";
    position: absolute;
    left: -12px;
    top: 50%;
    transform: translateY(-50%);
    width: 3px;
    height: 24px;
    background: linear-gradient(180deg, var(--color-primary), var(--color-accent));
    border-radius: 0 4px 4px 0;
  }

  .nav-icon {
    font-size: 20px;
    transition: transform 0.2s ease, filter 0.2s ease;
  }

  .nav-item.active .nav-icon {
    filter: drop-shadow(0 0 8px var(--color-primary));
    transform: scale(1.1);
  }

  .nav-label {
    font-size: 10px;
    color: var(--color-text-muted);
    white-space: nowrap;
  }

  .nav-item.active .nav-label {
    color: var(--color-text);
  }

  .sidebar-footer {
    padding: 16px;
  }
</style>
