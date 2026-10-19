import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Bell,
  MessageSquare,
  Send,
  Inbox,
  Check,
  CheckCheck,
  Radio,
  Zap,
  User,
  FolderKanban,
  ListTodo,
  Trash2,
  Users,
  UserMinus,
  Ban,
  AlertTriangle,
  Crown,
  Mail,
  Eye,
  CheckCircle2,
  RotateCcw,
  ArrowRight,
  UserCheck,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useMessages } from '../../hooks/useMessages';
import { AppNotification, DirectConversation, DirectMessage } from '../../types/message';
import { storageEngine } from '../../services/storageEngine';
import { Button } from '../../components/common/Button';
import { Pagination } from '../../components/common/Pagination';
import { formatDisplayDate } from '../../domain/timezone';
import { ProjectDeletionSummaryModal } from './ProjectDeletionSummaryModal';
import { DirectMessageModal } from './DirectMessageModal';
import { WebPushSettingsModal } from './WebPushSettingsModal';
import { nativePushService } from '../../services/nativePushService';
import { webPushClient } from '../../services/webPushClient';

export type MessageFilterTab = 'all' | 'unread' | 'notifications' | 'direct_messages' | 'sent';

interface MessageCenterViewProps {
  onNavigateToProject?: (projectId: string) => void;
  onNavigateToTask?: (projectId: string, taskId: string, commentId?: string | null) => void;
  initialTab?: MessageFilterTab;
  initialConversationId?: string | null;
  onConversationChange?: (conversationId: string | null) => void;
  onTabChange?: (tab: MessageFilterTab) => void;
}

