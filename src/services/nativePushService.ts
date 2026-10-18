/**
 * Native OS-Level Push Notification Service
 * Delivers alerts outside the browser window using the Web Notifications API
 * and Service Worker showNotification, rendering into Windows Notification Center / macOS Notification Center.
 */
class NativePushService {
  private swRegistration: ServiceWorkerRegistration | null = null;
  private isRegistered = false;

  public isSupported(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window;
  }

  public getPermission(): NotificationPermission {
    if (!this.isSupported()) return 'denied';
    return Notification.permission;
  }

  public async registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return null;
    }

    if (this.isRegistered && this.swRegistration) {
      return this.swRegistration;
    }

    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      this.swRegistration = reg;
      this.isRegistered = true;
      return reg;
    } catch (err) {
      console.warn('Service Worker registration skipped or failed:', err);
      return null;
    }
  }

  public async requestPermission(): Promise<NotificationPermission> {
    if (!this.isSupported()) {
      return 'denied';
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        await this.registerServiceWorker();
        // Immediately show a confirmation alert on the OS level
        await this.triggerOSNotification('OJIX TeamFlow — Desktop Alerts Enabled', {
          body: 'You will now receive notifications outside the browser on your desktop.',
          tag: 'desktop-push-enabled',
        });
      }
      return permission;
    } catch (err) {
      console.warn('Failed to request notification permission:', err);
      return 'denied';
    }
  }

  public playChime(): void {
    if (typeof window === 'undefined') return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1); // A5
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.35);
    } catch {}
  }

  public autoRequestPermissionOnInteraction(): void {
    if (typeof window === 'undefined' || !this.isSupported()) return;
    if (Notification.permission === 'default') {
      const ask = () => {
        Notification.requestPermission()
          .then(perm => {
            if (perm === 'granted') {
              this.registerServiceWorker();
            }
          })
          .catch(() => {});
        window.removeEventListener('click', ask);
      };
      window.addEventListener('click', ask, { once: true });
    }
  }

  public async triggerOSNotification(
    title: string,
    options: {
      body: string;
      tag?: string;
      data?: Record<string, unknown>;
      onClick?: () => void;
    }
  ): Promise<boolean> {
    if (!this.isSupported() || Notification.permission !== 'granted') {
      return false;
    }

    // Play subtle audio alert chime
    this.playChime();

    const payload = {
      body: options.body,
      tag: options.tag || `teamflow-${Date.now()}`,
      icon: '/vite.svg',
      badge: '/vite.svg',
      data: options.data,
      requireInteraction: true, // Crucial for OS level: keeps notification visible on Windows/Mac screen until clicked or dismissed
      silent: false,
    };

    // 1. Direct Window Notification (Instantaneous zero-latency desktop toast on Windows / macOS)
    try {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        const nativeNotif = new window.Notification(title, payload);
        nativeNotif.onclick = () => {
          window.focus();
          options.onClick?.();
          nativeNotif.close();
        };
        return true;
      }
    } catch (windowErr) {
      console.debug('Window Notification fallback to Service Worker:', windowErr);
    }

    // 2. Service Worker showNotification fallback
    try {
      if (!this.swRegistration && 'serviceWorker' in navigator) {
        await this.registerServiceWorker();
      }

      if (this.swRegistration) {
        await this.swRegistration.showNotification(title, payload);
        return true;
      }
    } catch (swErr) {
      console.warn('Service Worker showNotification fallback failed:', swErr);
    }

    return false;
  }
}

export const nativePushService = new NativePushService();
