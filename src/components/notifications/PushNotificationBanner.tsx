import React, { useEffect, useRef, useCallback } from 'react';
import { UserProfile } from '../../types/auth';
import { AppNotification } from '../../types/message';
import { notificationService } from '../../services/notificationService';
import { nativePushService } from '../../services/nativePushService';
import { webPushClient } from '../../services/webPushClient';
import { storageEngine } from '../../services/storageEngine';

interface PushNotificationBannerProps {
  currentUser: UserProfile | null;
  onNavigateToProject?: (projectId: string) => void;
  onNavigateToTask?: (projectId: string, taskId: string, commentId?: string | null) => void;
  onOpenMessages?: (conversationId?: string | null) => void;
  onOpenDeletionSummary?: (notif: AppNotification) => void;
}

/**
 * Background Push & Native Browser Notification Controller
 * Manages Service Worker VAPID sync and triggers native OS/browser desktop notifications
 * without showing in-website toast popups.
 */
export const PushNotificationBanner: React.FC<PushNotificationBannerProps> = ({
  currentUser,
  onNavigateToProject,
  onNavigateToTask,
  onOpenMessages,
  onOpenDeletionSummary,
}) => {
  const seenNotificationIdsRef = useRef<Set<string>>(new Set());
  const isInitializedRef = useRef<boolean>(false);

  const handleAction = useCallback(
    (notif: AppNotification) => {
      if (currentUser) {
        notificationService.markAsRead(notif.id, currentUser);
      }

      if (notif.type === 'PROJECT_DELETED') {
        onOpenDeletionSummary?.(notif);
      } else if (
        (notif.type === 'TASK_COMMENT_MENTION' ||
         notif.type === 'TASK_ASSIGNED' ||
         notif.type === 'TASK_REASSIGNED' ||
         Boolean(notif.taskId)) &&
        notif.projectId &&
        notif.taskId
      ) {
        onNavigateToTask?.(notif.projectId, notif.taskId, notif.commentId);
      } else if (
        (notif.type === 'PROJECT_ASSIGNED' ||
         notif.type === 'PROJECT_MEMBER_ADDED' ||
         notif.type === 'PROJECT_LEAD_CHANGED' ||
         notif.type === 'PROJECT_ROLE_CHANGED') &&
        notif.projectId
      ) {
        onNavigateToProject?.(notif.projectId);
      } else if (notif.type === 'DIRECT_MESSAGE_RECEIVED') {
        const convId = notif.conversationId || (notif.entityType === 'conversation' ? notif.entityId : undefined);
        onOpenMessages?.(convId);
      } else {
        onOpenMessages?.();
      }
    },
    [currentUser, onOpenDeletionSummary, onNavigateToTask, onNavigateToProject, onOpenMessages]
  );

  const triggerBrowserNotification = useCallback(
    (notif: AppNotification) => {
      // Trigger native browser / OS desktop push notification outside the web page
      nativePushService.triggerOSNotification(notif.title, {
        body: notif.body,
        tag: notif.id,
        data: {
          id: notif.id,
          type: notif.type,
          projectId: notif.projectId,
          taskId: notif.taskId,
          commentId: notif.commentId,
          conversationId: notif.conversationId,
        },
        onClick: () => handleAction(notif),
      });
    },
    [handleAction]
  );

  // Listen for service worker notification click messages & auto-sync VAPID push subscription
  useEffect(() => {
    nativePushService.registerServiceWorker();
    nativePushService.autoRequestPermissionOnInteraction();

    if (currentUser) {
      webPushClient.autoSyncSubscription(currentUser);
    }

    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const handleMessage = (event: MessageEvent) => {
        if (event.data?.type === 'NOTIFICATION_CLICKED' && event.data?.data) {
          const d = event.data.data;
          if (d.projectId && d.taskId) {
            onNavigateToTask?.(d.projectId, d.taskId, d.commentId);
          } else if (d.projectId) {
            onNavigateToProject?.(d.projectId);
          } else if (d.conversationId) {
            onOpenMessages?.(d.conversationId);
          }
        }

        // Live Web Push delivery event from Service Worker
        // The notification is already persisted in the backend and displayed natively by sw.js showNotification.
        // Do NOT re-add to storageEngine or re-trigger browser notification to prevent recursive loops.
        if (event.data?.type === 'PUSH_NOTIFICATION_RECEIVED' && event.data?.payload) {
          // Purely monitoring / state sync without duplicate creation
        }
      };

      navigator.serviceWorker.addEventListener('message', handleMessage);
      return () => {
        navigator.serviceWorker.removeEventListener('message', handleMessage);
      };
    }
  }, [currentUser, onNavigateToProject, onNavigateToTask, onOpenMessages, triggerBrowserNotification]);

  // Listen for storage engine updates to display native desktop push notifications outside browser for mentions
  useEffect(() => {
    if (typeof window === 'undefined' || !currentUser) return;

    const seenStorageNotifIds = new Set<string>();
    const allExisting = storageEngine.getAllNotificationsUnfiltered();
    allExisting.forEach(n => seenStorageNotifIds.add(n.id));

    const unsubscribe = storageEngine.subscribe(() => {
      if (Notification.permission !== 'granted' || !currentUser) return;
      const allCurrent = storageEngine.getAllNotificationsUnfiltered();
      for (const n of allCurrent) {
        if (!seenStorageNotifIds.has(n.id)) {
          seenStorageNotifIds.add(n.id);
          // Only trigger native browser notification if targeted to currentUser
          if (!n.isRead && n.recipientUserId === currentUser.uid && n.type === 'TASK_COMMENT_MENTION') {
            triggerBrowserNotification(n);
          }
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [currentUser, triggerBrowserNotification]);

  // Handle live incoming notifications
  useEffect(() => {
    if (!currentUser) {
      seenNotificationIdsRef.current.clear();
      isInitializedRef.current = false;
      return;
    }

    const initialNotifs = notificationService.getNotifications(currentUser);
    const now = Date.now();
    initialNotifs.forEach(n => {
      if (n.isRead || now - new Date(n.createdAt).getTime() > 5 * 60 * 1000) {
        seenNotificationIdsRef.current.add(n.id);
      }
    });
    isInitializedRef.current = true;

    // Trigger browser notification for fresh unread notifications on login / persona switch
    const recentUnread = initialNotifs.filter(
      n =>
        !n.isRead &&
        n.recipientUserId === currentUser.uid &&
        now - new Date(n.createdAt).getTime() <= 5 * 60 * 1000
    );
    recentUnread.forEach(n => {
      if (!seenNotificationIdsRef.current.has(n.id)) {
        seenNotificationIdsRef.current.add(n.id);
        triggerBrowserNotification(n);
      }
    });

    // Subscribe to live notifications
    const unsubscribe = notificationService.subscribe(currentUser, newNotifs => {
      if (!isInitializedRef.current) return;

      for (const n of newNotifs) {
        if (!seenNotificationIdsRef.current.has(n.id)) {
          seenNotificationIdsRef.current.add(n.id);
          if (!n.isRead && n.recipientUserId === currentUser.uid) {
            triggerBrowserNotification(n);
          }
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [currentUser, triggerBrowserNotification]);

  // No website HTML toast banner is rendered — native browser / OS notifications only
  return null;
};