const renderFormattedMessageContent = (msg: DirectMessage, isMine: boolean) => {
  const isApproved = Boolean(
    msg.subject?.toLowerCase().includes('task approved') ||
    msg.body.toLowerCase().includes('approved by reviewer') ||
    msg.body.toLowerCase().includes('in review ➔ done')
  );

  const isChangesRequested = Boolean(
    msg.subject?.toLowerCase().includes('changes requested') ||
    msg.body.toLowerCase().includes('requested changes on your task')
  );

  if (isApproved) {
    const taskMatch = msg.body.match(/task ["']([^"']+)["']/i);
    const projMatch = msg.body.match(/project ["']([^"']+)["']/i);
    const reviewerMatch = msg.body.match(/reviewer\s+([^.\n]+)/i);

    const taskTitle = taskMatch ? taskMatch[1] : (msg.subject ? msg.subject.replace(/^Task Approved & Completed:\s*/i, '') : 'Task');
    const projectName = projMatch ? projMatch[1] : null;
    const reviewerName = reviewerMatch ? reviewerMatch[1].trim() : msg.senderDisplayName;

    return (
      <div style={{ minWidth: '260px', maxWidth: '480px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', paddingBottom: '8px', borderBottom: isMine ? '1px solid rgba(255,255,255,0.2)' : '1px solid #e2e8f0', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <CheckCircle2 size={16} style={{ color: isMine ? '#86efac' : '#10b981', flexShrink: 0 }} />
            <strong style={{ fontSize: '13px', fontWeight: 700 }}>Task Approved & Completed</strong>
          </div>
          <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '12px', background: isMine ? 'rgba(255,255,255,0.2)' : '#dcfce7', color: isMine ? '#ffffff' : '#166534' }}>
            Done
          </span>
        </div>

        <div style={{ fontSize: '12.5px', marginBottom: '8px', opacity: isMine ? 0.95 : 0.85, display: 'flex', alignItems: 'center', gap: '6px' }}>
          <UserCheck size={13} style={{ color: isMine ? '#86efac' : '#10b981', flexShrink: 0 }} />
          <span>Task <strong>"{taskTitle}"</strong> approved by reviewer <strong>{reviewerName}</strong></span>
        </div>

        {projectName && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', opacity: isMine ? 0.9 : 0.75, marginBottom: '8px' }}>
            <FolderKanban size={13} />
            <span>Project: <strong>{projectName}</strong></span>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', background: isMine ? 'rgba(0,0,0,0.15)' : '#f8fafc', padding: '6px 10px', borderRadius: '6px', border: isMine ? '1px solid rgba(255,255,255,0.15)' : '1px solid #e2e8f0' }}>
          <span style={{ opacity: 0.8 }}>Stage / State:</span>
          <span style={{ textDecoration: 'line-through', opacity: 0.7 }}>In Review</span>
          <ArrowRight size={11} />
          <strong style={{ color: isMine ? '#86efac' : '#10b981' }}>Done (Completed)</strong>
        </div>
      </div>
    );
  }

  if (isChangesRequested) {
    const taskMatch = msg.body.match(/task ["']([^"']+)["']/i);
    const projMatch = msg.body.match(/project ["']([^"']+)["']/i);
    const reviewerMatch = msg.body.match(/reviewer\s+([^.\n]+)/i);
    const feedbackMatch = msg.body.match(/Feedback:\s*["']?([^"'\n]+(?:[\r\n]+[^"'\n]+)*?)["']?(?:\s*Please address|\n\nPlease|\nNext Steps|$)/i);

    const taskTitle = taskMatch ? taskMatch[1] : (msg.subject ? msg.subject.replace(/^Changes Requested:\s*/i, '') : 'Task');
    const projectName = projMatch ? projMatch[1] : null;
    const reviewerName = reviewerMatch ? reviewerMatch[1].trim() : msg.senderDisplayName;
    const feedbackText = feedbackMatch ? feedbackMatch[1].trim() : null;

    return (
      <div style={{ minWidth: '260px', maxWidth: '480px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', paddingBottom: '8px', borderBottom: isMine ? '1px solid rgba(255,255,255,0.2)' : '1px solid #fed7aa', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <RotateCcw size={16} style={{ color: isMine ? '#fed7aa' : '#ea580c', flexShrink: 0 }} />
            <strong style={{ fontSize: '13px', fontWeight: 700 }}>Changes Requested</strong>
          </div>
          <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '12px', background: isMine ? 'rgba(255,255,255,0.2)' : '#ffedd5', color: isMine ? '#ffffff' : '#9a3412' }}>
            In Progress
          </span>
        </div>

        <div style={{ fontSize: '12.5px', marginBottom: '8px', opacity: isMine ? 0.95 : 0.85, display: 'flex', alignItems: 'center', gap: '6px' }}>
          <UserCheck size={13} style={{ color: isMine ? '#fed7aa' : '#ea580c', flexShrink: 0 }} />
          <span>Reviewer <strong>{reviewerName}</strong> requested revisions on <strong>"{taskTitle}"</strong></span>
        </div>

        {projectName && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', opacity: isMine ? 0.9 : 0.75, marginBottom: '8px' }}>
            <FolderKanban size={13} />
            <span>Project: <strong>{projectName}</strong></span>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', background: isMine ? 'rgba(0,0,0,0.15)' : '#fff7ed', padding: '6px 10px', borderRadius: '6px', border: isMine ? '1px solid rgba(255,255,255,0.15)' : '1px solid #fed7aa', marginBottom: '8px' }}>
          <span style={{ opacity: 0.8 }}>Stage / State:</span>
          <span>In Review</span>
          <ArrowRight size={11} />
          <strong style={{ color: isMine ? '#fed7aa' : '#ea580c' }}>In Progress (Changes Requested)</strong>
        </div>

        {feedbackText && (
          <div style={{ background: isMine ? 'rgba(0,0,0,0.2)' : '#fffbeb', borderLeft: isMine ? '3px solid #fed7aa' : '3px solid #f59e0b', padding: '8px 10px', borderRadius: '4px', fontSize: '12px', marginBottom: '8px' }}>
            <div style={{ fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', color: isMine ? '#fed7aa' : '#b45309', marginBottom: '3px' }}>
              Reviewer Feedback:
            </div>
            <div style={{ fontStyle: 'italic', color: isMine ? '#ffffff' : '#78350f', whiteSpace: 'pre-wrap' }}>
              "{feedbackText}"
            </div>
          </div>
        )}

        <div style={{ fontSize: '11px', opacity: isMine ? 0.85 : 0.7 }}>
          Please address the requested changes and submit for re-review.
        </div>
      </div>
    );
  }

  return (
    <div>
      {msg.subject && (
        <div style={{ fontWeight: 700, marginBottom: '6px', fontSize: '13px', color: isMine ? 'rgba(255, 255, 255, 0.95)' : '#0f172a' }}>
          {msg.subject}
        </div>
      )}
      <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>
        {msg.body}
      </div>
    </div>
  );
};

export const MessageCenterView: React.FC<MessageCenterViewProps> = ({
  onNavigateToProject,
  onNavigateToTask,
  initialTab,
  initialConversationId,
  onConversationChange,
  onTabChange,
}) => {
  const { currentUser } = useAuth();
  const {
    notifications,
    conversations,
    unreadNotifsCount,
    unreadDMsCount,
    totalUnreadCount,
    markNotificationRead,
    markAllNotificationsRead,
    sendDirectMessage,
    markConversationRead,
    getConversationMessages,
    fetchConversationMessages,
  } = useMessages();

  const [activeTab, setActiveTabState] = useState<MessageFilterTab>(initialTab || 'all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedConversationId, setSelectedConversationIdState] = useState<string | null>(initialConversationId || null);
  const [replyText, setReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [isNewDmOpen, setIsNewDmOpen] = useState(false);
  const [isWebPushModalOpen, setIsWebPushModalOpen] = useState(false);
  const [deletionNoticeModalItem, setDeletionNoticeModalItem] = useState<AppNotification | null>(null);
  const [activeBlockedNotice, setActiveBlockedNotice] = useState<AppNotification | null>(null);
  const [desktopPermission, setDesktopPermission] = useState<NotificationPermission>(() =>
    nativePushService.getPermission()
  );

  // Pagination states
  const [notifPage, setNotifPage] = useState(1);
  const [notifPageSize, setNotifPageSize] = useState(10);
  const [sentPage, setSentPage] = useState(1);
  const [sentPageSize, setSentPageSize] = useState(10);
  const [chatPage, setChatPage] = useState(1);
  const [chatPageSize, setChatPageSize] = useState(20);
  const [chatPagination, setChatPagination] = useState<{
    total: number;
    totalPages: number;
    hasMore: boolean;
    isLoading: boolean;
  }>({ total: 0, totalPages: 1, hasMore: false, isLoading: false });

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const setActiveTab = (tab: MessageFilterTab) => {
    setActiveTabState(tab);
    onTabChange?.(tab);
  };

  const setSelectedConversationId = (id: string | null) => {
    setSelectedConversationIdState(id);
    onConversationChange?.(id);
  };

  const workspaceUsers = useMemo(() => storageEngine.getUsers(), []);

  // Sync with initial props when navigated from outside (e.g. notification click)
  useEffect(() => {
    if (initialTab) {
      setActiveTabState(initialTab);
    }
  }, [initialTab]);

  useEffect(() => {
    if (initialConversationId) {
      setSelectedConversationIdState(initialConversationId);
      setActiveTabState('direct_messages');
    }
  }, [initialConversationId]);

  // Sync selected conversation when opening direct messages
  useEffect(() => {
    if (activeTab === 'direct_messages' && !selectedConversationId && conversations.length > 0) {
      setSelectedConversationId(conversations[0].id);
    }
  }, [activeTab, selectedConversationId, conversations]);

  // Reset pagination when tabs or searches change
  useEffect(() => {
    setNotifPage(1);
    setSentPage(1);
  }, [activeTab, searchQuery]);

  // Reset chat page when conversation changes
  useEffect(() => {
    setChatPage(1);
  }, [selectedConversationId]);

  // Fetch only the requested set of conversation messages from backend
  const loadConversationPage = useCallback(
    async (convId: string, pageToLoad: number, pageSizeToLoad: number) => {
      if (!convId || !currentUser) return;
      setChatPagination(prev => ({ ...prev, isLoading: true }));
      try {
        const res = await fetchConversationMessages(convId, pageToLoad, pageSizeToLoad);
        setChatPagination({
          total: res.total,
          totalPages: res.totalPages,
          hasMore: res.hasMore,
          isLoading: false,
        });
      } catch {
        setChatPagination(prev => ({ ...prev, isLoading: false }));
      }
    },
    [currentUser, fetchConversationMessages]
  );

  // Mark conversation read and fetch only the page of history from server when selected
  useEffect(() => {
    if (selectedConversationId && currentUser) {
      markConversationRead(selectedConversationId);
      loadConversationPage(selectedConversationId, chatPage, chatPageSize);
    }
  }, [selectedConversationId, chatPage, chatPageSize, currentUser, markConversationRead, loadConversationPage]);

  // Messages in active conversation (with fallback synthesis so chat pane always opens)
  const activeConversation = useMemo<DirectConversation | null>(() => {
    if (!selectedConversationId) return null;
    const found = conversations.find(c => c.id === selectedConversationId);
    if (found) return found;

    // Fallback: Synthesize conversation from conversationId
    if (currentUser && selectedConversationId.startsWith('conv-')) {
      const other = workspaceUsers.find(
        u => u.uid !== currentUser.uid && selectedConversationId.includes(u.uid)
      );
      if (other) {
        const msgs = getConversationMessages(selectedConversationId);
        const lastMsg: DirectMessage = msgs[msgs.length - 1] || {
          id: 'placeholder',
          conversationId: selectedConversationId,
          senderId: currentUser.uid,
          senderDisplayName: currentUser.displayName,
          recipientId: other.uid,
          recipientDisplayName: other.displayName,
          body: '',
          isRead: true,
          createdAt: new Date().toISOString(),
        };
        return {
          id: selectedConversationId,
          participantIds: [currentUser.uid, other.uid].sort() as unknown as [string, string],
          otherUser: other,
          lastMessage: lastMsg,
          unreadCount: 0,
          updatedAt: lastMsg.createdAt,
        };
      }
    }
    return null;
  }, [conversations, selectedConversationId, currentUser, workspaceUsers, getConversationMessages]);

  const allConversationMessages = useMemo(() => {
    if (!selectedConversationId) return [];
    return getConversationMessages(selectedConversationId);
  }, [selectedConversationId, getConversationMessages, conversations]);

  const conversationMessages = useMemo(() => {
    if (!selectedConversationId) return [];
    const all = allConversationMessages;
    if (all.length <= chatPageSize && chatPagination.total <= chatPageSize) return all;
    const startIndex = (chatPage - 1) * chatPageSize;
    return all.slice(startIndex, startIndex + chatPageSize);
  }, [selectedConversationId, allConversationMessages, chatPage, chatPageSize, chatPagination.total]);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversationMessages.length, selectedConversationId]);

  // Sent DMs by current user
  const sentMessages = useMemo(() => {
    if (!currentUser) return [];
    const all = storageEngine.getDirectMessages(currentUser);
    return all.filter(m => m.senderId === currentUser.uid);
  }, [currentUser, conversations]);

  // Filtered notifications list
  const filteredNotifications = useMemo(() => {
    let list = [...notifications];

    if (activeTab === 'unread') {
      list = list.filter(n => !n.isRead);
    } else if (activeTab === 'notifications') {
      list = list.filter(n => n.type !== 'DIRECT_MESSAGE_RECEIVED');
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        n =>
          n.title.toLowerCase().includes(q) ||
          n.body.toLowerCase().includes(q) ||
          (n.actorDisplayName && n.actorDisplayName.toLowerCase().includes(q)) ||
          (n.projectName && n.projectName.toLowerCase().includes(q)) ||
          (n.taskTitle && n.taskTitle.toLowerCase().includes(q))
      );
    }

    return list;
  }, [notifications, activeTab, searchQuery]);

  // Paginated notifications slice
  const paginatedNotifications = useMemo(() => {
    const startIndex = (notifPage - 1) * notifPageSize;
    return filteredNotifications.slice(startIndex, startIndex + notifPageSize);
  }, [filteredNotifications, notifPage, notifPageSize]);

  // Filtered Sent DMs
  const filteredSentMessages = useMemo(() => {
    if (!searchQuery.trim()) return sentMessages;
    const q = searchQuery.toLowerCase();
    return sentMessages.filter(
      m =>
        m.recipientDisplayName.toLowerCase().includes(q) ||
        (m.subject && m.subject.toLowerCase().includes(q)) ||
        m.body.toLowerCase().includes(q)
    );
  }, [sentMessages, searchQuery]);

  // Paginated Sent DMs slice
  const paginatedSentMessages = useMemo(() => {
    const startIndex = (sentPage - 1) * sentPageSize;
    return filteredSentMessages.slice(startIndex, startIndex + sentPageSize);
  }, [filteredSentMessages, sentPage, sentPageSize]);

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !activeConversation || !currentUser) return;
    setIsSendingReply(true);
    try {
      await sendDirectMessage({
        recipientId: activeConversation.otherUser.uid,
        body: replyText.trim(),
      });
      setReplyText('');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to send reply.');
    } finally {
      setIsSendingReply(false);
    }
  };

  const handleNotificationTitleClick = (notif: AppNotification) => {
    const isTaskEvent =
      notif.type === 'TASK_COMMENT_MENTION' ||
      notif.type === 'TASK_ASSIGNED' ||
      notif.type === 'TASK_REASSIGNED' ||
      Boolean(notif.taskId) ||
      notif.entityType === 'task' ||
      notif.entityType === 'comment';

    if (notif.type === 'DIRECT_MESSAGE_RECEIVED') {
      markNotificationRead(notif.id);
      setActiveTab('direct_messages');
      const convId = notif.conversationId || (notif.entityType === 'conversation' ? notif.entityId : null);
      if (convId) {
        setSelectedConversationId(convId);
      } else if (currentUser && notif.actorUserId) {
        const actorId = notif.actorUserId;
        const found = conversations.find(c =>
          c.participantIds.includes(actorId) && c.participantIds.includes(currentUser.uid)
        );
        if (found) {
          setSelectedConversationId(found.id);
        } else {
          const derived = `conv-${[currentUser.uid, actorId].sort().join('-')}`;
          setSelectedConversationId(derived);
        }
      }
    } else if (isTaskEvent) {
      markNotificationRead(notif.id);
      const taskId = notif.taskId || (notif.entityType === 'task' ? notif.entityId : null);
      let projectId = notif.projectId;
      if (!projectId && taskId && currentUser) {
        const allTasks = storageEngine.getAllAccessibleTasks(currentUser);
        const match = allTasks.find(t => t.id === taskId);
        if (match) {
          projectId = match.projectId;
        }
      }
      if (projectId && taskId) {
        onNavigateToTask?.(projectId, taskId, notif.commentId);
      } else if (projectId) {
        onNavigateToProject?.(projectId);
      }
    } else if (
      (notif.type === 'PROJECT_ASSIGNED' ||
       notif.type === 'PROJECT_MEMBER_ADDED' ||
       notif.type === 'PROJECT_LEAD_CHANGED' ||
       notif.type === 'PROJECT_ROLE_CHANGED') &&
      notif.projectId
    ) {
      markNotificationRead(notif.id);
      onNavigateToProject?.(notif.projectId);
    } else if (notif.type === 'PROJECT_DELETED') {
      setDeletionNoticeModalItem(notif);
    } else if (notif.type === 'USER_BLOCKED') {
      setActiveBlockedNotice(notif);
    }
  };

  const getNotificationIcon = (type: string): React.ReactNode => {
    switch (type) {
      case 'PROJECT_DELETED':
        return <Trash2 size={16} style={{ color: 'var(--status-overdue, #ef4444)' }} />;
      case 'PROJECT_ASSIGNED':
        return <Crown size={16} style={{ color: 'var(--accent-primary, #C9662F)' }} />;
      case 'PROJECT_MEMBER_ADDED':
        return <Users size={16} style={{ color: 'var(--status-done, #10b981)' }} />;
      case 'PROJECT_MEMBER_REMOVED':
        return <UserMinus size={16} style={{ color: 'var(--status-blocked, #f59e0b)' }} />;
      case 'TASK_COMMENT_MENTION':
        return <MessageSquare size={16} style={{ color: 'var(--accent-primary, #C9662F)' }} />;
      case 'TASK_ASSIGNED':
      case 'TASK_REASSIGNED':
        return <ListTodo size={16} style={{ color: 'var(--accent-primary, #C9662F)' }} />;
      case 'TASK_REVIEW_REQUESTED':
        return <Eye size={16} style={{ color: 'var(--status-in-review, #38bdf8)' }} />;
      case 'TASK_REVIEW_APPROVED':
        return <CheckCheck size={16} style={{ color: 'var(--status-done, #10b981)' }} />;
      case 'TASK_CHANGES_REQUESTED':
        return <AlertTriangle size={16} style={{ color: 'var(--status-blocked, #f59e0b)' }} />;
      case 'TASK_BLOCKED':
        return <AlertTriangle size={16} style={{ color: 'var(--status-overdue, #ef4444)' }} />;
      case 'USER_BLOCKED':
        return <Ban size={16} style={{ color: 'var(--status-overdue, #ef4444)' }} />;
      case 'DIRECT_MESSAGE_RECEIVED':
        return <Mail size={16} style={{ color: 'var(--accent-primary, #C9662F)' }} />;
      default:
        return <Bell size={16} style={{ color: 'var(--accent-primary, #C9662F)' }} />;
    }
  };

  const isBlocked = currentUser?.status === 'blocked';

  return (
    <div className="message-center-view" style={{ padding: '24px', maxWidth: '1280px', margin: '0 auto' }}>
      {/* Blocked User Status Banner */}
      {isBlocked && (
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid var(--status-blocked, #ef4444)',
            borderRadius: '10px',
            padding: '16px 20px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
          }}
        >
          <span style={{ fontSize: '32px' }}>🚫</span>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--status-blocked, #ef4444)' }}>
              Account Access Restricted
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary, #8b949e)' }}>
              Your workspace account has been blocked by an administrator. You can no longer modify projects,
              receive new assignments, or send messages. Contact your workspace administrator for assistance.
            </p>
          </div>
        </div>
      )}

      {/* Header & Controls */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '16px',
          marginBottom: '20px',
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: 'var(--text-primary, #f0f6fc)' }}>
            Message Center
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '14px', color: 'var(--text-secondary, #8b949e)' }}>
            Personal notifications, project assignments & direct conversations
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {desktopPermission !== 'granted' ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                const res = await nativePushService.requestPermission();
                setDesktopPermission(res);
                if (res === 'granted' && currentUser) {
                  await webPushClient.subscribeUser(currentUser);
                  await webPushClient.autoSyncSubscription(currentUser);
                }
              }}
              id="enable-desktop-push-btn"
              title="Enable native alerts outside the browser on your desktop"
              style={{
                border: '1px solid var(--accent-primary)',
                color: 'var(--accent-primary)',
                background: 'rgba(201, 102, 47, 0.08)',
              }}
            >
              <Bell size={14} style={{ marginRight: 6 }} /> Enable Desktop OS Alerts
            </Button>
          ) : (
            <span
              style={{
                fontSize: '12px',
                padding: '4px 8px',
                borderRadius: '6px',
                background: 'rgba(34, 197, 94, 0.12)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                color: 'var(--status-done, #22c55e)',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
              title="Desktop push alerts outside the browser are active"
            >
              <Check size={14} /> Desktop Push Active
            </span>
          )}

          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              if (!currentUser) return;
              if (desktopPermission !== 'granted') {
                const p = await nativePushService.requestPermission();
                setDesktopPermission(p);
              }
              await webPushClient.autoSyncSubscription(currentUser);
              // Dispatch an on-screen push alert and native OS notification
              storageEngine.addNotification({
                id: `notif-sample-${Date.now().toString(36)}`,
                recipientUserId: currentUser.uid,
                actorUserId: 'u-lead-test',
                actorDisplayName: 'Marcus Lead',
                type: 'TASK_COMMENT_MENTION',
                title: 'You were mentioned in a task comment',
                body: `Marcus Lead: "@${currentUser.email.split('@')[0]} can you verify the latest changes?"`,
                entityType: 'comment',
                entityId: 'sample-comment',
                projectId: 'proj-infra-01',
                projectName: 'Q4 Cloud Infrastructure & Telemetry',
                taskId: 'task-auth-01',
                taskTitle: 'Legacy auth token deprecation',
                isRead: false,
                createdAt: new Date().toISOString(),
              });
            }}
            id="trigger-sample-push-btn"
            title="Display a live on-screen push notification alert"
          >
            <Zap size={14} style={{ marginRight: 6 }} /> Test Push Alert
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsWebPushModalOpen(true)}
            id="web-push-settings-btn"
            title="Manage browser Web Push subscriptions, VAPID registration, and devices"
          >
            <Radio size={14} style={{ marginRight: 6 }} /> Web Push Settings
          </Button>

          {totalUnreadCount > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={markAllNotificationsRead}
              id="mark-all-read-btn"
              title="Mark all notifications and messages as read"
            >
              <CheckCheck size={14} style={{ marginRight: 6 }} /> Mark All Read
            </Button>
          )}
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsNewDmOpen(true)}
            disabled={isBlocked}
            id="new-dm-btn"
            title={isBlocked ? 'Blocked accounts cannot send messages' : 'Send a direct message'}
          >
            <Mail size={14} style={{ marginRight: 6 }} /> New Message
          </Button>
        </div>
      </div>

      {/* Tabs and Search Bar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
          borderBottom: '1px solid #e2e8f0',
          paddingBottom: '12px',
          marginBottom: '20px',
        }}
      >
        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            className={`tab-btn ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => setActiveTab('all')}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: activeTab === 'all' ? '1px solid #c7d2fe' : '1px solid #e2e8f0',
              background: activeTab === 'all' ? '#e0e7ff' : '#ffffff',
              color: activeTab === 'all' ? '#4338ca' : '#64748b',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: activeTab === 'all' ? '0 1px 3px rgba(67, 56, 202, 0.15)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            All
            <span
              style={{
                fontSize: '11px',
                padding: '2px 7px',
                borderRadius: '10px',
                background: activeTab === 'all' ? '#c7d2fe' : '#f1f5f9',
                color: activeTab === 'all' ? '#3730a3' : '#64748b',
                fontWeight: 700,
              }}
            >
              {notifications.length}
            </span>
          </button>

          <button
            className={`tab-btn ${activeTab === 'unread' ? 'active' : ''}`}
            onClick={() => setActiveTab('unread')}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: activeTab === 'unread' ? '1px solid #c7d2fe' : '1px solid #e2e8f0',
              background: activeTab === 'unread' ? '#e0e7ff' : '#ffffff',
              color: activeTab === 'unread' ? '#4338ca' : '#64748b',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: activeTab === 'unread' ? '0 1px 3px rgba(67, 56, 202, 0.15)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            Unread
            {unreadNotifsCount > 0 && (
              <span
                style={{
                  fontSize: '11px',
                  padding: '2px 7px',
                  borderRadius: '10px',
                  background: '#4f46e5',
                  color: '#fff',
                  fontWeight: 700,
                }}
              >
                {unreadNotifsCount}
              </span>
            )}
          </button>

          <button
            className={`tab-btn ${activeTab === 'notifications' ? 'active' : ''}`}
            onClick={() => setActiveTab('notifications')}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: activeTab === 'notifications' ? '1px solid var(--accent-primary)' : '1px solid #e2e8f0',
              background: activeTab === 'notifications' ? 'rgba(201, 102, 47, 0.1)' : '#ffffff',
              color: activeTab === 'notifications' ? 'var(--accent-primary)' : '#64748b',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: activeTab === 'notifications' ? '0 1px 3px rgba(201, 102, 47, 0.15)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            <Bell size={14} /> Notifications
          </button>

          <button
            className={`tab-btn ${activeTab === 'direct_messages' ? 'active' : ''}`}
            onClick={() => setActiveTab('direct_messages')}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: activeTab === 'direct_messages' ? '1px solid var(--accent-primary)' : '1px solid #e2e8f0',
              background: activeTab === 'direct_messages' ? 'rgba(201, 102, 47, 0.1)' : '#ffffff',
              color: activeTab === 'direct_messages' ? 'var(--accent-primary)' : '#64748b',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: activeTab === 'direct_messages' ? '0 1px 3px rgba(201, 102, 47, 0.15)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            <MessageSquare size={14} /> Direct Messages
            {unreadDMsCount > 0 && (
              <span
                style={{
                  fontSize: '11px',
                  padding: '2px 7px',
                  borderRadius: '10px',
                  background: '#0284c7',
                  color: '#fff',
                  fontWeight: 700,
                }}
              >
                {unreadDMsCount}
              </span>
            )}
          </button>

          <button
            className={`tab-btn ${activeTab === 'sent' ? 'active' : ''}`}
            onClick={() => setActiveTab('sent')}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: activeTab === 'sent' ? '1px solid var(--accent-primary)' : '1px solid #e2e8f0',
              background: activeTab === 'sent' ? 'rgba(201, 102, 47, 0.1)' : '#ffffff',
              color: activeTab === 'sent' ? 'var(--accent-primary)' : '#64748b',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: activeTab === 'sent' ? '0 1px 3px rgba(201, 102, 47, 0.15)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            <Send size={14} /> Sent
          </button>
        </div>

        {/* Search Bar */}
        <div style={{ position: 'relative', width: '280px' }}>
          <input
            type="text"
            className="form-input"
            placeholder="Search messages & alerts..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              fontSize: '13px',
              padding: '7px 12px 7px 32px',
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              color: '#0f172a',
              borderRadius: '8px',
            }}
          />
          <span
            style={{
              position: 'absolute',
              left: '10px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#64748b',
              fontSize: '13px',
            }}
          >
            🔍
          </span>
        </div>
      </div>

      {/* Tab Content Views */}
      {activeTab === 'direct_messages' ? (
        /* Direct Messages Two-Pane View (Clean Light Grey Aesthetic) */
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '320px 1fr',
            gap: 0,
            background: '#f1f5f9',
            border: '1px solid #cbd5e1',
            borderRadius: '12px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
            minHeight: '560px',
            overflow: 'hidden',
          }}
        >
          {/* Conversation List Sidebar */}
          <div
            style={{
              borderRight: '1px solid #cbd5e1',
              display: 'flex',
              flexDirection: 'column',
              background: '#e2e8f0',
            }}
          >
            <div
              style={{
                padding: '14px 18px',
                borderBottom: '1px solid #cbd5e1',
                fontSize: '12px',
                fontWeight: 700,
                color: '#334155',
                textTransform: 'uppercase',
                letterSpacing: '0.6px',
                background: '#f8fafc',
              }}
            >
              Conversations ({conversations.length})
            </div>

            <div style={{ overflowY: 'auto', flex: 1 }}>
              {conversations.map(conv => {
                const isSelected = conv.id === selectedConversationId;
                return (
                  <div
                    key={conv.id}
                    onClick={() => setSelectedConversationId(conv.id)}
                    style={{
                      padding: '13px 16px',
                      borderBottom: '1px solid #cbd5e1',
                      borderLeft: isSelected ? '4px solid #6366f1' : '4px solid transparent',
                      cursor: 'pointer',
                      background: isSelected ? '#ffffff' : 'transparent',
                      boxShadow: isSelected ? '0 2px 8px rgba(0, 0, 0, 0.06)' : 'none',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontWeight: isSelected ? 700 : 600, fontSize: '13px', color: '#0f172a' }}>
                        👤 {conv.otherUser.displayName}
                      </span>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>
                        {new Date(conv.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: '12px',
                        color: isSelected ? '#334155' : '#64748b',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {conv.lastMessage.body}
                    </div>
                    {conv.unreadCount > 0 && (
                      <div style={{ marginTop: '4px' }}>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            padding: '1px 6px',
                            borderRadius: '10px',
                            background: '#6366f1',
                            color: '#fff',
                          }}
                        >
                          {conv.unreadCount} new
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}

              {conversations.length === 0 && (
                <div style={{ padding: '32px 16px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
                  No active conversations. Start one using "+ New Message".
                </div>
              )}
            </div>
          </div>

          {/* Active Conversation Thread */}
          {activeConversation ? (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#f8fafc' }}>
              {/* Thread Header */}
              <div
                style={{
                  padding: '14px 20px',
                  borderBottom: '1px solid #cbd5e1',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: '#ffffff',
                }}
              >
                <div>
                  <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                    {activeConversation.otherUser.displayName}
                  </h4>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>
                    {activeConversation.otherUser.email} • {activeConversation.otherUser.role.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: '11px',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    background: activeConversation.otherUser.status === 'active' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    color: activeConversation.otherUser.status === 'active' ? '#15803d' : '#b91c1c',
                    fontWeight: 600,
                  }}
                >
                  ● {activeConversation.otherUser.status}
                </span>
              </div>

              {/* Server-Paginated Message History Banner */}
              {(chatPagination.total > chatPageSize || chatPagination.totalPages > 1) && (
                <div
                  style={{
                    padding: '8px 20px',
                    background: '#f1f5f9',
                    borderBottom: '1px solid #e2e8f0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '12px',
                    color: '#475569',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <Radio size={12} style={{ color: 'var(--accent-primary, #C9662F)' }} />
                    <span>
                      Server History: Set {chatPage} of {chatPagination.totalPages} ({chatPagination.total} total messages)
                    </span>
                  </span>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                    <select
                      className="pagination-size-select"
                      style={{ padding: '2px 6px', fontSize: '11px' }}
                      value={chatPageSize}
                      onChange={e => {
                        setChatPageSize(Number(e.target.value));
                        setChatPage(1);
                      }}
                      title="Messages per set from backend"
                    >
                      <option value={10}>10 / set</option>
                      <option value={20}>20 / set</option>
                      <option value={50}>50 / set</option>
                    </select>
                    <button
                      type="button"
                      className="btn btn-secondary btn-xs"
                      onClick={() => setChatPage(p => Math.max(1, p - 1))}
                      disabled={chatPage <= 1 || chatPagination.isLoading}
                      style={{ padding: '3px 8px', fontSize: '11px', borderRadius: '4px' }}
                      title="Fetch earlier message set from backend"
                    >
                      ← Earlier
                    </button>
                    <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#1e293b' }}>
                      {chatPage} / {chatPagination.totalPages}
                    </span>
                    <button
                      type="button"
                      className="btn btn-secondary btn-xs"
                      onClick={() => setChatPage(p => Math.min(chatPagination.totalPages, p + 1))}
                      disabled={chatPage >= chatPagination.totalPages || chatPagination.isLoading}
                      style={{ padding: '3px 8px', fontSize: '11px', borderRadius: '4px' }}
                      title="Fetch newer message set from backend"
                    >
                      Newer →
                    </button>
                  </div>
                </div>
              )}

              {/* Message List */}
              <div
                style={{
                  flex: 1,
                  padding: '20px',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                  background: '#f8fafc',
                }}
              >
                {conversationMessages.map(msg => {
                  const isMine = msg.senderId === currentUser?.uid;
                  return (
                    <div
                      key={msg.id}
                      style={{
                        alignSelf: isMine ? 'flex-end' : 'flex-start',
                        maxWidth: '75%',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: isMine ? 'flex-end' : 'flex-start',
                      }}
                    >
                      <div
                        style={{
                          fontSize: '11px',
                          color: '#64748b',
                          marginBottom: '4px',
                        }}
                      >
                        {isMine ? 'You' : msg.senderDisplayName} •{' '}
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>

                      <div
                        style={{
                          padding: '12px 16px',
                          borderRadius: isMine ? '14px 14px 3px 14px' : '14px 14px 14px 3px',
                          background: isMine ? '#4f46e5' : '#ffffff',
                          color: isMine ? '#ffffff' : '#0f172a',
                          fontSize: '13.5px',
                          lineHeight: 1.5,
                          border: isMine ? 'none' : '1px solid #cbd5e1',
                          boxShadow: isMine
                            ? '0 3px 10px rgba(79, 70, 229, 0.25)'
                            : '0 2px 8px rgba(0, 0, 0, 0.04)',
                          wordBreak: 'break-word',
                        }}
                      >
                        {renderFormattedMessageContent(msg, isMine)}
                      </div>

                      {isMine && (
                        <span style={{ fontSize: '11px', color: 'var(--color-text-muted, #64748b)', marginTop: '2px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                          {msg.isRead ? (
                            <>
                              <CheckCheck size={12} style={{ color: 'var(--status-done, #10b981)' }} /> Read
                            </>
                          ) : (
                            <>
                              <Check size={12} /> Delivered
                            </>
                          )}
                        </span>
                      )}
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Reply Form */}
              <form
                onSubmit={handleSendReply}
                style={{
                  padding: '14px 20px',
                  borderTop: '1px solid #cbd5e1',
                  display: 'flex',
                  gap: '10px',
                  background: '#ffffff',
                }}
              >
                <input
                  type="text"
                  placeholder={
                    isBlocked
                      ? 'Messaging disabled for blocked accounts.'
                      : `Reply to ${activeConversation.otherUser.displayName}...`
                  }
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  disabled={isBlocked || isSendingReply}
                  style={{
                    flex: 1,
                    fontSize: '13px',
                    padding: '9px 14px',
                    borderRadius: '8px',
                    background: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    color: '#0f172a',
                    outline: 'none',
                  }}
                />
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  isLoading={isSendingReply}
                  disabled={isBlocked || !replyText.trim() || isSendingReply}
                >
                  Send
                </Button>
              </form>
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#64748b',
                fontSize: '14px',
                background: '#f8fafc',
              }}
            >
              Select a conversation to read and reply.
            </div>
          )}
        </div>
      ) : activeTab === 'sent' ? (
        /* Sent Messages List */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {paginatedSentMessages.map(msg => (
            <div
              key={msg.id}
              onClick={() => {
                setActiveTab('direct_messages');
                setSelectedConversationId(msg.conversationId);
              }}
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                padding: '14px 18px',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
                cursor: 'pointer',
                transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
              }}
              title="Click anywhere to open chat conversation"
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = '#c7d2fe';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(99, 102, 241, 0.1)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = '#e2e8f0';
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.04)';
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span
                  style={{
                    fontWeight: 600,
                    fontSize: '14px',
                    color: 'var(--accent-primary, #C9662F)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  To: <User size={13} /> {msg.recipientDisplayName}
                </span>
                <span style={{ fontSize: '12px', color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  {new Date(msg.createdAt).toLocaleString()} •{' '}
                  {msg.isRead ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', color: 'var(--status-done, #10b981)' }}>
                      <CheckCheck size={12} /> Read
                    </span>
                  ) : (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                      <Check size={12} /> Delivered
                    </span>
                  )}
                </span>
              </div>
              <div style={{ marginTop: '8px' }}>
                {renderFormattedMessageContent(msg, false)}
              </div>
            </div>
          ))}

          {filteredSentMessages.length === 0 && (
            <div
              style={{
                padding: '48px',
                textAlign: 'center',
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                color: '#64748b',
              }}
            >
              No sent messages found.
            </div>
          )}

          {filteredSentMessages.length > 0 && (
            <Pagination
              currentPage={sentPage}
              totalItems={filteredSentMessages.length}
              pageSize={sentPageSize}
              onPageChange={setSentPage}
              pageSizeOptions={[10, 20, 50]}
              onPageSizeChange={size => {
                setSentPageSize(size);
                setSentPage(1);
              }}
              itemLabel="sent messages"
            />
          )}
        </div>
      ) : (
        /* Notifications & Inbox Items List */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {paginatedNotifications.map(notif => {
            const icon = getNotificationIcon(notif.type);
            const isUnread = !notif.isRead;
            const isDirectMessage = notif.type === 'DIRECT_MESSAGE_RECEIVED';
            const isCommentMention = notif.type === 'TASK_COMMENT_MENTION';
            const isTaskAssignment = notif.type === 'TASK_ASSIGNED' || notif.type === 'TASK_REASSIGNED';
            const isTaskEvent =
              isCommentMention ||
              isTaskAssignment ||
              Boolean(notif.taskId) ||
              notif.entityType === 'task' ||
              notif.entityType === 'comment';
            const isProjectEvent =
              (notif.type === 'PROJECT_ASSIGNED' ||
                notif.type === 'PROJECT_MEMBER_ADDED' ||
                notif.type === 'PROJECT_LEAD_CHANGED' ||
                notif.type === 'PROJECT_ROLE_CHANGED') &&
              Boolean(notif.projectId);
            const isDeletionEvent = notif.type === 'PROJECT_DELETED';
            const isBlockedEvent = notif.type === 'USER_BLOCKED';
            const isInteractiveRow =
              isDirectMessage || isTaskEvent || isProjectEvent || isDeletionEvent || isBlockedEvent;

            const rowTooltip = isDirectMessage
              ? 'Click anywhere on row to open chat conversation'
              : isCommentMention
              ? 'Click anywhere on row to view comment in task'
              : isTaskEvent
              ? 'Click anywhere on row to view task'
              : isProjectEvent
              ? 'Click anywhere on row to open project'
              : isDeletionEvent
              ? 'Click anywhere on row to view deletion summary'
              : isBlockedEvent
              ? 'Click anywhere on row to view account status'
              : undefined;

            return (
              <div
                key={notif.id}
                className={`notification-card ${isInteractiveRow ? 'is-interactive' : ''}`}
                role={isInteractiveRow ? 'button' : undefined}
                tabIndex={isInteractiveRow ? 0 : undefined}
                aria-label={
                  isDirectMessage
                    ? `Open conversation with ${notif.actorDisplayName || 'sender'}: ${notif.title}`
                    : isCommentMention
                    ? `View comment on task ${notif.taskTitle || ''}: ${notif.title}`
                    : isTaskEvent
                    ? `View task ${notif.taskTitle || ''}: ${notif.title}`
                    : isProjectEvent
                    ? `Open project ${notif.projectName || ''}: ${notif.title}`
                    : isDeletionEvent
                    ? `View deletion summary: ${notif.title}`
                    : isBlockedEvent
                    ? `View account status: ${notif.title}`
                    : undefined
                }
                onClick={() => {
                  if (isInteractiveRow) {
                    handleNotificationTitleClick(notif);
                  }
                }}
                onKeyDown={e => {
                  if (isInteractiveRow && (e.key === 'Enter' || e.key === ' ')) {
                    if (e.key === ' ') {
                      e.preventDefault();
                    }
                    if (e.target === e.currentTarget) {
                      handleNotificationTitleClick(notif);
                    }
                  }
                }}
                style={{
                  background: isDeletionEvent
                    ? (isUnread ? '#fff5f5' : '#fef2f2')
                    : isUnread ? '#f8faff' : '#ffffff',
                  border: isDeletionEvent
                    ? (isUnread ? '1px solid #fca5a5' : '1px solid #fecaca')
                    : isUnread ? '1px solid #c7d2fe' : '1px solid #e2e8f0',
                  borderLeft: isDeletionEvent
                    ? '5px solid #dc2626'
                    : isUnread ? '4px solid #4f46e5' : '4px solid #cbd5e1',
                  borderRadius: '10px',
                  padding: '14px 18px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '14px',
                  boxShadow: isDeletionEvent
                    ? '0 2px 10px rgba(220, 38, 38, 0.12)'
                    : isUnread ? '0 2px 8px rgba(79, 70, 229, 0.08)' : '0 1px 3px rgba(0, 0, 0, 0.04)',
                  transition: 'background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease',
                  cursor: isInteractiveRow ? 'pointer' : 'default',
                }}
                onMouseEnter={e => {
                  if (isInteractiveRow) {
                    if (isDeletionEvent) {
                      e.currentTarget.style.borderColor = '#ef4444';
                      e.currentTarget.style.boxShadow = '0 4px 14px rgba(220, 38, 38, 0.22)';
                      e.currentTarget.style.background = '#fee2e2';
                    } else {
                      e.currentTarget.style.borderColor = '#a5b4fc';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(79, 70, 229, 0.12)';
                      e.currentTarget.style.background = isUnread ? '#f0f4ff' : '#f8fafc';
                    }
                  }
                }}
                onMouseLeave={e => {
                  if (isInteractiveRow) {
                    if (isDeletionEvent) {
                      e.currentTarget.style.borderColor = isUnread ? '#fca5a5' : '#fecaca';
                      e.currentTarget.style.boxShadow = '0 2px 10px rgba(220, 38, 38, 0.12)';
                      e.currentTarget.style.background = isUnread ? '#fff5f5' : '#fef2f2';
                    } else {
                      e.currentTarget.style.borderColor = isUnread ? '#c7d2fe' : '#e2e8f0';
                      e.currentTarget.style.boxShadow = isUnread
                        ? '0 2px 8px rgba(79, 70, 229, 0.08)'
                        : '0 1px 3px rgba(0, 0, 0, 0.04)';
                      e.currentTarget.style.background = isUnread ? '#f8faff' : '#ffffff';
                    }
                  }
                }}
                title={rowTooltip}
              >
                {/* Event Type Icon */}
                <div
                  style={{
                    padding: '8px',
                    borderRadius: '8px',
                    background: isDeletionEvent
                      ? '#fee2e2'
                      : isUnread ? 'rgba(201, 102, 47, 0.1)' : 'var(--surface-elevated, #FAF5F0)',
                    color: isDeletionEvent ? '#dc2626' : undefined,
                    border: isDeletionEvent ? '1px solid #fca5a5' : '1px solid var(--border-default, #E8DED5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    userSelect: 'none',
                  }}
                >
                  {isDeletionEvent ? <AlertTriangle size={18} style={{ color: '#dc2626' }} /> : icon}
                </div>

                {/* Main Body */}
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '4px',
                    }}
                  >
                    <h4
                      style={{
                        margin: 0,
                        fontSize: '14px',
                        fontWeight: 600,
                        color: isDeletionEvent
                          ? '#991b1b'
                          : isDirectMessage ? 'var(--accent-primary)' : 'var(--color-text-primary, #1e293b)',
                        cursor: isInteractiveRow ? 'pointer' : 'default',
                        transition: 'color 0.15s ease, text-decoration 0.15s ease',
                      }}
                      onMouseEnter={e => {
                        if (isInteractiveRow) {
                          e.currentTarget.style.color = isDeletionEvent ? '#dc2626' : 'var(--accent-primary)';
                          e.currentTarget.style.textDecoration = 'underline';
                        }
                      }}
                      onMouseLeave={e => {
                        if (isInteractiveRow) {
                          e.currentTarget.style.color = isDeletionEvent
                            ? '#991b1b'
                            : isDirectMessage ? 'var(--accent-primary)' : 'var(--color-text-primary, #1e293b)';
                          e.currentTarget.style.textDecoration = 'none';
                        }
                      }}
                    >
                      {notif.title}
                    </h4>
                    {isDeletionEvent && (
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: '#fee2e2',
                          color: '#b91c1c',
                          border: '1px solid #fca5a5',
                          letterSpacing: '0.04em',
                          textTransform: 'uppercase',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px',
                        }}
                      >
                        <AlertTriangle size={11} /> Project Deleted
                      </span>
                    )}
                    {isUnread && (
                      <span
                        style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: isDeletionEvent ? '#dc2626' : 'var(--accent-primary)',
                          display: 'inline-block',
                        }}
                        title="Unread"
                      />
                    )}
                    <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#64748b' }}>
                      {new Date(notif.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} •{' '}
                      {formatDisplayDate(notif.createdAt.slice(0, 10))}
                    </span>
                  </div>

                  <p
                    style={{
                      margin: '0 0 8px',
                      fontSize: '13px',
                      color: isDeletionEvent ? '#7f1d1d' : isUnread ? '#1e293b' : '#475569',
                      lineHeight: 1.5,
                      whiteSpace: 'pre-line',
                    }}
                  >
                    {notif.body}
                  </p>

                  {/* Highlighted Reason for Deletion */}
                  {isDeletionEvent && notif.deletionReason && (
                    <div
                      style={{
                        margin: '6px 0 10px',
                        padding: '8px 12px',
                        background: 'rgba(239, 68, 68, 0.08)',
                        border: '1px solid rgba(239, 68, 68, 0.25)',
                        borderLeft: '4px solid #dc2626',
                        borderRadius: '6px',
                        fontSize: '13px',
                        color: '#991b1b',
                        lineHeight: 1.4,
                      }}
                    >
                      <strong style={{ color: '#7f1d1d' }}>Reason for Deletion:</strong> {notif.deletionReason}
                    </div>
                  )}

                  {/* Context Meta Tags (Project, Task, Comment Preview) */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                    {notif.projectName && (
                      <span
                        style={{
                          fontSize: '11px',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: isDeletionEvent ? '#fee2e2' : 'var(--surface-sunken, #F5EFEB)',
                          color: isDeletionEvent ? '#991b1b' : 'var(--color-text-primary, #1E293B)',
                          border: '1px solid var(--border-default, #E8DED5)',
                          fontWeight: 500,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <FolderKanban size={11} style={{ color: 'var(--color-text-secondary)' }} /> {notif.projectName}
                      </span>
                    )}

                    {notif.taskTitle && (
                      <span
                        style={{
                          fontSize: '11px',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: 'var(--surface-sunken, #F5EFEB)',
                          color: 'var(--color-text-primary, #1E293B)',
                          border: '1px solid var(--border-default, #E8DED5)',
                          fontWeight: 500,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <ListTodo size={11} style={{ color: 'var(--accent-primary)' }} /> {notif.taskTitle}
                      </span>
                    )}

                    {notif.actorDisplayName && (
                      <span
                        style={{
                          fontSize: '11px',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: 'var(--surface-sunken, #F5EFEB)',
                          color: 'var(--color-text-secondary, #64748B)',
                          border: '1px solid var(--border-default, #E8DED5)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <User size={11} /> {notif.actorDisplayName}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions: Mark read & Resource click-through */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' }}>
                  {isUnread && (
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        markNotificationRead(notif.id);
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: isDeletionEvent ? '#dc2626' : 'var(--accent-primary)',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        padding: '4px 6px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                      title="Mark as read"
                    >
                      <Check size={13} /> Mark read
                    </button>
                  )}

                  {isDeletionEvent && (
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={e => {
                        e.stopPropagation();
                        handleNotificationTitleClick(notif);
                      }}
                    >
                      ⚠️ View Details
                    </Button>
                  )}

                  {isCommentMention && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={e => {
                        e.stopPropagation();
                        handleNotificationTitleClick(notif);
                      }}
                    >
                      View Comment
                    </Button>
                  )}

                  {notif.type === 'TASK_BLOCKED' ? (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={e => {
                        e.stopPropagation();
                        handleNotificationTitleClick(notif);
                      }}
                    >
                      View Blocked Task
                    </Button>
                  ) : (isTaskAssignment || (isTaskEvent && !isCommentMention)) && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={e => {
                        e.stopPropagation();
                        handleNotificationTitleClick(notif);
                      }}
                    >
                      View Task
                    </Button>
                  )}

                  {isProjectEvent && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={e => {
                        e.stopPropagation();
                        handleNotificationTitleClick(notif);
                      }}
                    >
                      Open Project
                    </Button>
                  )}

                  {isBlockedEvent && (
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={e => {
                        e.stopPropagation();
                        handleNotificationTitleClick(notif);
                      }}
                    >
                      Account Status
                    </Button>
                  )}

                  {isDirectMessage && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={e => {
                        e.stopPropagation();
                        handleNotificationTitleClick(notif);
                      }}
                    >
                      Open Chat
                    </Button>
                  )}
                </div>
              </div>
            );
          })}

          {filteredNotifications.length === 0 && (
            <div
              style={{
                padding: '48px',
                textAlign: 'center',
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                color: '#64748b',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
                <Inbox size={40} style={{ color: 'var(--color-text-muted, #94a3b8)', opacity: 0.7 }} />
              </div>
              <h4 style={{ margin: '0 0 4px', color: '#0f172a' }}>
                No messages found
              </h4>
              <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                {searchQuery ? 'Try clearing your search query.' : 'You have no notifications in this view.'}
              </p>
            </div>
          )}

          {filteredNotifications.length > 0 && (
            <Pagination
              currentPage={notifPage}
              totalItems={filteredNotifications.length}
              pageSize={notifPageSize}
              onPageChange={setNotifPage}
              pageSizeOptions={[10, 25, 50]}
              onPageSizeChange={size => {
                setNotifPageSize(size);
                setNotifPage(1);
              }}
              itemLabel="notifications"
            />
          )}
        </div>
      )}

      {/* Direct Message Composer Modal */}
      <DirectMessageModal
        isOpen={isNewDmOpen}
        onClose={() => setIsNewDmOpen(false)}
        currentUser={currentUser}
        workspaceUsers={workspaceUsers}
        onSendMessage={async data => {
          const sent = await sendDirectMessage(data);
          setActiveTab('direct_messages');
          setSelectedConversationId(sent.conversationId);
        }}
      />

      {/* Project Deletion Summary Modal */}
      <ProjectDeletionSummaryModal
        isOpen={Boolean(deletionNoticeModalItem)}
        onClose={() => setDeletionNoticeModalItem(null)}
        notification={deletionNoticeModalItem}
      />

      {/* Blocked Account Safe Status Notice Modal */}
      {activeBlockedNotice && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1500,
          }}
          onClick={() => setActiveBlockedNotice(null)}
        >
          <div
            style={{
              background: 'var(--surface-overlay, #1e2430)',
              border: '1px solid var(--border-default, #30363d)',
              borderRadius: '10px',
              padding: '24px',
              maxWidth: '480px',
              width: '90%',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
              <span style={{ fontSize: '28px' }}>🚫</span>
              <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--status-blocked, #ef4444)' }}>
                {activeBlockedNotice.title}
              </h3>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary, #8b949e)', lineHeight: 1.6 }}>
              {activeBlockedNotice.body}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              <Button variant="secondary" size="sm" onClick={() => setActiveBlockedNotice(null)}>
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Web Push (VAPID) Settings & Device Management Modal */}
      {currentUser && (
        <WebPushSettingsModal
          isOpen={isWebPushModalOpen}
          onClose={() => setIsWebPushModalOpen(false)}
          currentUser={currentUser}
        />
      )}
    </div>
  );
};
