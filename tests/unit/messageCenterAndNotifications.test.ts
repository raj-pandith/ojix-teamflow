import { describe, it, expect, beforeEach } from 'vitest';
import { storageEngine } from '../../src/services/storageEngine';
import { notificationService } from '../../src/services/notificationService';
import { directMessageService } from '../../src/services/directMessageService';
import { auditService } from '../../src/services/auditService';
import { resolveCommentMentions, extractMentionTokens, getMentionSuggestions } from '../../src/domain/mentionParser';
import { UserProfile } from '../../src/types/auth';
import { Project } from '../../src/types/project';
import { Task } from '../../src/types/task';

describe('OJIX TeamFlow Message Center, Notifications & Direct Messaging', () => {
  const now = new Date().toISOString();

  // Test User Personas
  const adminUser: UserProfile = {
    uid: 'u-admin-test',
    email: 'admin@ojix.local',
    displayName: 'Alex Admin',
    role: 'workspace_admin',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  const leadUser: UserProfile = {
    uid: 'u-lead-test',
    email: 'lead@ojix.local',
    displayName: 'Marcus Lead',
    role: 'project_lead',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  const memberA: UserProfile = {
    uid: 'u-member-a',
    email: 'rajpandith@gmail.com',
    displayName: 'Raj Pandith',
    role: 'member',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  const memberB: UserProfile = {
    uid: 'u-member-b',
    email: 'sarah.chen@ojix.local',
    displayName: 'Sarah Chen',
    role: 'member',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  const viewerUser: UserProfile = {
    uid: 'u-viewer-test',
    email: 'viewer@ojix.local',
    displayName: 'Victor Viewer',
    role: 'viewer',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  const unassignedAdmin: UserProfile = {
    uid: 'u-unassigned-admin',
    email: 'unassigned.admin@ojix.local',
    displayName: 'External Admin',
    role: 'workspace_admin',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  const blockedUser: UserProfile = {
    uid: 'u-blocked-test',
    email: 'blocked@ojix.local',
    displayName: 'Bob Blocked',
    role: 'member',
    status: 'blocked',
    createdAt: now,
    updatedAt: now,
  };

  let testProject: Project;
  let testTask: Task;

  beforeEach(() => {
    storageEngine.initialize(true);

    // Ensure test users exist in storageEngine
    const all = storageEngine.getUsers();
    const testUsers = [adminUser, leadUser, memberA, memberB, viewerUser, unassignedAdmin, blockedUser];
    for (const tu of testUsers) {
      if (!all.some(u => u.uid === tu.uid)) {
        // Direct seed for test
        (storageEngine as any).users.push(tu);
      }
    }

    testProject = {
      id: 'proj-test-mc',
      workspaceId: 'ws-ojix-main',
      name: 'Website Redesign',
      objective: 'Core platform redesign',
      ownerId: leadUser.uid,
      status: 'active',
      startDate: '2026-10-01',
      dueDate: '2026-11-01',
      memberIds: [leadUser.uid, memberA.uid, memberB.uid, viewerUser.uid],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    storageEngine.saveProject(testProject, adminUser);

    testTask = {
      id: 'task-test-mc',
      workspaceId: 'ws-ojix-main',
      projectId: testProject.id,
      title: 'Implement Login API',
      description: 'API authentication layer',
      status: 'in_progress',
      priority: 'high',
      assigneeId: memberA.uid,
      dueDate: '2026-10-25',
      createdBy: leadUser.uid,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    storageEngine.saveTask(testTask, leadUser);
  });

  describe('1. Project Deletion Notifications', () => {
    it('notifies affected project lead and members, excluding the actor', () => {
      // Lead deletes the project
      storageEngine.deleteProject(testProject.id, leadUser);

      // Member A should receive a notification
      const notifsMemberA = storageEngine.getNotifications(memberA);
      const delNotifA = notifsMemberA.find(n => n.type === 'PROJECT_DELETED');
      expect(delNotifA).toBeDefined();
      expect(delNotifA?.title).toBe('Project deleted');
      expect(delNotifA?.body).toContain('Website Redesign');
      expect(delNotifA?.body).toContain(leadUser.displayName);
      expect(delNotifA?.actorUserId).toBe(leadUser.uid);

      // Member B should receive it
      const notifsMemberB = storageEngine.getNotifications(memberB);
      expect(notifsMemberB.some(n => n.type === 'PROJECT_DELETED')).toBe(true);

      // The actor (leadUser) must NOT receive a notification for their own action
      const notifsLead = storageEngine.getNotifications(leadUser);
      expect(notifsLead.some(n => n.type === 'PROJECT_DELETED')).toBe(false);
    });

    it('does not generate notifications if deletion fails authorization', () => {
      // Member attempts to delete project (unauthorized)
      expect(() => {
        storageEngine.deleteProject(testProject.id, memberA);
      }).toThrow(/Permission denied/);

      // No deletion notifications created
      const notifsA = storageEngine.getNotifications(memberA);
      expect(notifsA.some(n => n.type === 'PROJECT_DELETED')).toBe(false);

      const notifsB = storageEngine.getNotifications(memberB);
      expect(notifsB.some(n => n.type === 'PROJECT_DELETED')).toBe(false);
    });

    it('captures project deletion notice history and deletion reason', () => {
      storageEngine.deleteProject(testProject.id, adminUser, 'Sprint goals reorganized');
      const notices = storageEngine.getDeletionNotices(memberA);
      const match = notices.find(n => n.projectId === testProject.id);
      expect(match).toBeDefined();
      expect(match?.projectName).toBe('Website Redesign');
      expect(match?.deletedByName).toBe(adminUser.displayName);
      expect(match?.reason).toBe('Sprint goals reorganized');

      const notifsMemberA = storageEngine.getNotifications(memberA);
      const delNotif = notifsMemberA.find(n => n.type === 'PROJECT_DELETED');
      expect(delNotif?.deletionReason).toBe('Sprint goals reorganized');
      expect(delNotif?.body).toContain('Reason: Sprint goals reorganized');
    });

    it('ensures project deletion notifications strictly go ONLY to project team members', () => {
      // adminUser is NOT in testProject.memberIds and not the owner
      storageEngine.deleteProject(testProject.id, leadUser, 'Team phased out');

      // Member A (in project) receives it
      const notifsMemberA = storageEngine.getNotifications(memberA);
      expect(notifsMemberA.some(n => n.type === 'PROJECT_DELETED')).toBe(true);

      // adminUser (NOT in memberIds of this project) does NOT receive it
      const notifsAdmin = storageEngine.getNotifications(adminUser);
      expect(notifsAdmin.some(n => n.type === 'PROJECT_DELETED')).toBe(false);
    });
  });

  describe('2. Project Assignment and Membership Notifications', () => {
    it('notifies Project Lead with designated role copy', () => {
      notificationService.notifyProjectMembership(testProject, leadUser, 'assigned_lead', adminUser);

      const notifs = storageEngine.getNotifications(leadUser);
      const leadNotif = notifs.find(n => n.type === 'PROJECT_ASSIGNED');
      expect(leadNotif).toBeDefined();
      expect(leadNotif?.title).toBe('You have been assigned as Project Lead');
      expect(leadNotif?.body).toContain('assigned you as Project Lead for "Website Redesign"');
    });

    it('notifies Member with standard team addition copy', () => {
      notificationService.notifyProjectMembership(testProject, memberA, 'added_member', leadUser);

      const notifs = storageEngine.getNotifications(memberA);
      const addedNotif = notifs.find(n => n.type === 'PROJECT_MEMBER_ADDED');
      expect(addedNotif).toBeDefined();
      expect(addedNotif?.title).toBe('Added to project');
      expect(addedNotif?.body).toContain('You have been added to "Website Redesign" by Marcus Lead');
    });

    it('notifies Viewer with read-only copy and does not imply editing rights', () => {
      notificationService.notifyProjectMembership(testProject, viewerUser, 'added_member', leadUser);

      const notifs = storageEngine.getNotifications(viewerUser);
      const viewerNotif = notifs.find(n => n.type === 'PROJECT_MEMBER_ADDED');
      expect(viewerNotif).toBeDefined();
      expect(viewerNotif?.title).toBe('Project shared with you');
      expect(viewerNotif?.body).toContain('You have read-only access to this project');
    });

    it('does not indiscriminately notify Workspace Admins not involved in project', () => {
      // Add memberB via leadUser
      notificationService.notifyProjectMembership(testProject, memberB, 'added_member', leadUser);

      // Unassigned admin should NOT have received a notification
      const adminNotifs = storageEngine.getNotifications(unassignedAdmin);
      expect(adminNotifs.some(n => n.projectId === testProject.id)).toBe(false);
    });

    it('notifies removed member with account-safe explanation', () => {
      storageEngine.removeTeamMember(testProject.id, memberB.uid, leadUser, []);

      const notifs = storageEngine.getNotifications(memberB);
      const remNotif = notifs.find(n => n.type === 'PROJECT_MEMBER_REMOVED');
      expect(remNotif).toBeDefined();
      expect(remNotif?.title).toBe('Project access updated');
      expect(remNotif?.body).toContain('Your access to project "Website Redesign" has been removed');
      expect(remNotif?.body).toContain('Note that your workspace account remains active');
    });
  });

  describe('3. Task Comment @Mentions', () => {
    it('extracts mention tokens correctly for email and email local-part', () => {
      const text = 'Hello @rajpandith and @sarah.chen@ojix.local please review this';
      const tokens = extractMentionTokens(text);
      expect(tokens).toContain('rajpandith');
      expect(tokens).toContain('sarah.chen@ojix.local');
    });

    it('resolves valid @mentions to unique workspace user IDs', () => {
      const text = '@rajpandith please review the authentication changes before merging.';
      const result = resolveCommentMentions(
        text,
        [adminUser, leadUser, memberA, memberB, viewerUser],
        testProject,
        leadUser
      );

      expect(result.resolvedUsers.length).toBe(1);
      expect(result.resolvedUsers[0].uid).toBe(memberA.uid);
      expect(result.resolvedUsers[0].email).toBe('rajpandith@gmail.com');
    });

    it('prevents commenter from receiving notification for self-mention', () => {
      const text = '@rajpandith note to self: double check this';
      const result = resolveCommentMentions(
        text,
        [adminUser, leadUser, memberA, memberB],
        testProject,
        memberA // commenter is memberA
      );

      expect(result.resolvedUsers.length).toBe(0);
    });

    it('flags ambiguous shorthand mentions and avoids notifying the wrong user', () => {
      const user1: UserProfile = {
        uid: 'u1',
        email: 'alex.one@ojix.local',
        displayName: 'Alex One',
        role: 'member',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      };
      const user2: UserProfile = {
        uid: 'u2',
        email: 'alex.two@ojix.local',
        displayName: 'Alex Two',
        role: 'member',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      };

      const result = resolveCommentMentions('@alex can you check this', [user1, user2], testProject, leadUser);
      expect(result.ambiguousTokens).toContain('alex');
      expect(result.resolvedUsers.length).toBe(0);
    });

    it('deduplicates multiple mentions of the same user in one comment', () => {
      const text = '@rajpandith check this and @rajpandith also check that';
      const result = resolveCommentMentions(
        text,
        [adminUser, leadUser, memberA, memberB],
        testProject,
        leadUser
      );

      expect(result.resolvedUsers.length).toBe(1);
      expect(result.resolvedUsers[0].uid).toBe(memberA.uid);
    });

    it('creates persistent notification with comment preview and task context upon comment save', async () => {
      const commentText = '@rajpandith please review the authentication changes before merging.';
      await auditService.addComment(testTask.id, testProject.id, commentText, leadUser);

      const notifs = storageEngine.getNotifications(memberA);
      const mentionNotif = notifs.find(n => n.type === 'TASK_COMMENT_MENTION');
      expect(mentionNotif).toBeDefined();
      expect(mentionNotif?.title).toBe('You were mentioned in a task comment');
      expect(mentionNotif?.body).toContain('Marcus Lead mentioned you in a comment on "Implement Login API"');
      expect(mentionNotif?.commentPreview).toBe(commentText);
      expect(mentionNotif?.taskId).toBe(testTask.id);
      expect(mentionNotif?.projectId).toBe(testProject.id);
    });

    it('does not create mention notification if comment fails to save (e.g. viewer restriction)', async () => {
      const commentText = '@rajpandith viewer attempt';
      await expect(
        auditService.addComment(testTask.id, testProject.id, commentText, viewerUser)
      ).rejects.toThrow(/Viewers cannot post task notes/);

      const notifs = storageEngine.getNotifications(memberA);
      expect(notifs.some(n => n.type === 'TASK_COMMENT_MENTION')).toBe(false);
    });

    it('provides autocomplete suggestions excluding inactive accounts and commenter', () => {
      const suggestions = getMentionSuggestions(
        'raj',
        [adminUser, leadUser, memberA, memberB, blockedUser],
        testProject,
        leadUser
      );

      expect(suggestions.some(u => u.uid === memberA.uid)).toBe(true);
      expect(suggestions.some(u => u.uid === leadUser.uid)).toBe(false); // excludes commenter
      expect(suggestions.some(u => u.status === 'blocked')).toBe(false); // excludes blocked
    });
  });

  describe('4. User Blocking and Account Status Notifications', () => {
    it('creates USER_BLOCKED notification for blocked user and confirmation for admin', () => {
      storageEngine.setUserStatus(memberA.uid, 'blocked', adminUser);

      const notifsA = storageEngine.getNotifications(memberA);
      const blockedNotifA = notifsA.find(n => n.type === 'USER_BLOCKED');
      expect(blockedNotifA).toBeDefined();
      expect(blockedNotifA?.title).toBe('Account access restricted');
      expect(blockedNotifA?.body).toContain('Your workspace account has been blocked by an administrator');

      // Admin gets confirmation
      const notifsAdmin = storageEngine.getNotifications(adminUser);
      const adminConfirm = notifsAdmin.find(
        n => n.type === 'USER_BLOCKED' && n.title === 'User account blocked'
      );
      expect(adminConfirm).toBeDefined();
    });

    it('prohibits blocked users from sending direct messages on the server', async () => {
      await expect(
        directMessageService.sendMessage(
          { recipientId: memberB.uid, body: 'Hello from blocked user' },
          blockedUser
        )
      ).rejects.toThrow(/blocked/i);
    });
  });

  describe('5. Direct Messaging Between Users', () => {
    it('allows active users to send 1-on-1 direct messages and creates recipient notification', async () => {
      const msg = await directMessageService.sendMessage(
        {
          recipientId: memberA.uid,
          subject: 'Review Schedule',
          body: 'Can we sync at 3pm today regarding the authentication tasks?',
        },
        leadUser
      );

      expect(msg.id).toBeDefined();
      expect(msg.senderId).toBe(leadUser.uid);
      expect(msg.recipientId).toBe(memberA.uid);
      expect(msg.isRead).toBe(false);

      // Recipient receives inbox notification for DM
      const notifsA = storageEngine.getNotifications(memberA);
      const dmNotif = notifsA.find(n => n.type === 'DIRECT_MESSAGE_RECEIVED');
      expect(dmNotif).toBeDefined();
      expect(dmNotif?.title).toBe('New message: Review Schedule');
      expect(dmNotif?.body).toContain('Can we sync at 3pm today');
    });

    it('restricts direct message access to conversation participants only', async () => {
      const msg = await directMessageService.sendMessage(
        { recipientId: memberA.uid, body: 'Confidential conversation' },
        leadUser
      );

      // Member B attempts to read this conversation
      const convsMemberB = directMessageService.getConversations(memberB);
      expect(convsMemberB.some(c => c.id === msg.conversationId)).toBe(false);

      const msgsMemberB = directMessageService.getMessages(memberB, msg.conversationId);
      expect(msgsMemberB.length).toBe(0);
    });

    it('validates message length and content', async () => {
      await expect(
        directMessageService.sendMessage({ recipientId: memberA.uid, body: '   ' }, leadUser)
      ).rejects.toThrow(/Message body cannot be empty/);

      const tooLong = 'a'.repeat(2001);
      await expect(
        directMessageService.sendMessage({ recipientId: memberA.uid, body: tooLong }, leadUser)
      ).rejects.toThrow(/Message body cannot exceed 2000 characters/);
    });
  });

  describe('6. Read/Unread State Persistence and Deduplication', () => {
    it('marks individual notifications as read and updates unread count', () => {
      notificationService.notifyProjectMembership(testProject, memberA, 'added_member', leadUser);

      const unreadBefore = notificationService.getUnreadCount(memberA);
      expect(unreadBefore).toBeGreaterThan(0);

      const notifs = notificationService.getNotifications(memberA);
      notificationService.markAsRead(notifs[0].id, memberA);

      const unreadAfter = notificationService.getUnreadCount(memberA);
      expect(unreadAfter).toBe(unreadBefore - 1);
    });

    it('marks all notifications as read at once', () => {
      notificationService.notifyProjectMembership(testProject, memberA, 'added_member', leadUser);
      notificationService.notifyProjectMembership(testProject, memberA, 'assigned_lead', adminUser);

      expect(notificationService.getUnreadCount(memberA)).toBeGreaterThanOrEqual(2);

      notificationService.markAllAsRead(memberA);
      expect(notificationService.getUnreadCount(memberA)).toBe(0);
    });

    it('enforces deduplication key to prevent repeated duplicate notifications', () => {
      const notif1 = {
        id: 'notif-dup-1',
        recipientUserId: memberA.uid,
        actorUserId: leadUser.uid,
        type: 'PROJECT_ASSIGNED' as const,
        title: 'Project Assigned',
        body: 'You are lead',
        entityType: 'project' as const,
        entityId: testProject.id,
        isRead: false,
        createdAt: new Date().toISOString(),
        deduplicationKey: 'dup-test-key-123',
      };

      const notif2 = {
        ...notif1,
        id: 'notif-dup-2',
      };

      storageEngine.addNotification(notif1);
      storageEngine.addNotification(notif2); // Duplicate key

      const allNotifs = storageEngine.getNotifications(memberA);
      const matches = allNotifs.filter(n => n.deduplicationKey === 'dup-test-key-123');
      expect(matches.length).toBe(1);
    });

    it('populates task and comment metadata so clicking anywhere on the row redirects to where the task comment message is', () => {
      notificationService.notifyTaskCommentMention(
        testTask,
        testProject,
        '@rajpandith Please review the frontend auth flow',
        'comment-auth-999',
        memberA,
        leadUser
      );

      const notifs = storageEngine.getNotifications(memberA);
      const commentNotif = notifs.find(n => n.type === 'TASK_COMMENT_MENTION');
      expect(commentNotif).toBeDefined();
      expect(commentNotif?.projectId).toBe(testProject.id);
      expect(commentNotif?.taskId).toBe(testTask.id);
      expect(commentNotif?.commentId).toBe('comment-auth-999');
      expect(commentNotif?.title).toContain('You were mentioned');
    });

    it('populates task reassignment metadata so clicking anywhere on the row redirects to the task', () => {
      notificationService.notifyTaskAssigned(
        testTask,
        testProject,
        memberA,
        leadUser,
        true // isReassignment
      );

      const notifs = storageEngine.getNotifications(memberA);
      const reassignNotif = notifs.find(n => n.type === 'TASK_REASSIGNED');
      expect(reassignNotif).toBeDefined();
      expect(reassignNotif?.title).toBe('Task reassigned to you');
      expect(reassignNotif?.projectId).toBe(testProject.id);
      expect(reassignNotif?.taskId).toBe(testTask.id);
      expect(reassignNotif?.body).toContain('reassigned task');
    });
  });
});

