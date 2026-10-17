import { ActivityLogEntry } from '../types/audit';
import { UserProfile } from '../types/auth';
import { storageEngine } from './storageEngine';
import { resolveCommentMentions } from '../domain/mentionParser';
import { notificationService } from './notificationService';

class AuditService {
  public getLogs(taskId: string, user: UserProfile): ActivityLogEntry[] {
    return storageEngine.getTaskLogs(taskId, user);
  }

  public logActivity(entry: ActivityLogEntry, user: UserProfile): void {
    storageEngine.addActivityLog(entry, user);
  }

  public async addComment(
    taskId: string,
    projectId: string,
    commentText: string,
    user: UserProfile
  ): Promise<ActivityLogEntry> {
    if (user.role === 'viewer') {
      throw new Error('Permission denied: Viewers cannot post task notes.');
    }

    const trimmed = commentText.trim();
    if (!trimmed) {
      throw new Error('Comment note cannot be empty.');
    }

    const entry: ActivityLogEntry = {
      id: `log-${Date.now().toString(36)}`,
      workspaceId: 'ws-ojix-main',
      projectId,
      taskId,
      userId: user.uid,
      userDisplayName: user.displayName,
      action: 'comment_added',
      commentText: trimmed,
      createdAt: new Date().toISOString(),
    };

    storageEngine.addActivityLog(entry, user);

    // Process @mentions only after comment successfully saves
    try {
      const task = storageEngine.getTaskById(taskId, user);
      const project = storageEngine.getProjectById(projectId, user);
      const allUsers = storageEngine.getUsers();
      if (task && project) {
        const { resolvedUsers } = resolveCommentMentions(trimmed, allUsers, project, user);
        for (const mentionedUser of resolvedUsers) {
          notificationService.notifyTaskCommentMention(
            task,
            project,
            trimmed,
            entry.id,
            mentionedUser,
            user
          );
        }
      }
    } catch (err) {
      console.warn('Failed to dispatch comment mention notifications:', err);
    }

    return entry;
  }

  public subscribe(
    taskId: string,
    user: UserProfile,
    listener: (logs: ActivityLogEntry[]) => void
  ): () => void {
    const update = () => {
      try {
        const logs = storageEngine.getTaskLogs(taskId, user);
        listener(logs);
      } catch {
        listener([]);
      }
    };
    update();
    return storageEngine.subscribe(update);
  }
}

export const auditService = new AuditService();
