import { DirectMessage, DirectConversation, SendDirectMessageInput } from '../types/message';
import { UserProfile } from '../types/auth';
import { storageEngine } from './storageEngine';

class DirectMessageService {
  public getConversations(user: UserProfile): DirectConversation[] {
    return storageEngine.getDirectConversations(user);
  }

  public getMessages(user: UserProfile, conversationId?: string): DirectMessage[] {
    return storageEngine.getDirectMessages(user, conversationId);
  }

  public async fetchConversationMessages(
    user: UserProfile,
    conversationId: string,
    page: number = 1,
    pageSize: number = 20
  ): Promise<{
    messages: DirectMessage[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    hasMore: boolean;
  }> {
    return storageEngine.fetchConversationMessages(conversationId, user, page, pageSize);
  }

  public async sendMessage(data: SendDirectMessageInput, sender: UserProfile): Promise<DirectMessage> {
    return storageEngine.sendDirectMessage(data, sender);
  }

  public markConversationRead(conversationId: string, user: UserProfile): void {
    storageEngine.markConversationRead(conversationId, user);
  }

  public getUnreadCount(user: UserProfile): number {
    return storageEngine.getUnreadMessageCount(user);
  }

  public subscribe(user: UserProfile, listener: (conversations: DirectConversation[]) => void): () => void {
    const update = () => {
      try {
        const convs = storageEngine.getDirectConversations(user);
        listener(convs);
      } catch {
        listener([]);
      }
    };
    update();
    return storageEngine.subscribe(update);
  }
}

export const directMessageService = new DirectMessageService();
