import webpush from 'web-push';
import fs from 'fs';
import path from 'path';
import { StoredPushSubscription, PushPayload, PushSendResult } from '../src/types/push';

// Configuration constants
export const MAX_PAYLOAD_BYTES = 4096;
const DEFAULT_VAPID_SUBJECT = 'mailto:admin@ojix.local';

export interface PushBackendConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export class PushBackend {
  private subscriptions: Map<string, StoredPushSubscription> = new Map();
  private isConfigured = false;
  private config: PushBackendConfig = {
    publicKey: '',
    privateKey: '',
    subject: DEFAULT_VAPID_SUBJECT,
  };

  constructor(customConfig?: Partial<PushBackendConfig>) {
    this.initVapid(customConfig);
    this.loadSubscriptionsFromDisk();
  }

  /**
   * Initialize or update VAPID keys from environment or custom config.
   * Private key is strictly retained in server memory and never sent to clients.
   */
  public initVapid(customConfig?: Partial<PushBackendConfig>): boolean {
    let envPublicKey = '';
    let envPrivateKey = '';
    let envSubject = '';

    if (customConfig !== undefined) {
      envPublicKey = customConfig.publicKey ?? '';
      envPrivateKey = customConfig.privateKey ?? '';
      envSubject = customConfig.subject ?? DEFAULT_VAPID_SUBJECT;
    } else {
      envPublicKey = process.env.VITE_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY || '';
      envPrivateKey = process.env.VAPID_PRIVATE_KEY || '';
      envSubject = process.env.VAPID_SUBJECT || '';

      if (!envPublicKey || !envPrivateKey) {
        try {
          const fs = require('fs');
          const path = require('path');
          const envPath = path.resolve(process.cwd(), '.env');
          if (fs.existsSync(envPath)) {
            const content = fs.readFileSync(envPath, 'utf8');
            for (const line of content.split('\n')) {
              const trimmed = line.trim();
              if (!trimmed || trimmed.startsWith('#')) continue;
              const eqIdx = trimmed.indexOf('=');
              if (eqIdx !== -1) {
                const k = trimmed.slice(0, eqIdx).trim();
                const v = trimmed.slice(eqIdx + 1).trim();
                if ((k === 'VITE_VAPID_PUBLIC_KEY' || k === 'VAPID_PUBLIC_KEY') && !envPublicKey) envPublicKey = v;
                if (k === 'VAPID_PRIVATE_KEY' && !envPrivateKey) envPrivateKey = v;
                if (k === 'VAPID_SUBJECT' && !envSubject) envSubject = v;
              }
            }
          }
        } catch {
          // Fallback for ESM/restricted environments
        }
      }
    }

    const publicKey = envPublicKey;
    const privateKey = envPrivateKey;
    const subject = envSubject || DEFAULT_VAPID_SUBJECT;

    this.config = { publicKey, privateKey, subject };

    if (publicKey && privateKey) {
      try {
        webpush.setVapidDetails(subject, publicKey, privateKey);
        this.isConfigured = true;
        return true;
      } catch (err) {
        console.warn('[PushBackend] Invalid VAPID credentials provided:', err);
        this.isConfigured = false;
        return false;
      }
    } else {
      this.isConfigured = false;
      return false;
    }
  }

  public getPublicKey(): string {
    return this.config.publicKey;
  }

  public isReady(): boolean {
    return this.isConfigured;
  }

