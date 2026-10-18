import { AppNotification, NotificationType } from '../types/message';
import { UserProfile } from '../types/auth';
import { Project } from '../types/project';
import { Task } from '../types/task';
import { storageEngine } from './storageEngine';

class NotificationService {
  public getNotifications(user: UserProfile): AppNotification[] {
    return storageEngine.getNotifications(user);
  }

  public getUnreadCount(user: UserProfile): number {
    return storageEngine.getUnreadNotificationCount(user);
  }

  public markAsRead(notificationId: string, user: UserProfile): void {
    storageEngine.markNotificationRead(notificationId, user);
  }

  public markAllAsRead(user: UserProfile): void {
    storageEngine.markAllNotificationsRead(user);
  }

  public subscribe(user: UserProfile, listener: (notifs: AppNotification[]) => void): () => void {
    const update = () => {
      try {
        const notifs = storageEngine.getNotifications(user);
        listener(notifs);
      } catch {
        listener([]);
      }
    };
    update();
    return storageEngine.subscribe(update);
  }

  // Trigger Helpers for System Events
  public notifyProjectDeleted(project: Project, deletedBy: UserProfile): void {
    const now = new Date().toISOString();
    const formattedDate = new Date().toLocaleString();
    const affectedMembers = project.memberIds.filter(id => id !== deletedBy.uid);
    const allRecipients = Array.from(
      new Set([...affectedMembers, ...(project.ownerId !== deletedBy.uid ? [project.ownerId] : [])])
    );

    const notifs: AppNotification[] = allRecipients.map(recipientId => ({
      id: `notif-pdel-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      recipientUserId: recipientId,
      actorUserId: deletedBy.uid,
      actorDisplayName: deletedBy.displayName,
      type: 'PROJECT_DELETED',
      title: 'Project deleted',
      body: `The project "${project.name}" has been deleted by ${deletedBy.displayName} on ${formattedDate}.`,
      entityType: 'project',
      entityId: project.id,
      projectId: project.id,
      projectName: project.name,
      isRead: false,
      createdAt: now,
      deduplicationKey: `pdel-${project.id}-${recipientId}`,
    }));

    storageEngine.addNotifications(notifs);
  }

  public notifyProjectMembership(
    project: Project,
    recipient: UserProfile,
    action: 'assigned_lead' | 'added_member' | 'removed_member',
    actor: UserProfile
  ): void {
    if (recipient.uid === actor.uid) return;

    const now = new Date().toISOString();
    let type: NotificationType = 'PROJECT_MEMBER_ADDED';
    let title = 'Added to project';
    let body = `You have been added to "${project.name}" by ${actor.displayName}.`;

    if (action === 'assigned_lead') {
      type = 'PROJECT_ASSIGNED';
      title = 'You have been assigned as Project Lead';
      body = `${actor.displayName} assigned you as Project Lead for "${project.name}".`;
    } else if (action === 'removed_member') {
      type = 'PROJECT_MEMBER_REMOVED';
      title = 'Project access updated';
      body = `Access to project "${project.name}" has been removed by ${actor.displayName}.`;
    } else if (recipient.role === 'viewer') {
      type = 'PROJECT_MEMBER_ADDED';
      title = 'Project shared with you';
      body = `You have been added as a Viewer to "${project.name}". You have read-only access to this project.`;
    }

    const dedupKey = action === 'removed_member'
      ? `pmem-${project.id}-${recipient.uid}-removed-${project.updatedAt || now.slice(0, 10)}`
      : `pmem-${project.id}-${recipient.uid}-${action}`;

    storageEngine.addNotification({
      id: `notif-pmem-${project.id}-${recipient.uid}-${action}`,
      recipientUserId: recipient.uid,
      actorUserId: actor.uid,
      actorDisplayName: actor.displayName,
      type,
      title,
      body,
      entityType: 'project',
      entityId: project.id,
      projectId: project.id,
      projectName: project.name,
      isRead: false,
      createdAt: now,
      deduplicationKey: dedupKey,
    });
  }

  public notifyTaskCommentMention(
    task: Task,
    project: Project,
    commentText: string,
    commentId: string,
    mentionedUser: UserProfile,
    commenter: UserProfile
  ): void {
    if (mentionedUser.uid === commenter.uid) return;

    const now = new Date().toISOString();
    const preview = commentText.length > 120 ? `${commentText.slice(0, 120)}...` : commentText;
    const dedupKey = `mnt-${commentId || task.id}-${mentionedUser.uid}`;

    storageEngine.addNotification({
      id: `notif-mnt-${commentId || task.id}-${mentionedUser.uid}`,
      recipientUserId: mentionedUser.uid,
      actorUserId: commenter.uid,
      actorDisplayName: commenter.displayName,
      type: 'TASK_COMMENT_MENTION',
      title: 'You were mentioned in a task comment',
      body: `${commenter.displayName} mentioned you in a comment on "${task.title}" in "${project.name}".`,
      entityType: 'comment',
      entityId: commentId,
      projectId: project.id,
      projectName: project.name,
      taskId: task.id,
      taskTitle: task.title,
      commentId,
      commentPreview: preview,
      isRead: false,
      createdAt: now,
      deduplicationKey: dedupKey,
    });
  }

  public notifyUserBlocked(blockedUser: UserProfile, actor: UserProfile): void {
    const now = new Date().toISOString();
    const dedupKey = `blk-${blockedUser.uid}`;

    // Notification to affected user
    storageEngine.addNotification({
      id: `notif-blk-${blockedUser.uid}`,
      recipientUserId: blockedUser.uid,
      actorUserId: actor.uid,
      actorDisplayName: actor.displayName,
      type: 'USER_BLOCKED',
      title: 'Account access restricted',
      body: 'Your workspace account has been blocked by an administrator. You can no longer access protected workspace features. Contact your administrator for assistance.',
      entityType: 'user',
      entityId: blockedUser.uid,
      isRead: false,
      createdAt: now,
      deduplicationKey: dedupKey,
    });

    // Notification to admin
    if (actor.uid !== blockedUser.uid) {
      storageEngine.addNotification({
        id: `notif-blk-adm-${blockedUser.uid}-${actor.uid}`,
        recipientUserId: actor.uid,
        actorUserId: actor.uid,
        actorDisplayName: actor.displayName,
        type: 'USER_BLOCKED',
        title: 'User account blocked',
        body: `Successfully blocked workspace account for "${blockedUser.displayName}".`,
        entityType: 'user',
        entityId: blockedUser.uid,
        isRead: false,
        createdAt: now,
        deduplicationKey: `blk-adm-${blockedUser.uid}-${actor.uid}`,
      });
    }
  }

  public notifyTaskAssigned(
    task: Task,
    project: Project,
    assignee: UserProfile,
    actor: UserProfile,
    isReassignment: boolean = false
  ): void {
    if (assignee.uid === actor.uid) return;

    const now = new Date().toISOString();
    const type: NotificationType = isReassignment ? 'TASK_REASSIGNED' : 'TASK_ASSIGNED';
    const title = isReassignment ? 'Task reassigned to you' : 'New task assigned to you';
    const body = `${actor.displayName} ${isReassignment ? 'reassigned' : 'assigned'} task "${task.title}" to you in "${project.name}".`;

    const dedupKey = isReassignment
      ? `tskasg-${task.id}-${assignee.uid}-re-${task.updatedAt || now}`
      : `tskasg-${task.id}-${assignee.uid}-new`;

    storageEngine.addNotification({
      id: `notif-tsk-${task.id}-${assignee.uid}-${isReassignment ? 're' : 'new'}`,
      recipientUserId: assignee.uid,
      actorUserId: actor.uid,
      actorDisplayName: actor.displayName,
      type,
      title,
      body,
      entityType: 'task',
      entityId: task.id,
      projectId: project.id,
      projectName: project.name,
      taskId: task.id,
      taskTitle: task.title,
      isRead: false,
      createdAt: now,
      deduplicationKey: dedupKey,
    });
  }
}

export const notificationService = new NotificationService();
