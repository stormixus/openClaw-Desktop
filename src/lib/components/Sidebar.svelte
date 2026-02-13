<script lang="ts">
  import { page } from "$app/stores";
  import { t } from "$lib/i18n";
  import { Home, MessageSquare, Gamepad2, Layers, Settings, Sparkles } from "@lucide/svelte";

  interface NavItem {
    id: string;
    icon: typeof Home;
    labelKey: string;
    href: string;
  }

  const navItems: NavItem[] = [
    { id: "home", icon: Home, labelKey: "nav.home", href: "/" },
    { id: "chat", icon: MessageSquare, labelKey: "nav.chat", href: "/chat" },
    { id: "games", icon: Gamepad2, labelKey: "nav.games", href: "/games" },
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
          <item.icon size={22} strokeWidth={1.5} />
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
    width: var(--sidebar-width);
    height: 100%;
    background: var(--sidebar-bg);
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: var(--space-lg) 0;
    border-right: 1px solid var(--color-border);
    -webkit-backdrop-filter: blur(24px) saturate(180%);
    backdrop-filter: blur(24px) saturate(180%);
    position: relative;
    z-index: 10;
  }

  .logo {
    width: 40px;
    height: 40px;
    background: linear-gradient(135deg, #6366f1, #8b5cf6, #a855f7);
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: var(--space-2xl);
    color: white;
    box-shadow: 
      0 4px 16px rgba(99, 102, 241, 0.35),
      inset 0 1px 1px rgba(255, 255, 255, 0.2);
    transition: transform var(--duration-normal) var(--ease-spring),
                box-shadow var(--duration-normal) var(--ease-out);
    cursor: pointer;
  }

  .logo:hover {
    transform: scale(1.08) rotate(-3deg);
    box-shadow: 
      0 8px 28px rgba(99, 102, 241, 0.5),
      0 0 0 1px rgba(99, 102, 241, 0.2),
      inset 0 1px 1px rgba(255, 255, 255, 0.25);
  }

  .nav {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 100%;
    padding: 0 var(--space-sm);
  }

  .nav-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-md) var(--space-sm);
    border-radius: var(--radius-md);
    cursor: pointer;
    text-decoration: none;
    transition: all var(--duration-normal) var(--ease-out);
    position: relative;
    color: var(--color-text-subtle);
  }

  .nav-item:hover {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }

  .nav-item.active {
    background: var(--color-surface-hover);
    color: var(--color-primary);
  }

  .nav-item.active::before {
    content: "";
    position: absolute;
    left: -8px;
    top: 50%;
    transform: translateY(-50%);
    width: 3px;
    height: 20px;
    background: linear-gradient(180deg, var(--color-primary), var(--color-accent));
    border-radius: 0 var(--radius-full) var(--radius-full) 0;
    box-shadow: 0 0 10px rgba(99, 102, 241, 0.5);
    animation: slideIn var(--duration-normal) var(--ease-spring);
  }

  @keyframes slideIn {
    from { opacity: 0; height: 0; }
    to { opacity: 1; height: 20px; }
  }

  .nav-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform var(--duration-fast) var(--ease-out);
  }

  .nav-item:hover .nav-icon {
    transform: scale(1.08);
  }

  .nav-item.active .nav-icon {
    filter: drop-shadow(0 0 4px rgba(99, 102, 241, 0.4));
  }

  .nav-label {
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.2px;
    white-space: nowrap;
    opacity: 0.8;
    transition: opacity var(--duration-fast) var(--ease-out);
  }

  .nav-item:hover .nav-label {
    opacity: 1;
  }

  .nav-item.active .nav-label {
    color: var(--color-primary);
    font-weight: 600;
    opacity: 1;
  }

  .sidebar-footer {
    padding: var(--space-lg);
  }
</style>