  /**
   * Register a browser push subscription for an authenticated user.
   * Supports multiple devices per user and prevents duplicate endpoints.
   */
  public registerSubscription(subData: {
    userId: string;
    endpoint: string;
    keys: { p256dh: string; auth: string };
    userAgent?: string;
    deviceLabel?: string;
  }): StoredPushSubscription {
    if (!subData.userId || typeof subData.userId !== 'string') {
      throw new Error('Push subscription registration requires a valid authenticated userId.');
    }
    if (!subData.endpoint || !subData.endpoint.startsWith('http')) {
      throw new Error('Push subscription registration requires a valid HTTP(S) push endpoint.');
    }
    if (!subData.keys?.p256dh || !subData.keys?.auth) {
      throw new Error('Push subscription registration requires p256dh and auth cryptographic keys.');
    }

    // Check if subscription with this endpoint already exists
    let existingId: string | null = null;
    for (const [id, s] of this.subscriptions.entries()) {
      if (s.endpoint === subData.endpoint) {
        existingId = id;
        break;
      }
    }

    const subId = existingId || `sub-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();

    const subscription: StoredPushSubscription = {
      id: subId,
      userId: subData.userId,
      userIds: [subData.userId],
      endpoint: subData.endpoint,
      keys: {
        p256dh: subData.keys.p256dh,
        auth: subData.keys.auth,
      },
      userAgent: subData.userAgent || 'Unknown Browser',
      deviceLabel: subData.deviceLabel || 'Browser Device',
      createdAt: now,
      lastDeliveredAt: null,
      isActive: true,
    };

    this.subscriptions.set(subId, subscription);
    this.saveSubscriptionsToDisk();
    return subscription;
  }

  /**
   * Unregister / deactivate a subscription by endpoint for an authenticated user.
   */
  public unregisterSubscription(endpoint: string, userId: string): boolean {
    let found = false;
    for (const [id, s] of this.subscriptions.entries()) {
      if (s.endpoint === endpoint) {
        // Enforce authorization: user cannot unregister someone else's subscription
        const userIds = s.userIds ? s.userIds : [s.userId];
        if (s.userId !== userId && !userIds.includes(userId)) {
          throw new Error('Unauthorized: Cannot unregister subscription belonging to another user.');
        }
        this.subscriptions.delete(id);
        this.saveSubscriptionsToDisk();
        found = true;
      }
    }
    return found;
  }

  /**
   * Get all active subscriptions for a specific user.
   */
  public getSubscriptionsForUser(userId: string): StoredPushSubscription[] {
    const list: StoredPushSubscription[] = [];
    for (const s of this.subscriptions.values()) {
      const userIds = s.userIds ? s.userIds : [s.userId];
      if ((s.userId === userId || userIds.includes(userId)) && s.isActive) {
        list.push(s);
      }
    }
    return list;
  }

  /**
   * Get all registered subscriptions (for audit/diagnostics).
   */
  public getAllSubscriptions(): StoredPushSubscription[] {
    return Array.from(this.subscriptions.values());
  }

  /**
   * Remove expired or invalid subscription from registry.
   */
  public cleanupSubscription(id: string): void {
    this.subscriptions.delete(id);
    this.saveSubscriptionsToDisk();
  }

  /**
   * Clear all subscriptions (for testing).
   */
  public clearAllSubscriptions(): void {
    this.subscriptions.clear();
    this.saveSubscriptionsToDisk();
  }

  private getPersistencePath(): string | null {
    try {
      return path.resolve(process.cwd(), '.push-subscriptions.json');
    } catch {
      return null;
    }
  }

  private loadSubscriptionsFromDisk(): void {
    if (process.env.NODE_ENV === 'test') return;
    try {
      const p = this.getPersistencePath();
      if (p && fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf8');
        const data = JSON.parse(raw);
        if (Array.isArray(data)) {
          for (const item of data) {
            if (item && item.id && item.endpoint && item.keys) {
              this.subscriptions.set(item.id, item);
            }
          }
        }
      }
    } catch {
      // Fallback
    }
  }

  private saveSubscriptionsToDisk(): void {
    if (process.env.NODE_ENV === 'test') return;
    try {
      const p = this.getPersistencePath();
      if (p) {
        const list = Array.from(this.subscriptions.values());
        fs.writeFileSync(p, JSON.stringify(list, null, 2), 'utf8');
      }
    } catch {
      // Fallback
    }
  }

  /**
   * Send Web Push notification to all active devices of an authenticated user.
   */
  public async sendPushToUser(userId: string, payload: PushPayload): Promise<PushSendResult[]> {
    const userSubs = this.getSubscriptionsForUser(userId);

    if (userSubs.length === 0) {
      return [];
    }

    const results: PushSendResult[] = [];
    for (const sub of userSubs) {
      const res = await this.sendPushToSubscription(sub, payload);
      results.push(res);
    }
    return results;
  }

  /**
   * Send Web Push message to an individual subscription with error handling & expired cleanup.
   */
  public async sendPushToSubscription(
    subscription: StoredPushSubscription,
    payload: PushPayload
  ): Promise<PushSendResult> {
    const pushSubscription = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
    };

    // Sanitize and validate payload size
    const safePayload = this.preparePayload(payload);
    const jsonString = JSON.stringify(safePayload);

    if (!this.isConfigured) {
      return {
        success: false,
        subscriptionId: subscription.id,
        endpoint: subscription.endpoint,
        error: 'Push backend VAPID keys not configured on server.',
      };
    }

    try {
      const response = await webpush.sendNotification(pushSubscription, jsonString);

      // Record successful delivery timestamp
      const updated: StoredPushSubscription = {
        ...subscription,
        lastDeliveredAt: new Date().toISOString(),
      };
      this.subscriptions.set(subscription.id, updated);
      this.saveSubscriptionsToDisk();

      return {
        success: true,
        subscriptionId: subscription.id,
        endpoint: subscription.endpoint,
        statusCode: response.statusCode,
      };
    } catch (err: unknown) {
      const webPushErr = err as { statusCode?: number; message?: string };
      const statusCode = webPushErr.statusCode;

      // Handle 404 (Not Found) or 410 (Gone): Endpoint has expired or user revoked browser permission
      if (statusCode === 404 || statusCode === 410) {
        this.cleanupSubscription(subscription.id);
        return {
          success: false,
          subscriptionId: subscription.id,
          endpoint: subscription.endpoint,
          statusCode,
          error: `Subscription expired or removed by browser push service (HTTP ${statusCode}). Cleaned up safely.`,
          cleanedUp: true,
        };
      }

      return {
        success: false,
        subscriptionId: subscription.id,
        endpoint: subscription.endpoint,
        statusCode,
        error: webPushErr.message || 'Unknown Web Push delivery error',
        cleanedUp: false,
      };
    }
  }

  /**
   * Truncate and sanitize payload to satisfy Web Push limits (< 4096 bytes).
   */
  private preparePayload(payload: PushPayload): PushPayload {
    let body = payload.body || '';
    if (body.length > 500) {
      body = body.slice(0, 497) + '...';
    }

    return {
      id: payload.id || `push-${Date.now()}`,
      title: payload.title || 'OJIX TeamFlow',
      body,
      icon: payload.icon || '/vite.svg',
      badge: payload.badge || '/vite.svg',
      tag: payload.tag || 'teamflow-alert',
      url: payload.url || '/',
      type: payload.type,
      projectId: payload.projectId || null,
      projectName: payload.projectName || null,
      taskId: payload.taskId || null,
      taskTitle: payload.taskTitle || null,
      commentId: payload.commentId || null,
      conversationId: payload.conversationId || null,
      timestamp: payload.timestamp || Date.now(),
      requireInteraction: payload.requireInteraction !== false,
    };
  }
}

// Global server singleton instance
export const pushBackend = new PushBackend();
