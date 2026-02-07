// Notification service for desktop alerts

export type NotificationSound = "default" | "chime" | "pop" | "ding" | "none";

const SOUNDS: Record<NotificationSound, string | null> = {
  default: null,  // OS default
  chime: "/sounds/chime.mp3",
  pop: "/sounds/pop.mp3",
  ding: "/sounds/ding.mp3",
  none: null,
};

class NotificationService {
  private permission: NotificationPermission = "default";
  private isAppFocused = true;
  private _sound: NotificationSound = "default";

  constructor() {
    if (typeof window !== "undefined") {
      this.init();
    }
  }

  private async init() {
    // Check current permission
    if ("Notification" in window) {
      this.permission = Notification.permission;
    }

    // Track app focus state
    window.addEventListener("focus", () => {
      this.isAppFocused = true;
    });

    window.addEventListener("blur", () => {
      this.isAppFocused = false;
    });

    document.addEventListener("visibilitychange", () => {
      this.isAppFocused = document.visibilityState === "visible";
    });
    
    // Load saved sound preference
    const saved = localStorage.getItem("notification-sound");
    if (saved && saved in SOUNDS) {
      this._sound = saved as NotificationSound;
    }
  }

  get sound(): NotificationSound {
    return this._sound;
  }

  set sound(value: NotificationSound) {
    this._sound = value;
    localStorage.setItem("notification-sound", value);
  }

  private playSound() {
    if (this._sound === "none" || this._sound === "default") return;
    
    const soundPath = SOUNDS[this._sound];
    if (soundPath) {
      const audio = new Audio(soundPath);
      audio.volume = 0.5;
      audio.play().catch(() => {}); // Ignore errors
    }
  }

  async requestPermission(): Promise<boolean> {
    if (!("Notification" in window)) {
      console.warn("Notifications not supported");
      return false;
    }

    if (this.permission === "granted") {
      return true;
    }

    if (this.permission === "denied") {
      return false;
    }

    const result = await Notification.requestPermission();
    this.permission = result;
    return result === "granted";
  }

  isEnabled(): boolean {
    return this.permission === "granted";
  }

  isFocused(): boolean {
    return this.isAppFocused;
  }

  async notify(title: string, options?: {
    body?: string;
    icon?: string;
    tag?: string;
    silent?: boolean;
    onClick?: () => void;
  }): Promise<void> {
    // Don't notify if app is focused
    if (this.isAppFocused) {
      return;
    }

    // Request permission if needed
    if (this.permission !== "granted") {
      const granted = await this.requestPermission();
      if (!granted) return;
    }

    try {
      // Play custom sound if set
      const useCustomSound = this._sound !== "default" && this._sound !== "none";
      
      const notification = new Notification(title, {
        body: options?.body,
        icon: options?.icon || "/favicon.png",
        tag: options?.tag,
        silent: useCustomSound || (options?.silent ?? false),
      });

      if (useCustomSound) {
        this.playSound();
      }

      notification.onclick = () => {
        window.focus();
        notification.close();
        options?.onClick?.();
      };

      // Auto-close after 5 seconds
      setTimeout(() => notification.close(), 5000);
    } catch (e) {
      console.error("Failed to show notification:", e);
    }
  }

  // Convenience method for new message
  notifyNewMessage(agentName: string, preview: string, onClick?: () => void) {
    this.notify(`${agentName}`, {
      body: preview.length > 100 ? preview.substring(0, 100) + "..." : preview,
      tag: "new-message",
      onClick,
    });
  }
  
  // Get available sounds
  getAvailableSounds(): NotificationSound[] {
    return Object.keys(SOUNDS) as NotificationSound[];
  }
}

export const notifications = new NotificationService();
