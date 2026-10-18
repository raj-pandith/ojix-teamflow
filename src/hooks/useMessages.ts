import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import { AppNotification, DirectConversation, DirectMessage, SendDirectMessageInput } from '../types/message';
import { notificationService } from '../services/notificationService';
import { directMessageService } from '../services/directMessageService';
import { storageEngine } from '../services/storageEngine';

export function useMessages() {
  const { currentUser } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [conversations, setConversations] = useState<DirectConversation[]>([]);
  const [unreadNotifsCount, setUnreadNotifsCount] = useState<number>(0);
  const [unreadDMsCount, setUnreadDMsCount] = useState<number>(0);
  const [totalUnreadCount, setTotalUnreadCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refresh = useCallback(() => {
    if (!currentUser) {
      setNotifications([]);
      setConversations([]);
      setUnreadNotifsCount(0);
      setUnreadDMsCount(0);
      setTotalUnreadCount(0);
      setIsLoading(false);
      return;
    }

    try {
      const notifs = notificationService.getNotifications(currentUser);
      const convs = directMessageService.getConversations(currentUser);
      const notifCount = notificationService.getUnreadCount(currentUser);
      const dmCount = directMessageService.getUnreadCount(currentUser);

      setNotifications(notifs);
      setConversations(convs);
      setUnreadNotifsCount(notifCount);
      setUnreadDMsCount(dmCount);
      setTotalUnreadCount(notifCount + dmCount);
    } catch (err) {
      console.warn('Error refreshing messages:', err);
    } finally {
      setIsLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    refresh();
    const unsubscribe = storageEngine.subscribe(refresh);
    return () => unsubscribe();
  }, [refresh]);

  const markNotificationRead = useCallback(
    (id: string) => {
      if (!currentUser) return;
      notificationService.markAsRead(id, currentUser);
      refresh();
    },
    [currentUser, refresh]
  );

  const markAllNotificationsRead = useCallback(() => {
    if (!currentUser) return;
    notificationService.markAllAsRead(currentUser);
    refresh();
  }, [currentUser, refresh]);

  const sendDirectMessage = useCallback(
    async (input: SendDirectMessageInput): Promise<DirectMessage> => {
      if (!currentUser) {
        throw new Error('Authentication required to send messages.');
      }
      const sent = await directMessageService.sendMessage(input, currentUser);
      refresh();
      return sent;
    },
    [currentUser, refresh]
  );

  const markConversationRead = useCallback(
    (convId: string) => {
      if (!currentUser) return;
      directMessageService.markConversationRead(convId, currentUser);
      refresh();
    },
    [currentUser, refresh]
  );

  const getConversationMessages = useCallback(
    (convId: string): DirectMessage[] => {
      if (!currentUser) return [];
      return directMessageService.getMessages(currentUser, convId);
    },
    [currentUser]
  );

  const fetchConversationMessages = useCallback(
    async (convId: string): Promise<DirectMessage[]> => {
      if (!currentUser) return [];
      const msgs = await directMessageService.fetchConversationMessages(currentUser, convId);
      refresh();
      return msgs;
    },
    [currentUser, refresh]
  );

  return {
    notifications,
    conversations,
    unreadNotifsCount,
    unreadDMsCount,
    totalUnreadCount,
    isLoading,
    refresh,
    markNotificationRead,
    markAllNotificationsRead,
    sendDirectMessage,
    markConversationRead,
    getConversationMessages,
    fetchConversationMessages,
  };
}
