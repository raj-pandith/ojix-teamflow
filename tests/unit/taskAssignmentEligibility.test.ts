import { describe, it, expect, beforeEach } from 'vitest';
import {
  validateAssigneeEligibility,
  isUserEligibleForAssignment,
  getEligibleProjectAssignees,
} from '../../src/domain/validation';
import { taskService } from '../../src/services/taskService';
import { projectService } from '../../src/services/projectService';
import { storageEngine } from '../../src/services/storageEngine';
import { auditService } from '../../src/services/auditService';
import { UserProfile } from '../../src/types/auth';
import { Project } from '../../src/types/project';
import { TaskFormData } from '../../src/types/task';

describe('Task Assignment Eligibility & Role Policy Enforcement', () => {
  const adminUser: UserProfile = {
    uid: 'user-admin-alex',
    email: 'alex@ojix.io',
    displayName: 'Alex Morgan',
    role: 'workspace_admin',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  const leadSarah: UserProfile = {
    uid: 'user-lead-sarah',
    email: 'sarah@ojix.io',
    displayName: 'Sarah Chen',
    role: 'project_lead',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  const memberMarcus: UserProfile = {
    uid: 'user-member-marcus',
    email: 'marcus@ojix.io',
    displayName: 'Marcus Vance',
    role: 'member',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  const memberDavid: UserProfile = {
    uid: 'user-member-david',
    email: 'david@ojix.io',
    displayName: 'David Kim',
    role: 'member',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  const viewerElena: UserProfile = {
    uid: 'user-viewer-elena',
    email: 'elena@ojix.io',
    displayName: 'Elena Rostova',
    role: 'viewer',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  const blockedMember: UserProfile = {
    uid: 'user-blocked-bob',
    email: 'bob@ojix.io',
    displayName: 'Bob Blocked',
    role: 'member',
    status: 'blocked',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  const terminatedMember: UserProfile = {
    uid: 'user-terminated-ted',
    email: 'ted@ojix.io',
    displayName: 'Ted Terminated',
    role: 'member',
    status: 'terminated',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  const testProject: Project = {
    id: 'proj-eligibility-test',
    workspaceId: 'ws-default',
    name: 'Core Platform v2',
    objective: 'Production hardening',
    ownerId: leadSarah.uid,
    status: 'active',
    startDate: '2026-03-01',
    dueDate: '2026-08-30',
    // Member list contains admin, lead, marcus, elena, and blockedMember
    memberIds: [
      adminUser.uid,
      leadSarah.uid,
      memberMarcus.uid,
      viewerElena.uid,
      blockedMember.uid,
    ],
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
  };

  beforeEach(() => {
    localStorage.clear();
    storageEngine.initialize(true);
    storageEngine.saveProject(testProject, adminUser);
    try {
      storageEngine.addUser(memberDavid, adminUser);
    } catch {
      // already exists
    }
    try {
      storageEngine.addUser(blockedMember, adminUser);
    } catch {
      // already exists
    }
    try {
      storageEngine.addUser(terminatedMember, adminUser);
    } catch {
      // already exists
    }
  });

  describe('1. Domain Eligibility Logic (validateAssigneeEligibility & getEligibleProjectAssignees)', () => {
    it('permits an active Member who is in the project team', () => {
      const res = validateAssigneeEligibility(memberMarcus, testProject);
      expect(res.eligible).toBe(true);
      expect(isUserEligibleForAssignment(memberMarcus, testProject)).toBe(true);
    });

    it('permits an active Project Lead who is in the project team', () => {
      const res = validateAssigneeEligibility(leadSarah, testProject);
      expect(res.eligible).toBe(true);
      expect(isUserEligibleForAssignment(leadSarah, testProject)).toBe(true);
    });

    it('strictly rejects Workspace Admin even if present in project.memberIds', () => {
      const res = validateAssigneeEligibility(adminUser, testProject);
      expect(res.eligible).toBe(false);
      expect(res.reason).toContain('Workspace Admins manage governance');
      expect(isUserEligibleForAssignment(adminUser, testProject)).toBe(false);
    });

    it('strictly rejects Viewer even if present in project.memberIds', () => {
      const res = validateAssigneeEligibility(viewerElena, testProject);
      expect(res.eligible).toBe(false);
      expect(res.reason).toContain('Viewers have read-only permissions');
      expect(isUserEligibleForAssignment(viewerElena, testProject)).toBe(false);
    });

    it('strictly rejects a blocked user account', () => {
      const res = validateAssigneeEligibility(blockedMember, testProject);
      expect(res.eligible).toBe(false);
      expect(res.reason).toContain('blocked and cannot receive task assignments');
    });

    it('strictly rejects a terminated user account', () => {
      const res = validateAssigneeEligibility(terminatedMember, testProject);
      expect(res.eligible).toBe(false);
      expect(res.reason).toContain('terminated and cannot receive task assignments');
    });

    it('strictly rejects a user belonging to other projects only (not in project.memberIds)', () => {
      const res = validateAssigneeEligibility(memberDavid, testProject);
      expect(res.eligible).toBe(false);
      expect(res.reason).toContain('not an active member of this project team');
    });

    it('getEligibleProjectAssignees filters out Admins, Viewers, inactive accounts, and non-members', () => {
      const allUsers = [
        adminUser,
        leadSarah,
        memberMarcus,
        memberDavid,
        viewerElena,
        blockedMember,
        terminatedMember,
      ];
      const eligible = getEligibleProjectAssignees(allUsers, testProject);
      const eligibleUids = eligible.map(u => u.uid);

      // Only leadSarah and memberMarcus qualify
      expect(eligibleUids).toEqual(expect.arrayContaining([leadSarah.uid, memberMarcus.uid]));
      expect(eligibleUids).not.toContain(adminUser.uid);
      expect(eligibleUids).not.toContain(viewerElena.uid);
      expect(eligibleUids).not.toContain(memberDavid.uid);
      expect(eligibleUids).not.toContain(blockedMember.uid);
      expect(eligibleUids).not.toContain(terminatedMember.uid);
      expect(eligible.length).toBe(2);
    });
  });

  describe('2. Backend Task Creation API Enforcement (taskService.createTask)', () => {
    const baseFormData: TaskFormData = {
      title: 'Valid task creation title',
      description: 'Production pipeline configuration task.',
      priority: 'high',
      status: 'todo',
      dueDate: '2026-05-15',
      assigneeId: null,
    };

    it('successfully creates task assigned to active Member', async () => {
      const task = await taskService.createTask(
        testProject.id,
        { ...baseFormData, assigneeId: memberMarcus.uid },
        leadSarah
      );
      expect(task.id).toBeDefined();
      expect(task.assigneeId).toBe(memberMarcus.uid);
    });

    it('successfully creates task assigned to active Project Lead', async () => {
      const task = await taskService.createTask(
        testProject.id,
        { ...baseFormData, assigneeId: leadSarah.uid },
        leadSarah
      );
      expect(task.id).toBeDefined();
      expect(task.assigneeId).toBe(leadSarah.uid);
    });

    it('successfully creates unassigned task (null/empty assigneeId)', async () => {
      const task = await taskService.createTask(
        testProject.id,
        { ...baseFormData, assigneeId: null },
        leadSarah
      );
      expect(task.id).toBeDefined();
      expect(task.assigneeId).toBeNull();
    });

    it('rejects task assignment to Workspace Admin', async () => {
      await expect(
        taskService.createTask(
          testProject.id,
          { ...baseFormData, assigneeId: adminUser.uid },
          leadSarah
        )
      ).rejects.toThrow(/Workspace Admins manage governance and cannot be assigned operational tasks/i);
    });

    it('rejects task assignment to Viewer', async () => {
      await expect(
        taskService.createTask(
          testProject.id,
          { ...baseFormData, assigneeId: viewerElena.uid },
          leadSarah
        )
      ).rejects.toThrow(/Viewers have read-only permissions and cannot receive task assignments/i);
    });

    it('rejects task assignment to user belonging to another project only', async () => {
      await expect(
        taskService.createTask(
          testProject.id,
          { ...baseFormData, assigneeId: memberDavid.uid },
          leadSarah
        )
      ).rejects.toThrow(/not an active member of this project team/i);
    });

    it('rejects task assignment to non-existent user ID', async () => {
      await expect(
        taskService.createTask(
          testProject.id,
          { ...baseFormData, assigneeId: 'ghost-user-404' },
          leadSarah
        )
      ).rejects.toThrow(/does not exist/i);
    });
  });

  describe('3. Backend Task Update & Reassignment API Enforcement (taskService.updateTask)', () => {
    it('rejects reassigning an existing task to Workspace Admin', async () => {
      const task = await taskService.createTask(
        testProject.id,
        {
          title: 'Existing task for reassignment',
          description: 'Valid description for task',
          priority: 'medium',
          status: 'todo',
          dueDate: '2026-06-01',
          assigneeId: memberMarcus.uid,
        },
        leadSarah
      );

      await expect(
        taskService.updateTask(
          task.id,
          { assigneeId: adminUser.uid },
          leadSarah
        )
      ).rejects.toThrow(/Workspace Admins manage governance/i);
    });

    it('rejects reassigning an existing task to Viewer', async () => {
      const task = await taskService.createTask(
        testProject.id,
        {
          title: 'Existing task for reassignment to viewer',
          description: 'Valid description for task',
          priority: 'medium',
          status: 'todo',
          dueDate: '2026-06-01',
          assigneeId: memberMarcus.uid,
        },
        leadSarah
      );

      await expect(
        taskService.updateTask(
          task.id,
          { assigneeId: viewerElena.uid },
          leadSarah
        )
      ).rejects.toThrow(/Viewers have read-only permissions/i);
    });

    it('permits updating task metadata (e.g. title) even if historically assigned to now-ineligible user without error', async () => {
      // Create a task manually via direct storage record simulating historical data
      const historicalTask = {
        id: 'hist-task-1',
        projectId: testProject.id,
        workspaceId: testProject.workspaceId,
        title: 'Historical Task with Admin Assignee',
        description: 'Old task before migration',
        status: 'todo' as const,
        priority: 'medium' as const,
        assigneeId: adminUser.uid, // historically assigned
        dueDate: '2026-06-01',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };
      // Insert directly into storage tasks array to simulate pre-existing historical record
      (storageEngine as unknown as { tasks: unknown[] }).tasks.push(historicalTask);

      // Updating title without changing assignee must succeed
      const updated = await taskService.updateTask(
        historicalTask.id,
        { title: 'Updated Title Preserving Historical Assignee' },
        leadSarah
      );
      expect(updated.title).toBe('Updated Title Preserving Historical Assignee');
      expect(updated.assigneeId).toBe(adminUser.uid);
    });
  });

  describe('4. Direct Storage Database Layer Enforcement (storageEngine.saveTask)', () => {
    it('direct storageEngine.saveTask call with Workspace Admin assignee throws authorization error', () => {
      const maliciousTask = {
        id: 'task-direct-bypass-admin',
        projectId: testProject.id,
        workspaceId: testProject.workspaceId,
        title: 'Direct Bypass Task',
        description: 'Bypass test description',
        status: 'todo' as const,
        priority: 'high' as const,
        assigneeId: adminUser.uid,
        dueDate: '2026-07-01',
        createdBy: leadSarah.uid,
        createdAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-03-01T00:00:00.000Z',
      };

      expect(() => {
        storageEngine.saveTask(maliciousTask, leadSarah);
      }).toThrow(/Permission denied: Cannot assign task. Workspace Admins manage governance/i);
    });

    it('direct storageEngine.saveTask call with Viewer assignee throws authorization error', () => {
      const maliciousTask = {
        id: 'task-direct-bypass-viewer',
        projectId: testProject.id,
        workspaceId: testProject.workspaceId,
        title: 'Direct Bypass Viewer Task',
        description: 'Bypass test description',
        status: 'todo' as const,
        priority: 'high' as const,
        assigneeId: viewerElena.uid,
        dueDate: '2026-07-01',
        createdBy: leadSarah.uid,
        createdAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-03-01T00:00:00.000Z',
      };

      expect(() => {
        storageEngine.saveTask(maliciousTask, leadSarah);
      }).toThrow(/Permission denied: Cannot assign task. Viewers have read-only permissions/i);
    });

    it('direct storageEngine.saveTask call with non-member assignee throws authorization error', () => {
      const maliciousTask = {
        id: 'task-direct-bypass-nonmember',
        projectId: testProject.id,
        workspaceId: testProject.workspaceId,
        title: 'Direct Bypass Nonmember Task',
        description: 'Bypass test description',
        status: 'todo' as const,
        priority: 'high' as const,
        assigneeId: memberDavid.uid,
        dueDate: '2026-07-01',
        createdBy: leadSarah.uid,
        createdAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-03-01T00:00:00.000Z',
      };

      expect(() => {
        storageEngine.saveTask(maliciousTask, leadSarah);
      }).toThrow(/Permission denied: Cannot assign task. User "David Kim" is not an active member/i);
    });
  });

  describe('5. Member Removal & Reassignment Safety (projectService.removeTeamMember)', () => {
    it('rejects member removal reassignment if replacement target is Workspace Admin', async () => {
      await expect(
        projectService.removeTeamMember(
          'proj-infra-01',
          'user-member-marcus',
          leadSarah,
          [{ taskId: 'task-102', newAssigneeId: adminUser.uid }]
        )
      ).rejects.toThrow(/Workspace Admins manage governance/i);
    });

    it('rejects member removal reassignment if replacement target is Viewer', async () => {
      await expect(
        projectService.removeTeamMember(
          'proj-infra-01',
          'user-member-marcus',
          leadSarah,
          [{ taskId: 'task-102', newAssigneeId: viewerElena.uid }]
        )
      ).rejects.toThrow(/Viewers have read-only permissions/i);
    });

    it('rejects member removal reassignment if target is the member being removed', async () => {
      await expect(
        projectService.removeTeamMember(
          'proj-infra-01',
          'user-member-marcus',
          leadSarah,
          [{ taskId: 'task-102', newAssigneeId: 'user-member-marcus' }]
        )
      ).rejects.toThrow(/Cannot reassign tasks to the member being removed/i);
    });

    it('after member is removed, subsequent attempts to assign tasks to them are rejected', async () => {
      // Remove Marcus from proj-infra-01 cleanly
      await projectService.removeTeamMember(
        'proj-infra-01',
        'user-member-marcus',
        leadSarah,
        []
      );

      // Attempting to assign a new task in proj-infra-01 to Marcus must be rejected because he was removed
      expect(() => {
        storageEngine.saveTask(
          {
            id: 'task-after-removal-marcus',
            projectId: 'proj-infra-01',
            workspaceId: 'ws-default',
            title: 'Task Attempt After Removal',
            description: 'Post removal attempt',
            status: 'todo',
            priority: 'low',
            assigneeId: memberMarcus.uid,
            dueDate: '2026-06-01',
            createdBy: leadSarah.uid,
            createdAt: '2026-03-01T00:00:00.000Z',
            updatedAt: '2026-03-01T00:00:00.000Z',
          },
          leadSarah
        );
      }).toThrow(/not an active member of this project team/i);
    });

    it('member removal preserves completed tasks and historical activity logs', async () => {
      const result = await projectService.removeTeamMember(
        'proj-infra-01',
        'user-member-marcus',
        leadSarah,
        [{ taskId: 'task-102', newAssigneeId: leadSarah.uid }]
      );

      // Marcus has 1 completed task in mockData (task-101)
      expect(result.preservedCompletedTasks.length).toBeGreaterThan(0);
      expect(result.preservedCompletedTasks[0].status).toBe('done');
      expect(result.preservedCompletedTasks[0].assigneeId).toBe('user-member-marcus');

      // Verify audit logs were created
      const logs = auditService.getLogs('task-102', leadSarah);
      expect(logs.some(l => l.action === 'reassigned')).toBe(true);
    });
  });
});
