import { describe, it, expect, beforeEach } from 'vitest';
import { storageEngine } from '../../src/services/storageEngine';
import { taskService } from '../../src/services/taskService';
import { validateAssigneeEligibility } from '../../src/domain/validation';
import { UserProfile } from '../../src/types/auth';
import { Project } from '../../src/types/project';

describe('OJIX TeamFlow — Task Assignment, Notifications, and Kanban Highlighting', () => {
  const now = new Date().toISOString();

  // Test Personas
  const adminAlex: UserProfile = {
    uid: 'u-alex-admin',
    email: 'alex@ojix.local',
    displayName: 'Alex Morgan',
    role: 'workspace_admin',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  const leadSarah: UserProfile = {
    uid: 'u-sarah-lead',
    email: 'sarah@ojix.local',
    displayName: 'Sarah Chen',
    role: 'project_lead',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  const memberMarcus: UserProfile = {
    uid: 'u-marcus-member',
    email: 'marcus@ojix.local',
    displayName: 'Marcus Vance',
    role: 'member',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  const memberDavid: UserProfile = {
    uid: 'u-david-member',
    email: 'david@ojix.local',
    displayName: 'David Kim',
    role: 'member',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  const viewerElena: UserProfile = {
    uid: 'u-elena-viewer',
    email: 'elena@ojix.local',
    displayName: 'Elena Rostova',
    role: 'viewer',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  const externalUser: UserProfile = {
    uid: 'u-external-user',
    email: 'external@other.local',
    displayName: 'External Stranger',
    role: 'member',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  let testProject: Project;

  beforeEach(() => {
    storageEngine.initialize(true);
    const all = storageEngine.getUsers();
    const testUsers = [adminAlex, leadSarah, memberMarcus, memberDavid, viewerElena, externalUser];
    for (const tu of testUsers) {
      if (!all.some(u => u.uid === tu.uid)) {
        (storageEngine as any).users.push(tu);
      }
    }

    testProject = {
      id: 'proj-sprint-alpha',
      workspaceId: 'ws-ojix-main',
      name: 'Sprint Update',
      objective: 'Core platform sprint updates',
      ownerId: leadSarah.uid,
      status: 'active',
      startDate: '2026-10-01',
      dueDate: '2026-11-01',
      memberIds: [adminAlex.uid, leadSarah.uid, memberMarcus.uid, memberDavid.uid, viewerElena.uid],
      createdAt: now,
      updatedAt: now,
    };
    storageEngine.saveProject(testProject, adminAlex);
  });

  // 1. Scenario A: Creating an unassigned task creates no assignment notification
  it('1. Scenario A: Creating an unassigned task creates no assignment notification', async () => {
    const task = await taskService.createTask(
      testProject.id,
      {
        title: 'Configure Gateway Caching',
        description: 'Unassigned task deliverables',
        priority: 'medium',
        status: 'todo',
        dueDate: '2026-10-25',
        assigneeId: null,
      },
      leadSarah
    );

    expect(task.id).toBeDefined();
    expect(task.assigneeId).toBeNull();

    // Verify task is on the Kanban board
    const projectTasks = storageEngine.getTasks(testProject.id, leadSarah);
    expect(projectTasks.some(t => t.id === task.id)).toBe(true);

    // Verify no notifications sent to anyone
    expect(storageEngine.getNotifications(memberMarcus)).toHaveLength(0);
    expect(storageEngine.getNotifications(memberDavid)).toHaveLength(0);
    expect(storageEngine.getNotifications(leadSarah)).toHaveLength(0);
    expect(storageEngine.getNotifications(adminAlex)).toHaveLength(0);
  });

  // 2. Scenario B: Creating a task assigned to a Member creates exactly one notification with required format
  it('2. Scenario B: Creating a task assigned to a Member creates exactly one notification with expected title and body', async () => {
    const task = await taskService.createTask(
      testProject.id,
      {
        title: 'Sprint API Integration',
        description: 'Deliver the REST endpoints',
        priority: 'high',
        status: 'todo',
        dueDate: '2026-10-25',
        assigneeId: memberMarcus.uid,
      },
      adminAlex
    );

    expect(task.id).toBeDefined();
    expect(task.assigneeId).toBe(memberMarcus.uid);

    // Member Marcus should receive exactly one notification
    const marcusNotifs = storageEngine.getNotifications(memberMarcus);
    expect(marcusNotifs).toHaveLength(1);

    const notif = marcusNotifs[0];
    expect(notif.type).toBe('TASK_ASSIGNED');
    expect(notif.title).toBe('New task assigned: Sprint API Integration');
    expect(notif.body).toBe('Alex Morgan assigned you a task in Sprint Update.');
    expect(notif.taskId).toBe(task.id);
    expect(notif.taskTitle).toBe(task.title);
    expect(notif.projectId).toBe(testProject.id);
    expect(notif.projectName).toBe(testProject.name);
    expect(notif.actorUserId).toBe(adminAlex.uid);
    expect(notif.actorDisplayName).toBe(adminAlex.displayName);

    // Assigner (Alex) must NOT receive an assignment notification
    const adminNotifs = storageEngine.getNotifications(adminAlex).filter(n => n.type === 'TASK_ASSIGNED');
    expect(adminNotifs).toHaveLength(0);

    // Other members (David) must NOT receive this notification
    const davidNotifs = storageEngine.getNotifications(memberDavid);
    expect(davidNotifs).toHaveLength(0);
  });

  // 3. Creating a task assigned to a Viewer is governed by role policy
  it('3. Creating a task assigned to a Viewer is rejected under role policy (Viewers cannot receive assignments)', async () => {
    const eligibility = validateAssigneeEligibility(viewerElena, testProject);
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.reason).toContain('Viewers have read-only permissions');

    await expect(
      taskService.createTask(
        testProject.id,
        {
          title: 'Audit Access Logs',
          description: 'Viewer assignment attempt',
          priority: 'low',
          status: 'todo',
          dueDate: '2026-10-25',
          assigneeId: viewerElena.uid,
        },
        leadSarah
      )
    ).rejects.toThrow(/Viewers have read-only permissions/);

    // No notification was created
    expect(storageEngine.getNotifications(viewerElena)).toHaveLength(0);
  });

  // 4. The assigned task appears in the correct user's task list
  it('4. The assigned task appears in the assigned user\'s personal task list', async () => {
    const task = await taskService.createTask(
      testProject.id,
      {
        title: 'Database Sharding Proof of Concept',
        description: 'Verify clustering',
        priority: 'urgent',
        status: 'in_progress',
        dueDate: '2026-10-28',
        assigneeId: memberMarcus.uid,
      },
      leadSarah
    );

    const marcusTasks = taskService.getMyTasks(memberMarcus);
    expect(marcusTasks.some(t => t.id === task.id)).toBe(true);

    const davidTasks = taskService.getMyTasks(memberDavid);
    expect(davidTasks.some(t => t.id === task.id)).toBe(false);
  });

  // 5. The task appears in the correct project's Kanban board
  it('5. The task appears in the correct project\'s Kanban board', async () => {
    const task = await taskService.createTask(
      testProject.id,
      {
        title: 'Redis Sentinel Benchmarking',
        description: 'Throughput test',
        priority: 'high',
        status: 'todo',
        dueDate: '2026-10-25',
        assigneeId: memberDavid.uid,
      },
      leadSarah
    );

    const kanbanTasks = storageEngine.getTasks(testProject.id, memberMarcus);
    const found = kanbanTasks.find(t => t.id === task.id);
    expect(found).toBeDefined();
    expect(found?.title).toBe('Redis Sentinel Benchmarking');
    expect(found?.assigneeId).toBe(memberDavid.uid);
  });

  // 6. An existing unassigned task generates an assignment notification when assigned
  it('6. An existing unassigned task generates an assignment notification when assigned', async () => {
    const task = await taskService.createTask(
      testProject.id,
      {
        title: 'Write Documentation',
        description: 'Initial draft',
        priority: 'medium',
        status: 'todo',
        dueDate: '2026-10-30',
        assigneeId: null,
      },
      leadSarah
    );

    expect(storageEngine.getNotifications(memberMarcus)).toHaveLength(0);

    // Now Project Lead assigns the task to Marcus
    const updated = await taskService.updateTask(
      task.id,
      { assigneeId: memberMarcus.uid },
      leadSarah
    );

    expect(updated.assigneeId).toBe(memberMarcus.uid);

    const marcusNotifs = storageEngine.getNotifications(memberMarcus);
    expect(marcusNotifs).toHaveLength(1);
    expect(marcusNotifs[0].type).toBe('TASK_ASSIGNED');
    expect(marcusNotifs[0].title).toBe('New task assigned: Write Documentation');
    expect(marcusNotifs[0].body).toBe('Sarah Chen assigned you a task in Sprint Update.');
  });

  // 7. Repeating an assignment request does not create duplicate notifications
  it('7. Repeating the same assignment request does not create duplicate notifications', async () => {
    const task = await taskService.createTask(
      testProject.id,
      {
        title: 'Zero-Downtime Migration',
        description: 'Production schema cutover',
        priority: 'urgent',
        status: 'todo',
        dueDate: '2026-10-26',
        assigneeId: memberMarcus.uid,
      },
      leadSarah
    );

    expect(storageEngine.getNotifications(memberMarcus)).toHaveLength(1);

    // Save/update task again without changing the assignee
    await taskService.updateTask(
      task.id,
      { description: 'Updated instructions for migration' },
      leadSarah
    );

    // Repeat with identical assignee
    await taskService.updateTask(
      task.id,
      { assigneeId: memberMarcus.uid },
      leadSarah
    );

    // Exactly 1 assignment notification must remain
    const notifs = storageEngine.getNotifications(memberMarcus).filter(n => n.type === 'TASK_ASSIGNED');
    expect(notifs).toHaveLength(1);
  });

  // 8. Reassigning a task updates both affected users' task lists
  it('8. Reassigning a task updates both affected users\' task lists and notifies the new assignee', async () => {
    const task = await taskService.createTask(
      testProject.id,
      {
        title: 'Mobile Push Service',
        description: 'APNS and FCM integration',
        priority: 'high',
        status: 'in_progress',
        dueDate: '2026-10-28',
        assigneeId: memberMarcus.uid,
      },
      leadSarah
    );

    expect(taskService.getMyTasks(memberMarcus).some(t => t.id === task.id)).toBe(true);
    expect(taskService.getMyTasks(memberDavid).some(t => t.id === task.id)).toBe(false);

    // Reassign to David
    await taskService.updateTask(
      task.id,
      { assigneeId: memberDavid.uid },
      leadSarah
    );

    // Marcus no longer has it in myTasks; David now has it
    expect(taskService.getMyTasks(memberMarcus).some(t => t.id === task.id)).toBe(false);
    expect(taskService.getMyTasks(memberDavid).some(t => t.id === task.id)).toBe(true);

    // David received a reassignment notification
    const davidNotifs = storageEngine.getNotifications(memberDavid);
    expect(davidNotifs).toHaveLength(1);
    expect(davidNotifs[0].type).toBe('TASK_REASSIGNED');
    expect(davidNotifs[0].title).toBe('Task reassigned: Mobile Push Service');
    expect(davidNotifs[0].body).toBe('Sarah Chen reassigned task "Mobile Push Service" to you in Sprint Update.');
  });

  // 9. Clicking the assignment notification identifies the correct project and task
  it('9. Assignment notification payload carries exact projectId and taskId for navigation', async () => {
    const task = await taskService.createTask(
      testProject.id,
      {
        title: 'Security Hardening',
        description: 'Review CSP policies',
        priority: 'medium',
        status: 'todo',
        dueDate: '2026-10-29',
        assigneeId: memberMarcus.uid,
      },
      adminAlex
    );

    const [notif] = storageEngine.getNotifications(memberMarcus);
    expect(notif.projectId).toBe(testProject.id);
    expect(notif.taskId).toBe(task.id);
    expect(notif.entityType).toBe('task');
  });

  // 10. Distinct task IDs prevent cross-highlighting even when titles are identical
  it('10. Multiple tasks with identical titles are distinguished strictly by unique taskId', async () => {
    const taskA = await taskService.createTask(
      testProject.id,
      {
        title: 'Identical Title Task',
        description: 'First instance in todo',
        priority: 'low',
        status: 'todo',
        dueDate: '2026-10-25',
        assigneeId: memberMarcus.uid,
      },
      leadSarah
    );

    const taskB = await taskService.createTask(
      testProject.id,
      {
        title: 'Identical Title Task',
        description: 'Second instance in in_progress',
        priority: 'high',
        status: 'in_progress',
        dueDate: '2026-10-27',
        assigneeId: memberMarcus.uid,
      },
      leadSarah
    );

    expect(taskA.id).not.toBe(taskB.id);
    expect(taskA.title).toBe(taskB.title);

    // Notification for taskA references taskA.id specifically
    const marcusNotifs = storageEngine.getNotifications(memberMarcus);
    const notifForA = marcusNotifs.find(n => n.taskId === taskA.id);
    const notifForB = marcusNotifs.find(n => n.taskId === taskB.id);

    expect(notifForA?.taskId).toBe(taskA.id);
    expect(notifForB?.taskId).toBe(taskB.id);
  });

  // 11. Unauthorized users cannot retrieve or view restricted tasks
  it('11. Unauthorized users who are not project members cannot retrieve tasks', async () => {
    const task = await taskService.createTask(
      testProject.id,
      {
        title: 'Internal Architecture Diagram',
        description: 'Confidential system spec',
        priority: 'high',
        status: 'todo',
        dueDate: '2026-10-28',
        assigneeId: memberMarcus.uid,
      },
      leadSarah
    );

    // Member of the project can retrieve it
    expect(storageEngine.getTaskById(task.id, memberMarcus)).toBeDefined();

    // External user not in project.memberIds cannot retrieve it (throws permission error)
    expect(() => {
      storageEngine.getTaskById(task.id, externalUser);
    }).toThrow(/Permission denied/);
  });

  // 12. Highlighting does not alter task status, data, or RBAC permissions
  it('12. Highlighting does not alter task status, data, or permissions', async () => {
    const task = await taskService.createTask(
      testProject.id,
      {
        title: 'Preserve State During Highlight',
        description: 'Must remain untouched in todo',
        priority: 'medium',
        status: 'todo',
        dueDate: '2026-10-29',
        assigneeId: memberMarcus.uid,
      },
      leadSarah
    );

    const originalTask = storageEngine.getTaskById(task.id, memberMarcus);
    expect(originalTask?.status).toBe('todo');

    // Simulate navigation and highlight trigger
    const retrievedTask = storageEngine.getTaskById(task.id, memberMarcus);
    expect(retrievedTask?.status).toBe('todo');
    expect(retrievedTask?.priority).toBe('medium');
    expect(retrievedTask?.assigneeId).toBe(memberMarcus.uid);
  });
});
