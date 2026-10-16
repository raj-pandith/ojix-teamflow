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
});
