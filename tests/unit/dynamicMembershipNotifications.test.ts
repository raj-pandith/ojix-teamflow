import { describe, it, expect, beforeEach, vi } from 'vitest';
import { storageEngine } from '../../src/services/storageEngine';
import { projectService } from '../../src/services/projectService';
import { taskService } from '../../src/services/taskService';
import { notificationService } from '../../src/services/notificationService';
import { PushBackend } from '../../server/pushBackend';
import { UserProfile } from '../../src/types/auth';
import { Project } from '../../src/types/project';

describe('Dynamic Membership and Notification Lifecycle', () => {
  const now = new Date().toISOString();

  // Baseline workspace users
  const adminUser: UserProfile = {
    uid: 'u-dyn-admin',
    email: 'admin@ojix.local',
    displayName: 'Alex Admin',
    role: 'workspace_admin',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  const projectLead: UserProfile = {
    uid: 'u-dyn-lead',
    email: 'lead@ojix.local',
    displayName: 'Sarah Lead',
    role: 'project_lead',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  const existingMember: UserProfile = {
    uid: 'u-dyn-existing-member',
    email: 'marcus@ojix.local',
    displayName: 'Marcus Member',
    role: 'member',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  let testProject: Project;
  let pushBackend: PushBackend;

  beforeEach(() => {
    vi.restoreAllMocks();

    pushBackend = new PushBackend({
      publicKey: 'BKNdlGALj-gJ2hcGKNgGstIbXdKPnfgWBnqIhMxCYSZsIwRdOAvHE0NsVI8O-a_h2tc2j69o-Qt_J6Y4xrL_FDg',
      privateKey: 'woAhCeuUn8sqOkJgrCHvVfXsvKJDz-ZghBXrq-CeBvk',
      subject: 'mailto:admin@ojix.local',
    });

    storageEngine.initialize(true);

    testProject = {
      id: `proj-dyn-${Date.now().toString(36)}`,
      workspaceId: 'ws-ojix-main',
      name: 'Dynamic Team Execution Engine',
      objective: 'Verify dynamic membership and notification delivery',
      status: 'active',
      ownerId: projectLead.uid,
      startDate: '2026-10-01',
      dueDate: '2026-12-31',
      memberIds: [projectLead.uid, existingMember.uid],
      createdAt: now,
      updatedAt: now,
    };

    (storageEngine as any).users = [adminUser, projectLead, existingMember];
    (storageEngine as any).projects = [testProject];
    (storageEngine as any).tasks = [];
    (storageEngine as any).notifications = [];
    (storageEngine as any).directMessages = [];
  });

  it('1. A newly added Member receives a task-assignment notification without a backend restart', async () => {
    // Dynamically create a new Member account while the application is running
    const newMember = storageEngine.addUser(
      {
        uid: 'u-dyn-new-member',
        displayName: 'Diana Dynamic',
        email: 'diana@ojix.local',
        role: 'member',
      },
      adminUser
    );

    // Dynamically add the new member to the project team
    const updatedProject = await projectService.addTeamMember(testProject.id, newMember.uid, projectLead);
    expect(updatedProject.memberIds).toContain(newMember.uid);

    // The new member should immediately receive the PROJECT_MEMBER_ADDED notification
    const initialNotifs = notificationService.getNotifications(newMember);
    expect(initialNotifs.some(n => n.type === 'PROJECT_MEMBER_ADDED' && n.projectId === testProject.id)).toBe(true);

    // Project lead assigns a task to the newly added member
    const newTask = await taskService.createTask(
      testProject.id,
      {
        title: 'Implement dynamic cache invalidation',
        description: 'Ensure recipient resolution is reactive',
        status: 'todo',
        priority: 'high',
        dueDate: '2026-11-15',
        assigneeId: newMember.uid,
      },
      projectLead
    );

    expect(newTask.assigneeId).toBe(newMember.uid);

    // Immediately resolve notifications for the new member
    const newMemberNotifs = notificationService.getNotifications(newMember);
    const assignmentNotif = newMemberNotifs.find(n => n.type === 'TASK_ASSIGNED' && n.taskId === newTask.id);

    expect(assignmentNotif).toBeDefined();
    expect(assignmentNotif?.recipientUserId).toBe(newMember.uid);
    expect(assignmentNotif?.actorUserId).toBe(projectLead.uid);
    expect(assignmentNotif?.title).toContain('New task assigned');
  });

  it('2. A newly added Viewer receives only notifications permitted by existing business rules', async () => {
    // Dynamically add a Viewer account and add to project
    const newViewer = storageEngine.addUser(
      {
        uid: 'u-dyn-viewer',
        displayName: 'Victor Viewer',
        email: 'victor@ojix.local',
        role: 'viewer',
      },
      adminUser,
      testProject.id
    );

    // Viewer immediately receives PROJECT_MEMBER_ADDED indicating read-only access
    const viewerNotifs = notificationService.getNotifications(newViewer);
    const welcomeNotif = viewerNotifs.find(n => n.type === 'PROJECT_MEMBER_ADDED');
    expect(welcomeNotif).toBeDefined();
    expect(welcomeNotif?.body).toContain('read-only access');

    // Attempting to assign a task to the newly added Viewer must be strictly rejected
    await expect(
      taskService.createTask(
        testProject.id,
        {
          title: 'Attempted assignment to viewer',
          description: '',
          status: 'todo',
          priority: 'medium',
          dueDate: '2026-11-20',
          assigneeId: newViewer.uid,
        },
        projectLead
      )
    ).rejects.toThrow(/Viewers have read-only permissions and cannot receive task assignments/);

    // Viewer can still receive permitted project notifications such as PROJECT_DELETED
    await projectService.deleteProject(testProject.id, adminUser, 'Sprint completed');
    const afterDeleteNotifs = notificationService.getNotifications(newViewer);
    const deleteNotif = afterDeleteNotifs.find(n => n.type === 'PROJECT_DELETED');
    expect(deleteNotif).toBeDefined();
    expect(deleteNotif?.recipientUserId).toBe(newViewer.uid);
  });

  it('3. Newly added users can receive direct messages and their corresponding notifications', async () => {
    const newUser = storageEngine.addUser(
      {
        uid: 'u-dyn-chat-user',
        displayName: 'Chloe Chat',
        email: 'chloe@ojix.local',
        role: 'member',
      },
      adminUser
    );

    // Existing member sends a direct message to the newly added user
    const dm = await storageEngine.sendDirectMessage(
      {
        recipientId: newUser.uid,
        subject: 'Welcome to the team',
        body: 'Glad to have you on board! Check the sprint board.',
      },
      existingMember
    );

    expect(dm.recipientId).toBe(newUser.uid);

    // Recipient receives direct message
    const messages = storageEngine.getDirectMessages(newUser);
    expect(messages.some(m => m.id === dm.id)).toBe(true);

    // Recipient immediately receives DIRECT_MESSAGE_RECEIVED notification
    const notifs = notificationService.getNotifications(newUser);
    const dmNotif = notifs.find(n => n.type === 'DIRECT_MESSAGE_RECEIVED');
    expect(dmNotif).toBeDefined();
    expect(dmNotif?.recipientUserId).toBe(newUser.uid);
    expect(dmNotif?.title).toContain('New message: Welcome to the team');
  });

  it('4. Newly added users see their eligible in-app notifications and correct unread counts', async () => {
    const newUser = storageEngine.addUser(
      {
        uid: 'u-dyn-unread-user',
        displayName: 'Uma Unread',
        email: 'uma@ojix.local',
        role: 'member',
      },
      adminUser
    );

    expect(notificationService.getUnreadCount(newUser)).toBe(0);

    // Add to project -> 1 unread notification
    await projectService.addTeamMember(testProject.id, newUser.uid, projectLead);
    expect(notificationService.getUnreadCount(newUser)).toBe(1);

    // Assign a task -> 2 unread notifications
    const task = await taskService.createTask(
      testProject.id,
      {
        title: 'Verify unread counts',
        description: '',
        status: 'todo',
        priority: 'urgent',
        dueDate: '2026-11-10',
        assigneeId: newUser.uid,
      },
      projectLead
    );

    expect(notificationService.getUnreadCount(newUser)).toBe(2);

    // Send a DM -> 3 unread notifications
    await storageEngine.sendDirectMessage(
      {
        recipientId: newUser.uid,
        body: 'Urgent task assigned to you.',
      },
      projectLead
    );

    expect(notificationService.getUnreadCount(newUser)).toBe(3);

    // Mark task notification as read -> count drops to 2
    const notifs = notificationService.getNotifications(newUser);
    const taskNotif = notifs.find(n => n.taskId === task.id)!;
    notificationService.markAsRead(taskNotif.id, newUser);
    expect(notificationService.getUnreadCount(newUser)).toBe(2);

    // Mark all as read -> count drops to 0
    notificationService.markAllAsRead(newUser);
    expect(notificationService.getUnreadCount(newUser)).toBe(0);
  });

  it('5. Browser push works for newly added users who have granted permission and registered a valid subscription', async () => {
    const newUser = storageEngine.addUser(
      {
        uid: 'u-dyn-push-user',
        displayName: 'Peter Push',
        email: 'peter@ojix.local',
        role: 'member',
      },
      adminUser
    );

    // Newly added user registers browser push subscription
    const sub = pushBackend.registerSubscription({
      userId: newUser.uid,
      endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/dynamic-peter-device-1',
      keys: {
        p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QT9t0VU9G8-NjWvSXhg0...',
        auth: 'tBHItJI5svbpez7KI4CCXg==',
      },
      deviceLabel: 'Peter Work Laptop',
    });

    expect(sub.userId).toBe(newUser.uid);
    expect(pushBackend.getSubscriptionsForUser(newUser.uid).length).toBe(1);

    // Unrelated user has no subscriptions
    expect(pushBackend.getSubscriptionsForUser(existingMember.uid).length).toBe(0);

    // Mock webpush.sendNotification
    const sendNotificationSpy = vi.spyOn(pushBackend as any, 'sendPushToSubscription').mockResolvedValue({
      subscriptionId: sub.id,
      endpoint: sub.endpoint,
      statusCode: 201,
      success: true,
    });

    // Send push to newly added user
    const results = await pushBackend.sendPushToUser(newUser.uid, {
      id: 'push-task-1',
      title: 'Task Assigned',
      body: 'You have a new task assigned.',
    });

    expect(results.length).toBe(1);
    expect(results[0].success).toBe(true);
    expect(sendNotificationSpy).toHaveBeenCalledTimes(1);
  });

  it('6. Users without push permission still receive persisted in-app notifications', async () => {
    const newUser = storageEngine.addUser(
      {
        uid: 'u-dyn-no-push-user',
        displayName: 'Noah NoPush',
        email: 'noah@ojix.local',
        role: 'member',
      },
      adminUser
    );

    // Confirm user has 0 push subscriptions registered
    expect(pushBackend.getSubscriptionsForUser(newUser.uid).length).toBe(0);

    // Add to project
    await projectService.addTeamMember(testProject.id, newUser.uid, projectLead);

    // PushBackend sendPushToUser returns empty array safely without error or misdirection
    const pushResults = await pushBackend.sendPushToUser(newUser.uid, {
      id: 'notif-test',
      title: 'Hello Noah',
      body: 'Welcome to the project.',
    });
    expect(pushResults).toEqual([]);

    // Persisted in-app notification is still safely stored and retrievable
    const notifs = notificationService.getNotifications(newUser);
    expect(notifs.length).toBe(1);
    expect(notifs[0].type).toBe('PROJECT_MEMBER_ADDED');
    expect(notifs[0].recipientUserId).toBe(newUser.uid);
  });

  it('7. Existing members continue receiving notifications correctly without interference or duplication', async () => {
    // Existing member starts with 0 notifications
    expect(notificationService.getNotifications(existingMember).length).toBe(0);

    // Dynamically add a new member
    const newMember = storageEngine.addUser(
      {
        uid: 'u-dyn-extra-member',
        displayName: 'Extra Member',
        email: 'extra@ojix.local',
        role: 'member',
      },
      adminUser
    );
    await projectService.addTeamMember(testProject.id, newMember.uid, projectLead);

    // Existing member should NOT receive newMember's PROJECT_MEMBER_ADDED notification
    expect(notificationService.getNotifications(existingMember).length).toBe(0);

    // Assign task to existing member
    await taskService.createTask(
      testProject.id,
      {
        title: 'Task for existing member',
        description: '',
        status: 'todo',
        priority: 'high',
        dueDate: '2026-11-12',
        assigneeId: existingMember.uid,
      },
      projectLead
    );

    // Existing member receives their notification
    const existingNotifs = notificationService.getNotifications(existingMember);
    expect(existingNotifs.length).toBe(1);
    expect(existingNotifs[0].recipientUserId).toBe(existingMember.uid);
    expect(existingNotifs[0].type).toBe('TASK_ASSIGNED');

    // New member does NOT receive existing member's task notification
    const newMemberNotifs = notificationService.getNotifications(newMember);
    expect(newMemberNotifs.some(n => n.type === 'TASK_ASSIGNED')).toBe(false);
  });

  it('8. Adding the same member again is idempotent and does not generate duplicate notifications', async () => {
    const newMember = storageEngine.addUser(
      {
        uid: 'u-dyn-idempotent-member',
        displayName: 'Ivan Idempotent',
        email: 'ivan@ojix.local',
        role: 'member',
      },
      adminUser
    );

    // First addition
    await projectService.addTeamMember(testProject.id, newMember.uid, projectLead);
    const notifsAfterFirst = notificationService.getNotifications(newMember);
    expect(notifsAfterFirst.filter(n => n.type === 'PROJECT_MEMBER_ADDED').length).toBe(1);

    // Second addition (e.g., repeated click or concurrent service trigger)
    await projectService.addTeamMember(testProject.id, newMember.uid, projectLead);
    const notifsAfterSecond = notificationService.getNotifications(newMember);
    expect(notifsAfterSecond.filter(n => n.type === 'PROJECT_MEMBER_ADDED').length).toBe(1);
  });

  it('9. Removing a member or changing their role updates notification eligibility appropriately', async () => {
    const dynamicUser = storageEngine.addUser(
      {
        uid: 'u-dyn-role-user',
        displayName: 'Rachel Role',
        email: 'rachel@ojix.local',
        role: 'member',
      },
      adminUser
    );

    await projectService.addTeamMember(testProject.id, dynamicUser.uid, projectLead);

    // As a member, task assignment is permitted
    const task1 = await taskService.createTask(
      testProject.id,
      {
        title: 'First member task',
        description: '',
        status: 'todo',
        priority: 'medium',
        dueDate: '2026-11-18',
        assigneeId: dynamicUser.uid,
      },
      projectLead
    );
    expect(task1.assigneeId).toBe(dynamicUser.uid);

    // Change Rachel's role from 'member' to 'viewer'
    storageEngine.updateUser(dynamicUser.uid, { role: 'viewer' }, adminUser);

    // Dynamic role notification dispatched
    const roleNotifs = notificationService.getNotifications(dynamicUser);
    expect(roleNotifs.some(n => n.type === 'PROJECT_ROLE_CHANGED')).toBe(true);

    // Now, subsequent task assignment must be rejected immediately without restart
    await expect(
      taskService.createTask(
        testProject.id,
        {
          title: 'Second task when viewer',
          description: '',
          status: 'todo',
          priority: 'medium',
          dueDate: '2026-11-19',
          assigneeId: dynamicUser.uid,
        },
        projectLead
      )
    ).rejects.toThrow(/Viewers have read-only permissions and cannot receive task assignments/);

    // Remove Rachel from the project
    await projectService.removeTeamMember(testProject.id, dynamicUser.uid, projectLead, [
      { taskId: task1.id, newAssigneeId: existingMember.uid },
    ]);

    // Rachel receives PROJECT_MEMBER_REMOVED notification
    const afterRemovalNotifs = notificationService.getNotifications(dynamicUser);
    expect(afterRemovalNotifs.some(n => n.type === 'PROJECT_MEMBER_REMOVED')).toBe(true);
  });

  it('10. Membership changes do not cause recursive events, stale recipient caches, or duplicate listeners', async () => {
    let listenerCallCount = 0;
    const unsub = storageEngine.subscribe(() => {
      listenerCallCount++;
    });

    const dynamicMember = storageEngine.addUser(
      {
        uid: 'u-dyn-listener-test',
        displayName: 'Leo Listener',
        email: 'leo@ojix.local',
        role: 'member',
      },
      adminUser
    );

    await projectService.addTeamMember(testProject.id, dynamicMember.uid, projectLead);

    const callsAfterAdd = listenerCallCount;
    expect(callsAfterAdd).toBeGreaterThan(0);

    // Re-adding the same member should be a no-op and NOT trigger extra notifications or listener runs
    await projectService.addTeamMember(testProject.id, dynamicMember.uid, projectLead);
    expect(listenerCallCount).toBe(callsAfterAdd);

    // Clean up subscription
    unsub();
    const callsAfterUnsub = listenerCallCount;

    // Further action does not invoke unsubscribed listener
    storageEngine.addUser(
      {
        uid: 'u-dyn-another',
        displayName: 'Another User',
        email: 'another@ojix.local',
        role: 'member',
      },
      adminUser
    );
    expect(listenerCallCount).toBe(callsAfterUnsub);
  });
});
