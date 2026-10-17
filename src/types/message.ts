export type NotificationType =
  | 'PROJECT_DELETED'
  | 'PROJECT_ASSIGNED'
  | 'PROJECT_MEMBER_ADDED'
  | 'PROJECT_MEMBER_REMOVED'
  | 'PROJECT_LEAD_CHANGED'
  | 'PROJECT_ROLE_CHANGED'
  | 'TASK_COMMENT_MENTION'
  | 'TASK_ASSIGNED'
  | 'TASK_REASSIGNED'
  | 'USER_BLOCKED'
  | 'DIRECT_MESSAGE_RECEIVED';

export type EntityType = 'project' | 'task' | 'comment' | 'user' | 'conversation';

export interface AppNotification {
  readonly id: string;
  readonly recipientUserId: string;
  readonly actorUserId: string | null;
  readonly actorDisplayName?: string;
  readonly type: NotificationType;
  readonly title: string;
  readonly body: string;
  readonly entityType: EntityType;
  readonly entityId?: string | null;
  // Navigation & context metadata
  readonly projectId?: string | null;
  readonly projectName?: string | null;
  readonly taskId?: string | null;
  readonly taskTitle?: string | null;
  readonly commentId?: string | null;
  readonly commentPreview?: string | null;
  readonly conversationId?: string | null;
  readonly isRead: boolean;
  readonly createdAt: string; // ISO-8601 UTC string
  readonly readAt?: string | null;
  readonly deduplicationKey?: string;
}

export interface DirectMessage {
  readonly id: string;
  readonly conversationId: string;
  readonly senderId: string;
  readonly senderDisplayName: string;
  readonly recipientId: string;
  readonly recipientDisplayName: string;
  readonly subject?: string;
  readonly body: string;
  readonly isRead: boolean;
  readonly createdAt: string; // ISO-8601 UTC string
  readonly readAt?: string | null;
}

export interface DirectConversation {
  readonly id: string;
  readonly participantIds: readonly [string, string];
  readonly otherUser: import('./auth').UserProfile;
  readonly lastMessage: DirectMessage;
  readonly unreadCount: number;
  readonly updatedAt: string;
}

export interface SendDirectMessageInput {
  recipientId: string;
  subject?: string;
  body: string;
}
