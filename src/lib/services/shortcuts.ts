// Keyboard shortcuts service

export interface Shortcut {
  key: string;
  ctrl?: boolean;
  meta?: boolean;  // Cmd on Mac
  shift?: boolean;
  alt?: boolean;
  action: () => void;
  description: string;
}

class KeyboardShortcuts {
  private shortcuts: Shortcut[] = [];
  private enabled = true;
  private isMac = false;

  constructor() {
    if (typeof window !== "undefined") {
      this.isMac = navigator.platform.toUpperCase().includes("MAC");
      window.addEventListener("keydown", this.handleKeydown.bind(this));
    }
  }

  private handleKeydown(e: KeyboardEvent) {
    if (!this.enabled) return;

    // Skip if typing in input/textarea (unless it's Escape)
    const target = e.target as HTMLElement;
    const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
    
    for (const shortcut of this.shortcuts) {
      const ctrlOrMeta = this.isMac ? shortcut.meta : shortcut.ctrl;
      const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase();
      const modifierMatch = 
        (ctrlOrMeta ? (this.isMac ? e.metaKey : e.ctrlKey) : (!e.ctrlKey && !e.metaKey)) &&
        (shortcut.shift ? e.shiftKey : !e.shiftKey) &&
        (shortcut.alt ? e.altKey : !e.altKey);

      // For Escape, always trigger even in inputs
      if (shortcut.key === "Escape" && e.key === "Escape") {
        e.preventDefault();
        shortcut.action();
        return;
      }

      // For other shortcuts, skip if in input
      if (isInput && shortcut.key !== "Escape") continue;

      if (keyMatch && modifierMatch) {
        e.preventDefault();
        shortcut.action();
        return;
      }
    }
  }

  register(shortcut: Shortcut): () => void {
    this.shortcuts.push(shortcut);
    return () => {
      this.shortcuts = this.shortcuts.filter(s => s !== shortcut);
    };
  }

  registerMany(shortcuts: Shortcut[]): () => void {
    shortcuts.forEach(s => this.shortcuts.push(s));
    return () => {
      shortcuts.forEach(s => {
        this.shortcuts = this.shortcuts.filter(existing => existing !== s);
      });
    };
  }

  enable() {
    this.enabled = true;
  }

  disable() {
    this.enabled = false;
  }

  getAll(): Shortcut[] {
    return [...this.shortcuts];
  }

  // Format shortcut for display
  formatShortcut(shortcut: Shortcut): string {
    const parts: string[] = [];
    if (shortcut.ctrl || shortcut.meta) {
      parts.push(this.isMac ? "⌘" : "Ctrl");
    }
    if (shortcut.shift) {
      parts.push(this.isMac ? "⇧" : "Shift");
    }
    if (shortcut.alt) {
      parts.push(this.isMac ? "⌥" : "Alt");
    }
    parts.push(shortcut.key.toUpperCase());
    return parts.join(this.isMac ? "" : "+");
  }
}

export const shortcuts = new KeyboardShortcuts();
