/**
 * Types and interfaces for Native Web Push (VAPID) Notifications in OJIX TeamFlow
 */

export interface PushSubscriptionKeys {
  readonly p256dh: string;
  readonly auth: string;
}

export interface StoredPushSubscription {
  readonly id: string;
  readonly userId: string;
  readonly endpoint: string;
  readonly keys: PushSubscriptionKeys;
  readonly userAgent?: string;
  readonly deviceLabel?: string;
  readonly createdAt: string;
  readonly lastDeliveredAt?: string | null;
  readonly isActive: boolean;
}

export interface PushPayload {
  readonly id?: string;
  readonly title: string;
  readonly body: string;
  readonly icon?: string;
  readonly badge?: string;
  readonly tag?: string;
  readonly url?: string;
  readonly type?: string;
  readonly projectId?: string | null;
  readonly projectName?: string | null;
  readonly taskId?: string | null;
  readonly taskTitle?: string | null;
  readonly commentId?: string | null;
  readonly conversationId?: string | null;
  readonly timestamp?: number;
  readonly requireInteraction?: boolean;
}

export interface PushSendResult {
  readonly success: boolean;
  readonly subscriptionId: string;
  readonly endpoint: string;
  readonly statusCode?: number;
  readonly error?: string;
  readonly cleanedUp?: boolean;
}

export interface WebPushConfig {
  readonly publicKey: string;
  readonly isSupported: boolean;
  readonly permission: NotificationPermission;
  readonly isSubscribed: boolean;
  readonly activeSubscriptionCount: number;
}
