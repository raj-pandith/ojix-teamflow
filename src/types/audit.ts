export type AuditAction = 
  | 'created'
  | 'status_changed'
  | 'reassigned'
  | 'comment_added'
  | 'blocked'
  | 'unblocked'
  | 'edited'
  | 'deleted'
  | 'user_created'
  | 'user_updated'
  | 'user_blocked'
  | 'user_unblocked'
  | 'user_terminated'
  | 'team_member_added'
  | 'team_member_removed';

export interface ActivityLogEntry {
  readonly id: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly taskId: string;
  readonly userId: string;
  readonly userDisplayName: string;
  readonly action: AuditAction;
  readonly fieldChanged?: string;
  readonly oldValue?: string | null;
  readonly newValue?: string | null;
  readonly commentText?: string;
  readonly createdAt: string; // ISO-8601 UTC string
}
