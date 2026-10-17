/**
 * Client-Side Web Push Service using the standard W3C Web Push & Notifications APIs
 * Handles VAPID public key conversion, Service Worker PushManager subscription,
 * and synchronizing subscriptions with the trusted Node.js backend.
 */

import { UserProfile } from '../types/auth';
import { StoredPushSubscription } from '../types/push';

/**
 * Converts a URL-safe Base64 string to a Uint8Array for PushManager.subscribe applicationServerKey.
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

class WebPushClientService {
  private swRegistration: ServiceWorkerRegistration | null = null;
  private cachedPublicKey: string | null = null;

  /**
   * Check if the browser environment supports standard Web Push & Service Workers.
   */
  public isSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window
    );
  }

  /**
   * Get current browser notification permission status.
   */
  public getPermission(): NotificationPermission {
    if (!this.isSupported()) return 'denied';
    return Notification.permission;
  }

  /**
   * Retrieve the VAPID public key from environment or trusted backend.
   */
  public async getVapidPublicKey(): Promise<string> {
    if (this.cachedPublicKey) {
      return this.cachedPublicKey;
    }

    // 1. Try Vite environment variable first
    const envKey = (import.meta as any).env?.VITE_VAPID_PUBLIC_KEY;
    if (envKey && typeof envKey === 'string' && envKey.trim().length > 0) {
      this.cachedPublicKey = envKey.trim();
      return this.cachedPublicKey;
    }

    // 2. Fetch from backend API
    try {
      const res = await fetch('/api/push/vapid-public-key');
      if (res.ok) {
        const data = await res.json();
        if (data.publicKey) {
          this.cachedPublicKey = data.publicKey;
          return data.publicKey;
        }
      }
    } catch (err) {
      console.warn('[WebPushClient] Failed to fetch VAPID public key from backend:', err);
    }

    return '';
  }

  /**
   * Ensure Service Worker is registered and active.
   */
  public async registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
    if (!this.isSupported()) return null;

    if (this.swRegistration) {
      return this.swRegistration;
    }

    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
      this.swRegistration = reg;
      return reg;
    } catch (err) {
      console.warn('[WebPushClient] Service Worker registration failed:', err);
      return null;
    }
  }

  /**
   * Check if current browser currently holds an active push subscription.
   */
  public async getExistingSubscription(): Promise<PushSubscription | null> {
    if (!this.isSupported()) return null;

    try {
      const reg = await this.registerServiceWorker();
      if (!reg) return null;
      return await reg.pushManager.getSubscription();
    } catch (err) {
      console.warn('[WebPushClient] Error checking push subscription:', err);
      return null;
    }
  }

  /**
   * Subscribe this browser to native Web Push notifications via VAPID.
   * Only called on explicit user action.
   */
  public async subscribeUser(
    user: UserProfile,
    deviceLabel?: string
  ): Promise<{ success: boolean; subscription?: StoredPushSubscription; error?: string }> {
    if (!this.isSupported()) {
      return { success: false, error: 'Web Push is not supported in this browser.' };
    }

    // 1. Request user permission
    let perm = Notification.permission;
    if (perm !== 'granted') {
      perm = await Notification.requestPermission();
    }

    if (perm !== 'granted') {
      return { success: false, error: 'Notification permission was denied by the user.' };
    }

    // 2. Get VAPID public key
    const publicKey = await this.getVapidPublicKey();
    if (!publicKey) {
      return {
        success: false,
        error: 'VAPID public key not found. Ensure VITE_VAPID_PUBLIC_KEY is configured.',
      };
    }

    try {
      // 3. Register service worker and get pushManager
      const reg = await this.registerServiceWorker();
      if (!reg) {
        return { success: false, error: 'Failed to initialize Service Worker registration.' };
      }

      // 4. Subscribe via PushManager
      const appServerKey = urlBase64ToUint8Array(publicKey);
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: appServerKey as any,
        });
      }

      // Extract cryptographic keys
      const rawKey = sub.getKey('p256dh');
      const rawAuth = sub.getKey('auth');

      if (!rawKey || !rawAuth) {
        return { success: false, error: 'Failed to extract push encryption keys.' };
      }

      const p256dh = btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(rawKey))));
      const auth = btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(rawAuth))));

      // 5. Send subscription to trusted backend
      const payload = {
        userId: user.uid,
        endpoint: sub.endpoint,
        keys: { p256dh, auth },
        userAgent: navigator.userAgent,
        deviceLabel: deviceLabel || this.detectDeviceLabel(),
      };

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        return {
          success: false,
          error: errData.error || `Server rejected subscription with HTTP ${res.status}`,
        };
      }

      const resData = await res.json();
      return { success: true, subscription: resData.subscription };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Push subscription failed';
      return { success: false, error: msg };
    }
  }

  /**
   * Unsubscribe this browser from Web Push notifications.
   */
  public async unsubscribeUser(user: UserProfile): Promise<{ success: boolean; error?: string }> {
    if (!this.isSupported()) return { success: true };

    try {
      const reg = await this.registerServiceWorker();
      if (!reg) return { success: true };

      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();

        // Inform backend to remove subscription
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.uid, endpoint }),
        }).catch(() => {});
      }

      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unsubscribe failed';
      return { success: false, error: msg };
    }
  }

  /**
   * Trigger a test push notification to this user's registered devices.
   */
  public async sendTestNotification(
    user: UserProfile,
    deviceLabel?: string
  ): Promise<{ success: boolean; count?: number; error?: string }> {
    try {
      const res = await fetch('/api/push/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          deviceLabel: deviceLabel || this.detectDeviceLabel(),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return { success: false, error: data.error || `Error ${res.status}` };
      }

      const data = await res.json();
      return { success: true, count: data.count };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send test push';
      return { success: false, error: msg };
    }
  }

  /**
   * Fetch registered subscriptions for the authenticated user from the backend.
   */
  public async fetchUserSubscriptions(user: UserProfile): Promise<StoredPushSubscription[]> {
    try {
      const res = await fetch(`/api/push/subscriptions?userId=${encodeURIComponent(user.uid)}`);
      if (res.ok) {
        const data = await res.json();
        return data.subscriptions || [];
      }
    } catch {
      // Fallback
    }
    return [];
  }

  /**
   * Detect a friendly label for the current device/browser.
   */
  public detectDeviceLabel(): string {
    if (typeof navigator === 'undefined') return 'Desktop Device';
    const ua = navigator.userAgent;

    let browser = 'Browser';
    if (ua.includes('Edg/')) browser = 'Edge';
    else if (ua.includes('Chrome/')) browser = 'Chrome';
    else if (ua.includes('Firefox/')) browser = 'Firefox';
    else if (ua.includes('Safari/')) browser = 'Safari';

    let os = 'Device';
    if (ua.includes('Windows')) os = 'Windows';
    else if (ua.includes('Macintosh')) os = 'macOS';
    else if (ua.includes('Linux')) os = 'Linux';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

    return `${os} (${browser})`;
  }
}

export const webPushClient = new WebPushClientService();
