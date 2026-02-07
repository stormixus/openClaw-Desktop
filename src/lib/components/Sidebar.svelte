<script lang="ts">
  import { page } from "$app/stores";
  import { t } from "$lib/i18n";
  import { Home, MessageSquare, Layers, Settings, Sparkles } from "@lucide/svelte";

  interface NavItem {
    id: string;
    icon: typeof Home;
    labelKey: string;
    href: string;
  }

  const navItems: NavItem[] = [
    { id: "home", icon: Home, labelKey: "nav.home", href: "/" },
    { id: "chat", icon: MessageSquare, labelKey: "nav.chat", href: "/chat" },
    { id: "forge", icon: Layers, labelKey: "nav.forge", href: "/forge" },
    { id: "settings", icon: Settings, labelKey: "nav.settings", href: "/settings" },
  ];

  const currentPath = $derived($page.url.pathname);

  function isActive(href: string): boolean {
    if (href === "/") return currentPath === "/";
    return currentPath.startsWith(href);
  }
</script>

<aside class="sidebar">
  <div class="logo">
    <Sparkles size={24} strokeWidth={2} />
  </div>

  <nav class="nav">
    {#each navItems as item (item.id)}
      <a 
        href={item.href}
        class="nav-item"
        class:active={isActive(item.href)}
        title={$t(item.labelKey)}
      >
        <span class="nav-icon">
          <svelte:component this={item.icon} size={22} strokeWidth={1.5} />
        </span>
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
    backdrop-filter: blur(20px);
  }

  .logo {
    width: 48px;
    height: 48px;
    background: linear-gradient(135deg, #6366f1, #8b5cf6, #a855f7);
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 32px;
    color: white;
    box-shadow: 
      0 4px 12px rgba(99, 102, 241, 0.4),
      inset 0 1px 1px rgba(255, 255, 255, 0.2);
    transition: transform 0.3s ease, box-shadow 0.3s ease;
  }

  .logo:hover {
    transform: scale(1.05) rotate(-3deg);
    box-shadow: 
      0 8px 24px rgba(99, 102, 241, 0.5),
      inset 0 1px 1px rgba(255, 255, 255, 0.2);
  }

  .nav {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 100%;
    padding: 0 10px;
  }

  .nav-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 14px 8px;
    border-radius: 14px;
    cursor: pointer;
    text-decoration: none;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
    color: var(--color-text-muted);
  }

  .nav-item:hover {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }

  .nav-item.active {
    background: linear-gradient(135deg, 
      rgba(99, 102, 241, 0.15), 
      rgba(168, 85, 247, 0.1)
    );
    color: var(--color-primary);
  }

  .nav-item.active::before {
    content: "";
    position: absolute;
    left: -10px;
    top: 50%;
    transform: translateY(-50%);
    width: 3px;
    height: 28px;
    background: linear-gradient(180deg, #6366f1, #a855f7);
    border-radius: 0 4px 4px 0;
    box-shadow: 0 0 12px rgba(99, 102, 241, 0.6);
  }

  .nav-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.2s ease;
  }

  .nav-item:hover .nav-icon {
    transform: scale(1.1);
  }

  .nav-item.active .nav-icon {
    filter: drop-shadow(0 0 6px var(--color-primary));
  }

  .nav-label {
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.3px;
    white-space: nowrap;
    opacity: 0.9;
  }

  .nav-item.active .nav-label {
    color: var(--color-primary);
    font-weight: 600;
  }

  .sidebar-footer {
    padding: 16px;
  }
</style>
