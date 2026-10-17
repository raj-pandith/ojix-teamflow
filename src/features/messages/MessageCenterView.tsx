import React, { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useMessages } from '../../hooks/useMessages';
import { AppNotification } from '../../types/message';
import { storageEngine } from '../../services/storageEngine';
import { Button } from '../../components/common/Button';
import { formatDisplayDate } from '../../domain/timezone';
import { ProjectDeletionSummaryModal } from './ProjectDeletionSummaryModal';
import { DirectMessageModal } from './DirectMessageModal';

type MessageFilterTab = 'all' | 'unread' | 'notifications' | 'direct_messages' | 'sent';

interface MessageCenterViewProps {
  onNavigateToProject?: (projectId: string) => void;
  onNavigateToTask?: (projectId: string, taskId: string, commentId?: string | null) => void;
}

export const MessageCenterView: React.FC<MessageCenterViewProps> = ({
  onNavigateToProject,
  onNavigateToTask,
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
  } = useMessages();

  const [activeTab, setActiveTab] = useState<MessageFilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [isNewDmOpen, setIsNewDmOpen] = useState(false);
  const [deletionNoticeModalItem, setDeletionNoticeModalItem] = useState<AppNotification | null>(null);
  const [activeBlockedNotice, setActiveBlockedNotice] = useState<AppNotification | null>(null);

  const workspaceUsers = useMemo(() => storageEngine.getUsers(), []);

  // Sync selected conversation when opening direct messages
  useEffect(() => {
    if (activeTab === 'direct_messages' && !selectedConversationId && conversations.length > 0) {
      setSelectedConversationId(conversations[0].id);
    }
  }, [activeTab, selectedConversationId, conversations]);

  // Mark conversation read when selected
  useEffect(() => {
    if (selectedConversationId && currentUser) {
      markConversationRead(selectedConversationId);
    }
  }, [selectedConversationId, currentUser, markConversationRead]);

  // Messages in active conversation
  const activeConversation = useMemo(() => {
    return conversations.find(c => c.id === selectedConversationId) || null;
  }, [conversations, selectedConversationId]);

  const conversationMessages = useMemo(() => {
    if (!selectedConversationId) return [];
    return getConversationMessages(selectedConversationId);
  }, [selectedConversationId, getConversationMessages, conversations]);

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

  const getNotificationIcon = (type: string) => {
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
          {totalUnreadCount > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={markAllNotificationsRead}
              id="mark-all-read-btn"
              title="Mark all notifications and messages as read"
            >
              ✓ Mark All Read
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
            ✉️ New Message
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
          borderBottom: '1px solid var(--border-default, #30363d)',
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
              borderRadius: '6px',
              border: 'none',
              background: activeTab === 'all' ? 'var(--surface-elevated, #21262d)' : 'transparent',
              color: activeTab === 'all' ? 'var(--text-primary, #f0f6fc)' : 'var(--text-secondary, #8b949e)',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            All
            <span
              style={{
                fontSize: '11px',
                padding: '2px 6px',
                borderRadius: '10px',
                background: 'rgba(255, 255, 255, 0.08)',
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
              borderRadius: '6px',
              border: 'none',
              background: activeTab === 'unread' ? 'var(--surface-elevated, #21262d)' : 'transparent',
              color: activeTab === 'unread' ? 'var(--accent-primary-light, #818cf8)' : 'var(--text-secondary, #8b949e)',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            Unread
            {unreadNotifsCount > 0 && (
              <span
                style={{
                  fontSize: '11px',
                  padding: '2px 6px',
                  borderRadius: '10px',
                  background: 'var(--accent-primary, #6366f1)',
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
              borderRadius: '6px',
              border: 'none',
              background: activeTab === 'notifications' ? 'var(--surface-elevated, #21262d)' : 'transparent',
              color: activeTab === 'notifications' ? 'var(--text-primary, #f0f6fc)' : 'var(--text-secondary, #8b949e)',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            🔔 Notifications
          </button>

          <button
            className={`tab-btn ${activeTab === 'direct_messages' ? 'active' : ''}`}
            onClick={() => setActiveTab('direct_messages')}
            style={{
              padding: '8px 14px',
              borderRadius: '6px',
              border: 'none',
              background: activeTab === 'direct_messages' ? 'var(--surface-elevated, #21262d)' : 'transparent',
              color: activeTab === 'direct_messages' ? 'var(--text-primary, #f0f6fc)' : 'var(--text-secondary, #8b949e)',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            💬 Direct Messages
            {unreadDMsCount > 0 && (
              <span
                style={{
                  fontSize: '11px',
                  padding: '2px 6px',
                  borderRadius: '10px',
                  background: 'var(--status-in-progress, #38bdf8)',
                  color: '#000',
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
              borderRadius: '6px',
              border: 'none',
              background: activeTab === 'sent' ? 'var(--surface-elevated, #21262d)' : 'transparent',
              color: activeTab === 'sent' ? 'var(--text-primary, #f0f6fc)' : 'var(--text-secondary, #8b949e)',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            📤 Sent
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
            style={{ width: '100%', fontSize: '13px', padding: '7px 12px 7px 32px' }}
          />
          <span
            style={{
              position: 'absolute',
              left: '10px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted, #8b949e)',
              fontSize: '13px',
            }}
          >
            🔍
          </span>
        </div>
      </div>

      {/* Tab Content Views */}
      {activeTab === 'direct_messages' ? (
        /* Direct Messages Two-Pane View */
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '320px 1fr',
            gap: '16px',
            background: 'var(--surface-subtle, #161b22)',
            border: '1px solid var(--border-default, #30363d)',
            borderRadius: '10px',
            minHeight: '520px',
            overflow: 'hidden',
          }}
        >
          {/* Conversation List Sidebar */}
          <div
            style={{
              borderRight: '1px solid var(--border-default, #30363d)',
              display: 'flex',
              flexDirection: 'column',
              background: 'rgba(0, 0, 0, 0.1)',
            }}
          >
            <div
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid var(--border-default, #30363d)',
                fontSize: '12px',
                fontWeight: 700,
                color: 'var(--text-muted, #8b949e)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
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
                      padding: '12px 14px',
                      borderBottom: '1px solid var(--border-subtle, #21262d)',
                      cursor: 'pointer',
                      background: isSelected
                        ? 'var(--surface-elevated, #21262d)'
                        : 'transparent',
                      transition: 'background 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary, #f0f6fc)' }}>
                        👤 {conv.otherUser.displayName}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted, #8b949e)' }}>
                        {new Date(conv.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: '12px',
                        color: 'var(--text-secondary, #8b949e)',
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
                            background: 'var(--accent-primary, #6366f1)',
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
                <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted, #8b949e)', fontSize: '13px' }}>
                  No active conversations. Start one using "+ New Message".
                </div>
              )}
            </div>
          </div>

          {/* Active Conversation Thread */}
          {activeConversation ? (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              {/* Thread Header */}
              <div
                style={{
                  padding: '14px 20px',
                  borderBottom: '1px solid var(--border-default, #30363d)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'rgba(255, 255, 255, 0.02)',
                }}
              >
                <div>
                  <h4 style={{ margin: 0, fontSize: '15px', color: 'var(--text-primary, #f0f6fc)' }}>
                    {activeConversation.otherUser.displayName}
                  </h4>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted, #8b949e)' }}>
                    {activeConversation.otherUser.email} • {activeConversation.otherUser.role.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: '11px',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    background: activeConversation.otherUser.status === 'active' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    color: activeConversation.otherUser.status === 'active' ? 'var(--status-done, #22c55e)' : 'var(--status-blocked, #ef4444)',
                    fontWeight: 600,
                  }}
                >
                  ● {activeConversation.otherUser.status}
                </span>
              </div>

              {/* Message List */}
              <div
                style={{
                  flex: 1,
                  padding: '20px',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
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
                          color: 'var(--text-muted, #8b949e)',
                          marginBottom: '4px',
                        }}
                      >
                        {isMine ? 'You' : msg.senderDisplayName} •{' '}
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>

                      <div
                        style={{
                          padding: '10px 14px',
                          borderRadius: isMine ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                          background: isMine
                            ? 'var(--accent-primary, #6366f1)'
                            : 'var(--surface-elevated, #21262d)',
                          color: '#fff',
                          fontSize: '13.5px',
                          lineHeight: 1.5,
                          border: isMine ? 'none' : '1px solid var(--border-default, #30363d)',
                          wordBreak: 'break-word',
                        }}
                      >
                        {msg.subject && (
                          <div style={{ fontWeight: 700, marginBottom: '4px', fontSize: '13px' }}>
                            {msg.subject}
                          </div>
                        )}
                        {msg.body}
                      </div>

                      {isMine && (
                        <span style={{ fontSize: '10px', color: 'var(--text-muted, #8b949e)', marginTop: '2px' }}>
                          {msg.isRead ? '✓✓ Read' : '✓ Delivered'}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Reply Form */}
              <form
                onSubmit={handleSendReply}
                style={{
                  padding: '14px 20px',
                  borderTop: '1px solid var(--border-default, #30363d)',
                  display: 'flex',
                  gap: '10px',
                  background: 'rgba(255, 255, 255, 0.01)',
                }}
              >
                <input
                  type="text"
                  className="form-input"
                  placeholder={
                    isBlocked
                      ? 'Messaging disabled for blocked accounts.'
                      : `Reply to ${activeConversation.otherUser.displayName}...`
                  }
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  disabled={isBlocked || isSendingReply}
                  style={{ flex: 1, fontSize: '13px' }}
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
                color: 'var(--text-muted, #8b949e)',
                fontSize: '14px',
              }}
            >
              Select a conversation to read and reply.
            </div>
          )}
        </div>
      ) : activeTab === 'sent' ? (
        /* Sent Messages List */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filteredSentMessages.map(msg => (
            <div
              key={msg.id}
              style={{
                background: 'var(--surface-subtle, #161b22)',
                border: '1px solid var(--border-default, #30363d)',
                borderRadius: '8px',
                padding: '14px 18px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary, #f0f6fc)' }}>
                  To: 👤 {msg.recipientDisplayName}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted, #8b949e)' }}>
                  {new Date(msg.createdAt).toLocaleString()} • {msg.isRead ? '✓✓ Read' : '✓ Delivered'}
                </span>
              </div>
              {msg.subject && (
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary, #8b949e)', marginBottom: '4px' }}>
                  {msg.subject}
                </div>
              )}
              <div style={{ fontSize: '13px', color: 'var(--text-secondary, #8b949e)', lineHeight: 1.5 }}>
                {msg.body}
              </div>
            </div>
          ))}

          {filteredSentMessages.length === 0 && (
            <div
              style={{
                padding: '48px',
                textAlign: 'center',
                background: 'var(--surface-subtle, #161b22)',
                borderRadius: '8px',
                color: 'var(--text-muted, #8b949e)',
              }}
            >
              No sent messages found.
            </div>
          )}
        </div>
      ) : (
        /* Notifications & Inbox Items List */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filteredNotifications.map(notif => {
            const icon = getNotificationIcon(notif.type);
            const isUnread = !notif.isRead;

            return (
              <div
                key={notif.id}
                className="notification-card"
                style={{
                  background: isUnread
                    ? 'rgba(99, 102, 241, 0.05)'
                    : 'var(--surface-subtle, #161b22)',
                  border: isUnread
                    ? '1px solid rgba(99, 102, 241, 0.35)'
                    : '1px solid var(--border-default, #30363d)',
                  borderLeft: isUnread
                    ? '4px solid var(--accent-primary, #6366f1)'
                    : '1px solid var(--border-default, #30363d)',
                  borderRadius: '8px',
                  padding: '14px 18px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '14px',
                  transition: 'background 0.2s ease',
                }}
              >
                {/* Event Type Icon */}
                <div
                  style={{
                    fontSize: '20px',
                    padding: '8px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.04)',
                    lineHeight: 1,
                  }}
                >
                  {icon}
                </div>

                {/* Main Body */}
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--text-primary, #f0f6fc)' }}>
                      {notif.title}
                    </h4>
                    {isUnread && (
                      <span
                        style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: 'var(--accent-primary, #6366f1)',
                          display: 'inline-block',
                        }}
                        title="Unread"
                      />
                    )}
                    <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-muted, #8b949e)' }}>
                      {new Date(notif.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} •{' '}
                      {formatDisplayDate(notif.createdAt.slice(0, 10))}
                    </span>
                  </div>

                  <p
                    style={{
                      margin: '0 0 8px',
                      fontSize: '13px',
                      color: 'var(--text-secondary, #8b949e)',
                      lineHeight: 1.5,
                    }}
                  >
                    {notif.body}
                  </p>

                  {/* Context Meta Tags (Project, Task, Comment Preview) */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                    {notif.projectName && (
                      <span
                        style={{
                          fontSize: '11px',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: 'rgba(56, 189, 248, 0.1)',
                          color: 'var(--status-in-progress, #38bdf8)',
                          fontWeight: 500,
                        }}
                      >
                        📁 {notif.projectName}
                      </span>
                    )}

                    {notif.taskTitle && (
                      <span
                        style={{
                          fontSize: '11px',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: 'rgba(168, 85, 247, 0.1)',
                          color: '#c084fc',
                          fontWeight: 500,
                        }}
                      >
                        📋 {notif.taskTitle}
                      </span>
                    )}

                    {notif.actorDisplayName && (
                      <span
                        style={{
                          fontSize: '11px',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: 'rgba(255, 255, 255, 0.05)',
                          color: 'var(--text-muted, #8b949e)',
                        }}
                      >
                        👤 {notif.actorDisplayName}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions: Mark read & Resource click-through */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' }}>
                  {isUnread && (
                    <button
                      onClick={() => markNotificationRead(notif.id)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--accent-primary-light, #818cf8)',
                        fontSize: '12px',
                        cursor: 'pointer',
                        padding: '4px 6px',
                      }}
                      title="Mark as read"
                    >
                      ✓ Read
                    </button>
                  )}

                  {notif.type === 'PROJECT_DELETED' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setDeletionNoticeModalItem(notif)}
                    >
                      View Summary
                    </Button>
                  )}

                  {notif.type === 'TASK_COMMENT_MENTION' && notif.projectId && notif.taskId && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        markNotificationRead(notif.id);
                        onNavigateToTask?.(notif.projectId!, notif.taskId!, notif.commentId);
                      }}
                    >
                      View Comment
                    </Button>
                  )}

                  {(notif.type === 'PROJECT_ASSIGNED' || notif.type === 'PROJECT_MEMBER_ADDED') &&
                    notif.projectId && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          markNotificationRead(notif.id);
                          onNavigateToProject?.(notif.projectId!);
                        }}
                      >
                        Open Project
                      </Button>
                    )}

                  {notif.type === 'USER_BLOCKED' && (
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => setActiveBlockedNotice(notif)}
                    >
                      Account Status
                    </Button>
                  )}

                  {notif.type === 'DIRECT_MESSAGE_RECEIVED' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        markNotificationRead(notif.id);
                        setActiveTab('direct_messages');
                        if (notif.conversationId) {
                          setSelectedConversationId(notif.conversationId);
                        }
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
                background: 'var(--surface-subtle, #161b22)',
                borderRadius: '8px',
                color: 'var(--text-muted, #8b949e)',
              }}
            >
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>📭</div>
              <h4 style={{ margin: '0 0 4px', color: 'var(--text-primary, #f0f6fc)' }}>
                No messages found
              </h4>
              <p style={{ margin: 0, fontSize: '13px' }}>
                {searchQuery ? 'Try clearing your search query.' : 'You have no notifications in this view.'}
              </p>
            </div>
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
    </div>
  );
};
