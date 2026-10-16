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
  });
});
