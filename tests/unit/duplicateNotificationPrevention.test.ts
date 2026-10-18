import { describe, it, expect, beforeEach, vi } from 'vitest';
import { storageEngine } from '../../src/services/storageEngine';
import { notificationService } from '../../src/services/notificationService';
import { UserProfile } from '../../src/types/auth';
import { Project } from '../../src/types/project';
import { Task } from '../../src/types/task';

describe('OJIX TeamFlow — Duplicate Notification Prevention & Strict Idempotency', () => {
  const timestamp = new Date().toISOString();

  // Test personas
  const adminUser: UserProfile = {
    uid: 'u-admin-dedup',
    email: 'admin@ojix.local',
    displayName: 'Alex Admin',
    role: 'workspace_admin',
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const leadUser: UserProfile = {
    uid: 'u-lead-dedup',
    email: 'lead@ojix.local',
    displayName: 'Marcus Lead',
    role: 'project_lead',
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const memberA: UserProfile = {
    uid: 'u-member-alice',
    email: 'alice@ojix.local',
    displayName: 'Alice Engineer',
    role: 'member',
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const memberB: UserProfile = {
    uid: 'u-member-bob',
    email: 'bob@ojix.local',
    displayName: 'Bob Designer',
    role: 'member',
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const memberC: UserProfile = {
    uid: 'u-member-charlie',
    email: 'charlie@ojix.local',
    displayName: 'Charlie QA',
    role: 'member',
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  let testProject: Project;
  let testTask: Task;

  beforeEach(() => {
    // Re-initialize storage with test fixtures
    storageEngine.initialize(true);

    // Register all personas into storage engine
    const testUsers = [adminUser, leadUser, memberA, memberB, memberC];
    const existingUsers = storageEngine.getUsers();
    for (const user of testUsers) {
      if (!existingUsers.some(u => u.uid === user.uid)) {
        (storageEngine as any).users.push(user);
      }
    }

    // Clean up notifications for test isolation
    (storageEngine as any).notifications = [];
    (storageEngine as any).inFlightNotificationKeys.clear();

    // Create fresh test project
    testProject = {
      id: 'proj-dedup-001',
      workspaceId: 'ws-ojix-main',
      name: 'Cloud Infrastructure Upgrade',
      objective: 'Zero-downtime database and microservice modernization',
      status: 'active',
      ownerId: leadUser.uid,
      memberIds: [leadUser.uid],
      startDate: timestamp,
      dueDate: new Date(Date.now() + 86400000 * 30).toISOString(),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    storageEngine.saveProject(testProject, adminUser);

    // Create fresh unassigned test task
    testTask = {
      id: 'task-dedup-001',
      workspaceId: 'ws-ojix-main',
      projectId: testProject.id,
      title: 'Configure Terraform State Backend',
      description: 'Setup encrypted S3 backend with DynamoDB locking',
      status: 'todo',
      priority: 'high',
      assigneeId: null,
      createdBy: leadUser.uid,
      dueDate: new Date(Date.now() + 86400000 * 7).toISOString(),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    storageEngine.saveTask(testTask, leadUser);
  });

  // 1. Assigning a project to a new member creates exactly one notification.
  it('1. Assigning a project to a new member creates exactly one notification', () => {
    const notifsBefore = storageEngine.getNotifications(memberA);
    expect(notifsBefore).toHaveLength(0);

    notificationService.notifyProjectMembership(
      testProject,
      memberA,
      'added_member',
      adminUser
    );

    const notifsAfter = storageEngine.getNotifications(memberA);
    expect(notifsAfter).toHaveLength(1);
    expect(notifsAfter[0].recipientUserId).toBe(memberA.uid);
    expect(notifsAfter[0].projectId).toBe(testProject.id);
    expect(notifsAfter[0].type).toBe('PROJECT_MEMBER_ADDED');
  });

  // 2. Repeating the same assignment request does not create another notification.
  it('2. Repeating the same assignment request does not create another notification (idempotency)', () => {
    // First assignment
    notificationService.notifyProjectMembership(
      testProject,
      memberA,
      'added_member',
      adminUser
    );

    // Repeated identical assignment request
    notificationService.notifyProjectMembership(
      testProject,
      memberA,
      'added_member',
      adminUser
    );

    // Should NOT create a new duplicate notification
    const allMemberANotifs = storageEngine.getNotifications(memberA);
    expect(allMemberANotifs).toHaveLength(1);
    expect(allMemberANotifs[0].id).toBe(`notif-pmem-${testProject.id}-${memberA.uid}-added_member`);
  });

  // 3. Concurrent duplicate assignment requests do not create duplicate notifications.
  it('3. Concurrent duplicate assignment requests do not create duplicate notifications', async () => {
    // Dispatch 5 concurrent requests simultaneously
    await Promise.all([
      Promise.resolve(notificationService.notifyProjectMembership(testProject, memberB, 'added_member', adminUser)),
      Promise.resolve(notificationService.notifyProjectMembership(testProject, memberB, 'added_member', adminUser)),
      Promise.resolve(notificationService.notifyProjectMembership(testProject, memberB, 'added_member', adminUser)),
      Promise.resolve(notificationService.notifyProjectMembership(testProject, memberB, 'added_member', adminUser)),
      Promise.resolve(notificationService.notifyProjectMembership(testProject, memberB, 'added_member', adminUser)),
    ]);

    // Database must contain strictly 1 notification for memberB
    const memberBNotifs = storageEngine.getNotifications(memberB);
    expect(memberBNotifs).toHaveLength(1);
    expect(memberBNotifs[0].recipientUserId).toBe(memberB.uid);
  });

  // 4. A genuine reassignment generates the appropriate notification according to existing business rules.
  it('4. A genuine reassignment generates the appropriate notification with updated role', () => {
    // Initial assignment as member
    notificationService.notifyProjectMembership(testProject, memberA, 'added_member', adminUser);

    // Genuine reassignment / role update to project_lead
    notificationService.notifyProjectMembership(
      testProject,
      memberA,
      'assigned_lead',
      adminUser
    );

    const memberANotifs = storageEngine.getNotifications(memberA);
    // Should have both: initial addition and genuine role change
    expect(memberANotifs).toHaveLength(2);
    expect(memberANotifs.some(n => n.type === 'PROJECT_MEMBER_ADDED')).toBe(true);
    expect(memberANotifs.some(n => n.type === 'PROJECT_ASSIGNED')).toBe(true);
  });

  // 5. Assigning a project to different members notifies the correct recipients.
  it('5. Assigning a project to different members notifies the correct recipients', () => {
    notificationService.notifyProjectMembership(testProject, memberA, 'added_member', adminUser);
    notificationService.notifyProjectMembership(testProject, memberB, 'added_member', adminUser);
    notificationService.notifyProjectMembership(testProject, memberC, 'added_member', adminUser);

    expect(storageEngine.getNotifications(memberA)).toHaveLength(1);
    expect(storageEngine.getNotifications(memberB)).toHaveLength(1);
    expect(storageEngine.getNotifications(memberC)).toHaveLength(1);

    expect(storageEngine.getNotifications(memberA)[0].recipientUserId).toBe(memberA.uid);
    expect(storageEngine.getNotifications(memberB)[0].recipientUserId).toBe(memberB.uid);
    expect(storageEngine.getNotifications(memberC)[0].recipientUserId).toBe(memberC.uid);
  });

  // 6. Marking a notification as read does not create a new notification.
  it('6. Marking a notification as read does not create a new notification', () => {
    notificationService.notifyProjectMembership(
      testProject,
      memberA,
      'added_member',
      adminUser
    );

    const notifsBefore = storageEngine.getNotifications(memberA);
    expect(notifsBefore).toHaveLength(1);
    expect(notifsBefore[0].isRead).toBe(false);

    // Mark as read
    storageEngine.markNotificationRead(notifsBefore[0].id, memberA);

    // Verify status changed to read without any new notification being spawned
    const notifsAfter = storageEngine.getNotifications(memberA);
    expect(notifsAfter).toHaveLength(1);
    expect(notifsAfter[0].id).toBe(notifsBefore[0].id);
    expect(notifsAfter[0].isRead).toBe(true);
  });

  // 7. WebSocket / SSE reconnects and frontend rerenders do not duplicate persisted notifications or event subscriptions.
  it('7. Reconnects and multiple listeners do not duplicate persisted notifications', () => {
    notificationService.notifyProjectMembership(testProject, memberA, 'added_member', adminUser);

    // Simulate multiple component mounts / subscription calls
    let callbackCount = 0;
    const unsub1 = storageEngine.subscribe(() => { callbackCount++; });
    const unsub2 = storageEngine.subscribe(() => { callbackCount++; });
    const unsub3 = storageEngine.subscribe(() => { callbackCount++; });

    // Repeated sync trigger
    (storageEngine as any).setupCrossTabSync();
    (storageEngine as any).setupCrossTabSync();

    // Check that notifications count remains strictly 1
    const notifs = storageEngine.getNotifications(memberA);
    expect(notifs).toHaveLength(1);

    // Clean up
    unsub1();
    unsub2();
    unsub3();
  });

  // 8. Existing task assignment notifications continue working correctly with deduplication.
  it('8. Existing task assignment notifications continue working with deduplication', () => {
    // Add memberA to project so they are eligible for task assignment
    storageEngine.addTeamMember(testProject.id, memberA.uid, adminUser);

    // Assign task
    notificationService.notifyTaskAssigned(testTask, testProject, memberA, leadUser, false);

    // Re-triggering duplicate task assignment
    notificationService.notifyTaskAssigned(testTask, testProject, memberA, leadUser, false);

    const taskNotifs = storageEngine.getNotifications(memberA).filter(n => n.type === 'TASK_ASSIGNED');
    expect(taskNotifs).toHaveLength(1);
    expect(taskNotifs[0].type).toBe('TASK_ASSIGNED');
    expect(taskNotifs[0].taskId).toBe(testTask.id);
  });

  // 9. Unrelated users cannot access another member's notifications.
  it('9. Unrelated users cannot access another member\'s notifications (Tenant / Recipient RBAC Isolation)', () => {
    notificationService.notifyProjectMembership(testProject, memberA, 'added_member', adminUser);

    // memberA should see their notification
    const aliceNotifs = storageEngine.getNotifications(memberA);
    expect(aliceNotifs).toHaveLength(1);

    // memberB should see 0 notifications
    const bobNotifs = storageEngine.getNotifications(memberB);
    expect(bobNotifs).toHaveLength(0);

    // memberC should see 0 notifications
    const charlieNotifs = storageEngine.getNotifications(memberC);
    expect(charlieNotifs).toHaveLength(0);
  });

  // 10. The notification flow terminates normally, without recursive calls or unbounded event emissions.
  it('10. The notification flow terminates normally without recursive calls or unbounded loops', () => {
    let notifyCallCount = 0;
    const originalAddNotification = storageEngine.addNotification.bind(storageEngine);

    const spy = vi.spyOn(storageEngine, 'addNotification').mockImplementation((notif: any) => {
      notifyCallCount++;
      if (notifyCallCount > 10) {
        throw new Error('Infinite recursive loop detected in notification creation!');
      }
      return originalAddNotification(notif);
    });

    // Run project assignment through storageEngine.addTeamMember
    storageEngine.addTeamMember(
      testProject.id,
      memberA.uid,
      adminUser
    );

    // Should have executed exactly 1 notification creation call and stopped cleanly
    expect(notifyCallCount).toBe(1);
    expect(storageEngine.getNotifications(memberA)).toHaveLength(1);

    spy.mockRestore();
  });
});
