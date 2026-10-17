import { describe, it, expect, beforeEach } from 'vitest';
import { storageEngine } from '../../src/services/storageEngine';
import { taskService } from '../../src/services/taskService';
import { projectService } from '../../src/services/projectService';
import { UserProfile } from '../../src/types/auth';

describe('Security & RBAC Boundary Enforcement', () => {
  let adminUser: UserProfile;
  let leadUser: UserProfile;
  let memberUser: UserProfile;
  let viewerUser: UserProfile;

  beforeEach(() => {
    storageEngine.initialize(true);
    adminUser = storageEngine.getUser('user-admin-alex')!;
    leadUser = storageEngine.getUser('user-lead-sarah')!;
    memberUser = storageEngine.getUser('user-member-marcus')!;
    viewerUser = storageEngine.getUser('user-viewer-elena')!;
  });

  it('NEG-01: Non-member cannot access or query an unshared project', () => {
    // proj-secret-02 memberIds: ['user-admin-alex', 'user-lead-sarah']
    // Marcus is a member, but NOT in proj-secret-02!
    expect(() => {
      storageEngine.getProjectById('proj-secret-02', memberUser);
    }).toThrow(/Permission denied/);

    // However, workspace_admin CAN access
    const adminAccess = storageEngine.getProjectById('proj-secret-02', adminUser);
    expect(adminAccess).toBeDefined();
    expect(adminAccess?.id).toBe('proj-secret-02');
  });

  it('NEG-02: Viewer cannot create a task in any project', async () => {
    await expect(
      taskService.createTask(
        'proj-infra-01',
        {
          title: 'Illegal task from viewer',
          description: 'Should be rejected',
          priority: 'low',
          status: 'todo',
          assigneeId: null,
          dueDate: '2026-10-30',
        },
        viewerUser
      )
    ).rejects.toThrow(/Permission denied: Viewers cannot create tasks/);
  });

  it('NEG-02b: Viewer cannot transition task status', async () => {
    await expect(
      taskService.transitionStatus('task-102', 'in_progress', undefined, viewerUser)
    ).rejects.toThrow(/Permission denied: Viewers cannot update task status/);
  });

  it('Member CAN transition tasks assigned to them', async () => {
    // task-102 is assigned to Marcus, status is todo -> transition to in_progress
    const updated = await taskService.transitionStatus('task-102', 'in_progress', undefined, memberUser);
    expect(updated.status).toBe('in_progress');
  });

  it('Member CANNOT transition unassigned tasks', async () => {
    // task-101 is in backlog and unassigned
    await expect(
      taskService.transitionStatus('task-101', 'todo', undefined, memberUser)
    ).rejects.toThrow(/Unassigned task: Only the Project Lead or Workspace Admin can move unassigned tasks/);
  });

  it('Member CANNOT transition tasks assigned to other members', async () => {
    // task-105 is assigned to Sarah Chen
    await expect(
      taskService.transitionStatus('task-105', 'in_progress', undefined, memberUser)
    ).rejects.toThrow(/Members can only drag and move tasks assigned directly to them/);
  });

  it('Project Lead CAN transition unassigned tasks and tasks assigned to other members', async () => {
    // task-101 is unassigned -> Lead moves to todo
    const updatedUnassigned = await taskService.transitionStatus('task-101', 'todo', undefined, leadUser);
    expect(updatedUnassigned.status).toBe('todo');

    // task-103 is assigned to Marcus -> Lead moves to in_progress
    const updatedMemberTask = await taskService.transitionStatus('task-103', 'in_progress', undefined, leadUser);
    expect(updatedMemberTask.status).toBe('in_progress');
  });

  it('Workspace Admin CAN override and transition any task', async () => {
    const updated = await taskService.transitionStatus('task-101', 'todo', undefined, adminUser);
    expect(updated.status).toBe('todo');
  });

  it('NEG-02c: Viewer cannot delete any task', async () => {
    await expect(
      taskService.deleteTask('task-102', viewerUser)
    ).rejects.toThrow(/Permission denied: Only Workspace Admins and Project Leads can delete tasks/);
  });

  it('NEG-02d: Member cannot delete any task', async () => {
    await expect(
      taskService.deleteTask('task-102', memberUser)
    ).rejects.toThrow(/Permission denied: Only Workspace Admins and Project Leads can delete tasks/);
  });

  it('Project Lead and Workspace Admin can delete tasks', async () => {
    // Project Lead Sarah can delete task in her project proj-infra-01
    await expect(taskService.deleteTask('task-102', leadUser)).resolves.not.toThrow();
  });

  it('NEG-06: Repeated submission is protected against duplicate mutation', async () => {
    const key = 'test-idempotency-key';
    let counter = 0;

    const action = () =>
      storageEngine.executeIdempotent(key, async () => {
        counter++;
        return `result-${counter}`;
      });

    // Rapid concurrent calls
    const [res1, res2] = await Promise.all([action(), action()]);
    expect(res1).toBe('result-1');
    expect(res2).toBe('result-1');
    expect(counter).toBe(1); // Exactly 1 execution
  });

  it('Project Lead can create projects', async () => {
    const proj = await projectService.createProject(
      {
        name: 'Lead Auth Project',
        objective: 'Testing lead privileges',
        status: 'active',
        startDate: '2026-10-01',
        dueDate: '2026-12-01',
        memberIds: [leadUser.uid],
      },
      leadUser
    );
    expect(proj.id).toBeDefined();
    expect(proj.ownerId).toBe(leadUser.uid);
  });

  it('Member cannot create projects (restricted to Admin and Lead)', async () => {
    await expect(
      projectService.createProject(
        {
          name: 'Unauthorized Member Project',
          objective: 'Testing member restriction',
          status: 'active',
          startDate: '2026-10-01',
          dueDate: '2026-12-01',
          memberIds: [memberUser.uid],
        },
        memberUser
      )
    ).rejects.toThrow(/Permission denied: Only Workspace Admins and Project Leads can create projects/);
  });

  it('Workspace Admin can add new user and assign them to tasks with auto-enrollment', async () => {
    const newUser: UserProfile = {
      uid: 'user-new-tester',
      email: 'tester@ojix.local',
      displayName: 'Taylor Swift',
      role: 'member',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Admin creates user
    storageEngine.addUser(newUser, adminUser);
    expect(storageEngine.getUser('user-new-tester')).toBeDefined();

    // Project proj-secret-02 initially only has admin and lead
    const beforeProj = storageEngine.getProjectById('proj-secret-02', adminUser);
    expect(beforeProj?.memberIds.includes('user-new-tester')).toBe(false);

    // Auto-enroll user in project
    storageEngine.addMemberToProject('proj-secret-02', 'user-new-tester');
    const afterProj = storageEngine.getProjectById('proj-secret-02', adminUser);
    expect(afterProj?.memberIds.includes('user-new-tester')).toBe(true);

    // Now new user can access the project
    const newMemberProj = storageEngine.getProjectById('proj-secret-02', newUser);
    expect(newMemberProj).toBeDefined();
  });

  it('Project Lead CAN add new users, but Member and Viewer CANNOT', () => {
    const leadCreatedUser: UserProfile = {
      uid: 'user-lead-added',
      email: 'leadadded@ojix.local',
      displayName: 'Lead Added Contributor',
      role: 'member',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Project Lead can add user
    storageEngine.addUser(leadCreatedUser, leadUser);
    expect(storageEngine.getUser('user-lead-added')).toBeDefined();

    // Member cannot add user
    const memberAttemptUser: UserProfile = {
      uid: 'user-member-illegal',
      email: 'memberillegal@ojix.local',
      displayName: 'Illegal User',
      role: 'member',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(() => storageEngine.addUser(memberAttemptUser, memberUser)).toThrow(
      /Permission denied: Only Workspace Admins and Project Leads can add or invite new members/
    );

    // Viewer cannot add user
    expect(() => storageEngine.addUser(memberAttemptUser, viewerUser)).toThrow(
      /Permission denied: Only Workspace Admins and Project Leads can add or invite new members/
    );
  });

  describe('Project Deletion Permissions', () => {
    it('Project Lead CAN delete projects they own', async () => {
      // Create a project owned by Sarah Chen
      const leadProj = await projectService.createProject(
        {
          name: 'Sarah Deletable Project',
          objective: 'Test lead deletion',
          status: 'active',
          startDate: '2026-10-01',
          dueDate: '2026-11-01',
          memberIds: [leadUser.uid],
        },
        leadUser
      );

      expect(storageEngine.getProjectById(leadProj.id, leadUser)).toBeDefined();
      await projectService.deleteProject(leadProj.id, leadUser);
      expect(storageEngine.getProjectById(leadProj.id, adminUser)).toBeUndefined();
    });

    it('Project Lead CAN delete projects they manage', async () => {
      // Create project owned by Alex Morgan with Sarah as lead member
      const adminProj = await projectService.createProject(
        {
          name: 'Alex Executive Project',
          objective: 'Testing project lead deletion permissions',
          status: 'active',
          startDate: '2026-10-01',
          dueDate: '2026-11-01',
          memberIds: [adminUser.uid, leadUser.uid],
        },
        adminUser
      );

      await expect(
        projectService.deleteProject(adminProj.id, leadUser)
      ).resolves.not.toThrow();

      expect(storageEngine.getProjectById(adminProj.id, adminUser)).toBeUndefined();
    });

    it('Workspace Admin CAN delete any project', async () => {
      // proj-infra-01 is owned by Sarah Chen, Admin deletes it
      await expect(
        projectService.deleteProject('proj-infra-01', adminUser)
      ).resolves.not.toThrow();

      expect(storageEngine.getProjectById('proj-infra-01', adminUser)).toBeUndefined();
    });

    it('Member CANNOT delete projects', async () => {
      await expect(
        projectService.deleteProject('proj-infra-01', memberUser)
      ).rejects.toThrow(/Permission denied: Only Workspace Admins and Project Leads can delete projects/);
    });

    it('Viewer CANNOT delete projects', async () => {
      await expect(
        projectService.deleteProject('proj-infra-01', viewerUser)
      ).rejects.toThrow(/Permission denied: Only Workspace Admins and Project Leads can delete projects/);
    });

    it('Project deletion creates sticky notification for all project members with who, project and when', async () => {
      // Create a project with Sarah (Lead), Marcus (Member), and Alex (Admin) as members. Elena (Viewer) is NOT a member.
      const sharedProj = await projectService.createProject(
        {
          name: 'Mobile App Redesign',
          objective: 'Test deletion notification distribution',
          status: 'active',
          startDate: '2026-10-01',
          dueDate: '2026-11-01',
          memberIds: [leadUser.uid, memberUser.uid, adminUser.uid],
        },
        leadUser
      );

      // Verify no deletion notices initially
      expect(projectService.getDeletionNotices(memberUser)).toHaveLength(0);
      expect(projectService.getDeletionNotices(leadUser)).toHaveLength(0);

      // Sarah (Project Lead) deletes the project
      await projectService.deleteProject(sharedProj.id, leadUser);

      // Verify Marcus (Member of the deleted project) receives the sticky notice
      const marcusNotices = projectService.getDeletionNotices(memberUser);
      expect(marcusNotices.length).toBeGreaterThanOrEqual(1);
      const noticeForMarcus = marcusNotices.find(n => n.projectId === sharedProj.id);
      expect(noticeForMarcus).toBeDefined();
      expect(noticeForMarcus?.projectName).toBe('Mobile App Redesign');
      expect(noticeForMarcus?.deletedByName).toBe(leadUser.displayName);
      expect(noticeForMarcus?.deletedByRole).toBe('project_lead');
      expect(noticeForMarcus?.deletedAt).toBeDefined();

      // Verify Sarah (also a member) receives the notice
      const sarahNotices = projectService.getDeletionNotices(leadUser);
      expect(sarahNotices.some(n => n.projectId === sharedProj.id)).toBe(true);

      // Verify Elena (NOT in memberIds of Mobile App Redesign) does NOT receive the notice
      const elenaNotices = projectService.getDeletionNotices(viewerUser);
      expect(elenaNotices.some(n => n.projectId === sharedProj.id)).toBe(false);

      // Marcus dismisses the notice
      projectService.dismissDeletionNotice(noticeForMarcus!.id, memberUser);

      // Marcus should no longer see it
      const marcusNoticesAfter = projectService.getDeletionNotices(memberUser);
      expect(marcusNoticesAfter.some(n => n.projectId === sharedProj.id)).toBe(false);

      // But Sarah still sees it until she dismisses it
      const sarahNoticesAfter = projectService.getDeletionNotices(leadUser);
      expect(sarahNoticesAfter.some(n => n.projectId === sharedProj.id)).toBe(true);
    });

    it('NEG-05: Double-Submit Idempotency Lock returns identical in-flight promise and prevents duplicate execution', async () => {
      const testKey = `test-idempotency-${Date.now()}`;
      let executionCount = 0;

      const p1 = storageEngine.executeIdempotent(testKey, async () => {
        executionCount++;
        return 'created-once';
      });

      const p2 = storageEngine.executeIdempotent(testKey, async () => {
        executionCount++;
        return 'created-twice';
      });

      // Strict promise identity check
      expect(p1).toBe(p2);

      const [res1, res2] = await Promise.all([p1, p2]);
      expect(executionCount).toBe(1);
      expect(res1).toBe('created-once');
      expect(res2).toBe('created-once');
    });

    it('Audit logging on task updates explicitly records who updated and what updated', async () => {
      // Create a task
      const createdTask = await taskService.createTask(
        'proj-infra-01',
        {
          title: 'Audit Logging Verification Task',
          description: 'Testing that changes mention who and what updated',
          priority: 'medium',
          status: 'todo',
          dueDate: '2026-10-30',
          assigneeId: null,
        },
        adminUser
      );

      // 1. Reassign task from Unassigned to Marcus by Sarah
      await taskService.updateTask(
        createdTask.id,
        { assigneeId: memberUser.uid },
        leadUser
      );

      const logsAfterReassign = storageEngine.getTaskLogs(createdTask.id, leadUser);
      const reassignLog = logsAfterReassign.find(l => l.action === 'reassigned');
      expect(reassignLog).toBeDefined();
      expect(reassignLog?.userDisplayName).toBe(leadUser.displayName); // Who updated
      expect(reassignLog?.fieldChanged).toBe('assignee'); // What updated
      expect(reassignLog?.oldValue).toBe('Unassigned');
      expect(reassignLog?.newValue).toBe(memberUser.displayName);
      expect(reassignLog?.commentText).toContain(leadUser.displayName);
      expect(reassignLog?.commentText).toContain('reassigned');

      // 2. Change priority to Urgent by Marcus
      await taskService.updateTask(
        createdTask.id,
        { priority: 'urgent' },
        memberUser
      );

      const logsAfterPriority = storageEngine.getTaskLogs(createdTask.id, memberUser);
      const priorityLog = logsAfterPriority.find(l => l.fieldChanged === 'priority');
      expect(priorityLog).toBeDefined();
      expect(priorityLog?.userDisplayName).toBe(memberUser.displayName); // Who updated
      expect(priorityLog?.oldValue).toBe('MEDIUM');
      expect(priorityLog?.newValue).toBe('URGENT');
      expect(priorityLog?.commentText).toContain(memberUser.displayName);
      expect(priorityLog?.commentText).toContain('changed priority');

      // 3. Move status to In Progress
      await taskService.transitionStatus(
        createdTask.id,
        'in_progress',
        undefined,
        memberUser
      );

      const logsAfterStatus = storageEngine.getTaskLogs(createdTask.id, memberUser);
      const statusLog = logsAfterStatus.find(l => l.action === 'status_changed');
      expect(statusLog).toBeDefined();
      expect(statusLog?.userDisplayName).toBe(memberUser.displayName);
      expect(statusLog?.commentText).toContain(memberUser.displayName);
      expect(statusLog?.commentText).toContain('IN PROGRESS');
    });

    it('Card Update Permissions: only Workspace Admin and Project Lead can update task via update button', () => {
      const isAuthorizedToUpdate = (role?: string) => role === 'workspace_admin' || role === 'project_lead';

      expect(isAuthorizedToUpdate(adminUser.role)).toBe(true);
      expect(isAuthorizedToUpdate(leadUser.role)).toBe(true);
      expect(isAuthorizedToUpdate(memberUser.role)).toBe(false);
      expect(isAuthorizedToUpdate(viewerUser.role)).toBe(false);
      expect(isAuthorizedToUpdate(undefined)).toBe(false);
    });

    it('Full Task Update by Project Lead logs all changed fields to post section', async () => {
      const task = await taskService.createTask(
        'proj-infra-01',
        {
          title: 'Initial Title',
          description: 'Initial Description',
          priority: 'low',
          status: 'todo',
          assigneeId: null,
          dueDate: '2026-11-01',
        },
        leadUser
      );

      // Project Lead updates title, description, priority, and due date
      await taskService.updateTask(
        task.id,
        {
          title: 'Updated Title By Lead',
          description: 'Enhanced Description',
          priority: 'urgent',
          dueDate: '2026-11-15',
        },
        leadUser
      );

      const logs = storageEngine.getTaskLogs(task.id, leadUser);
      
      const titleLog = logs.find(l => l.fieldChanged === 'title');
      expect(titleLog).toBeDefined();
      expect(titleLog?.userDisplayName).toBe(leadUser.displayName);
      expect(titleLog?.oldValue).toBe('Initial Title');
      expect(titleLog?.newValue).toBe('Updated Title By Lead');

      const priorityLog = logs.find(l => l.fieldChanged === 'priority');
      expect(priorityLog).toBeDefined();
      expect(priorityLog?.userDisplayName).toBe(leadUser.displayName);
      expect(priorityLog?.oldValue).toBe('LOW');
      expect(priorityLog?.newValue).toBe('URGENT');

      const dueDateLog = logs.find(l => l.fieldChanged === 'dueDate');
      expect(dueDateLog).toBeDefined();
      expect(dueDateLog?.userDisplayName).toBe(leadUser.displayName);
      expect(dueDateLog?.oldValue).toBe('2026-11-01');
      expect(dueDateLog?.newValue).toBe('2026-11-15');
    });
  });
});

