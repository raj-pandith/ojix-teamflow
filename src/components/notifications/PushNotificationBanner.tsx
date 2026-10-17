import React, { useState, useEffect, useRef, useCallback } from 'react';
import { UserProfile } from '../../types/auth';
import { AppNotification } from '../../types/message';
import { notificationService } from '../../services/notificationService';

import { nativePushService } from '../../services/nativePushService';

interface PushNotificationBannerProps {
  currentUser: UserProfile | null;
  onNavigateToProject?: (projectId: string) => void;
  onNavigateToTask?: (projectId: string, taskId: string, commentId?: string | null) => void;
  onOpenMessages?: (conversationId?: string | null) => void;
  onOpenDeletionSummary?: (notif: AppNotification) => void;
}

export const PushNotificationBanner: React.FC<PushNotificationBannerProps> = ({
  currentUser,
  onNavigateToProject,
  onNavigateToTask,
  onOpenMessages,
  onOpenDeletionSummary,
}) => {
  const [activeAlerts, setActiveAlerts] = useState<AppNotification[]>([]);
  const seenNotificationIdsRef = useRef<Set<string>>(new Set());
  const isInitializedRef = useRef<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const timerMapRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Listen for service worker notification click messages
  useEffect(() => {
    nativePushService.registerServiceWorker();

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
      };

      navigator.serviceWorker.addEventListener('message', handleMessage);
      return () => {
        navigator.serviceWorker.removeEventListener('message', handleMessage);
      };
    }
  }, [onNavigateToProject, onNavigateToTask, onOpenMessages]);

  const dismissAlert = useCallback((id: string) => {
    setActiveAlerts(prev => prev.filter(a => a.id !== id));
    const timer = timerMapRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timerMapRef.current.delete(id);
    }
  }, []);

  const triggerPush = useCallback(
    (notif: AppNotification) => {
      // 1. Add to on-screen floating banner list (stack up to 3)
      setActiveAlerts(prev => [notif, ...prev.filter(a => a.id !== notif.id)].slice(0, 3));

      // 2. Trigger Outside-the-browser Native OS Desktop Push Notification
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

      // 3. Auto dismiss after 8 seconds
      const timer = setTimeout(() => {
        dismissAlert(notif.id);
      }, 8000);
      timerMapRef.current.set(notif.id, timer);
    },
    [dismissAlert]
  );

  useEffect(() => {
    if (!currentUser) {
      setActiveAlerts([]);
      seenNotificationIdsRef.current.clear();
      isInitializedRef.current = false;
      return;
    }

    // Initial load: populate seen IDs so we don't spam toasts on first login
    const initialNotifs = notificationService.getNotifications(currentUser);
    initialNotifs.forEach(n => seenNotificationIdsRef.current.add(n.id));
    isInitializedRef.current = true;

    // Subscribe to live notifications
    const unsubscribe = notificationService.subscribe(currentUser, newNotifs => {
      if (!isInitializedRef.current) return;

      for (const n of newNotifs) {
        if (!seenNotificationIdsRef.current.has(n.id)) {
          seenNotificationIdsRef.current.add(n.id);
          // Only pop up if unread and for this recipient
          if (!n.isRead && n.recipientUserId === currentUser.uid) {
            triggerPush(n);
          }
        }
      }
    });

    return () => {
      unsubscribe();
      timerMapRef.current.forEach(timer => clearTimeout(timer));
      timerMapRef.current.clear();
    };
  }, [currentUser, triggerPush]);

  const handleAction = (notif: AppNotification) => {
    if (currentUser) {
      notificationService.markAsRead(notif.id, currentUser);
    }
    dismissAlert(notif.id);

    if (notif.type === 'PROJECT_DELETED') {
      onOpenDeletionSummary?.(notif);
    } else if (notif.type === 'TASK_COMMENT_MENTION' && notif.projectId && notif.taskId) {
      onNavigateToTask?.(notif.projectId, notif.taskId, notif.commentId);
    } else if (
      (notif.type === 'PROJECT_ASSIGNED' || notif.type === 'PROJECT_MEMBER_ADDED') &&
      notif.projectId
    ) {
      onNavigateToProject?.(notif.projectId);
    } else if (notif.type === 'DIRECT_MESSAGE_RECEIVED') {
      onOpenMessages?.(notif.conversationId);
    } else {
      onOpenMessages?.();
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'PROJECT_DELETED':
        return '🗑️';
      case 'PROJECT_ASSIGNED':
        return '👑';
      case 'PROJECT_MEMBER_ADDED':
        return '👥';
      case 'PROJECT_MEMBER_REMOVED':
        return '🚪';
      case 'TASK_COMMENT_MENTION':
        return '💬';
      case 'USER_BLOCKED':
        return '🚫';
      case 'DIRECT_MESSAGE_RECEIVED':
        return '✉️';
      default:
        return '🔔';
    }
  };

  const getActionLabel = (notif: AppNotification) => {
    switch (notif.type) {
      case 'TASK_COMMENT_MENTION':
        return 'View Comment ➔';
      case 'DIRECT_MESSAGE_RECEIVED':
        return 'Reply in Chat ➔';
      case 'PROJECT_DELETED':
        return 'View Summary ➔';
      case 'PROJECT_ASSIGNED':
      case 'PROJECT_MEMBER_ADDED':
        return 'Open Project ➔';
      case 'USER_BLOCKED':
        return 'Account Notice ➔';
      default:
        return 'View in Inbox ➔';
    }
  };

  if (activeAlerts.length === 0) return null;

  return (
    <div
      className="on-screen-push-container"
      style={{
        position: 'fixed',
        top: '20px',
        right: '24px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        pointerEvents: 'none',
      }}
      aria-live="assertive"
    >
      {activeAlerts.map(notif => {
        const icon = getIcon(notif.type);
        const actionLabel = getActionLabel(notif);

        return (
          <div
            key={notif.id}
            className="push-notification-banner animate-slide-in-right"
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
            style={{
              pointerEvents: 'auto',
              width: '380px',
              maxWidth: 'calc(100vw - 32px)',
              background: 'rgba(22, 27, 34, 0.96)',
              backdropFilter: 'blur(12px)',
              border: '1px solid var(--accent-primary, #6366f1)',
              borderRadius: '10px',
              boxShadow:
                '0 12px 32px rgba(0, 0, 0, 0.6), 0 0 16px rgba(99, 102, 241, 0.35)',
              padding: '14px 16px',
              position: 'relative',
              overflow: 'hidden',
              cursor: 'pointer',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            }}
            onClick={() => handleAction(notif)}
          >
            {/* Header / Source */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '6px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '28px',
                    height: '28px',
                    borderRadius: '6px',
                    background: 'rgba(99, 102, 241, 0.2)',
                    fontSize: '16px',
                  }}
                >
                  {icon}
                </span>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.6px',
                    color: 'var(--accent-primary-light, #818cf8)',
                  }}
                >
                  PUSH NOTIFICATION
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted, #8b949e)' }}>
                  Just now
                </span>
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    dismissAlert(notif.id);
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted, #8b949e)',
                    cursor: 'pointer',
                    fontSize: '14px',
                    padding: '2px 6px',
                    borderRadius: '4px',
                  }}
                  title="Dismiss notification"
                  aria-label="Dismiss notification"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Title & Body */}
            <div style={{ marginBottom: '8px' }}>
              <div
                style={{
                  fontSize: '13.5px',
                  fontWeight: 700,
                  color: 'var(--text-primary, #f0f6fc)',
                  lineHeight: 1.3,
                  marginBottom: '3px',
                }}
              >
                {notif.title}
              </div>
              <div
                style={{
                  fontSize: '12.5px',
                  color: 'var(--text-secondary, #8b949e)',
                  lineHeight: 1.45,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {notif.body}
              </div>
            </div>

            {/* Context Meta Pills & Action */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                marginTop: '10px',
                paddingTop: '8px',
                borderTop: '1px solid rgba(255, 255, 255, 0.06)',
              }}
            >
              <div style={{ display: 'flex', gap: '6px', overflow: 'hidden' }}>
                {notif.projectName && (
                  <span
                    style={{
                      fontSize: '10.5px',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background: 'rgba(56, 189, 248, 0.15)',
                      color: 'var(--status-in-progress, #38bdf8)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: '140px',
                    }}
                  >
                    📁 {notif.projectName}
                  </span>
                )}
                {notif.taskTitle && (
                  <span
                    style={{
                      fontSize: '10.5px',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background: 'rgba(168, 85, 247, 0.15)',
                      color: '#c084fc',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: '140px',
                    }}
                  >
                    📋 {notif.taskTitle}
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  handleAction(notif);
                }}
                style={{
                  background: 'var(--accent-primary, #6366f1)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '5px',
                  padding: '4px 10px',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  boxShadow: '0 2px 6px rgba(99, 102, 241, 0.4)',
                }}
              >
                {actionLabel}
              </button>
            </div>

            {/* Auto-dismiss shrinking progress bar */}
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                height: '3px',
                background: 'var(--accent-primary, #6366f1)',
                width: '100%',
                animation: isPaused ? 'none' : 'shrink-progress 8s linear forwards',
              }}
            />
          </div>
        );
      })}
    </div>
  );
};
