import { describe, it, expect, beforeEach } from 'vitest';
import { storageEngine } from '../../src/services/storageEngine';
import { projectService } from '../../src/services/projectService';
import { taskService } from '../../src/services/taskService';
import { auditService } from '../../src/services/auditService';
import { UserProfile } from '../../src/types/auth';
import { Task } from '../../src/types/task';

describe('Safe Project Member Removal Workflow', () => {
  let adminUser: UserProfile;
  let leadSarah: UserProfile;
  let otherLeadDavid: UserProfile;
  let memberMarcus: UserProfile;
  let memberPriya: UserProfile;
  let viewerElena: UserProfile;

  beforeEach(() => {
    storageEngine.initialize(true);
    adminUser = storageEngine.getUser('user-admin-alex')!;
    leadSarah = storageEngine.getUser('user-lead-sarah')!;
    memberMarcus = storageEngine.getUser('user-member-marcus')!;
    viewerElena = storageEngine.getUser('user-viewer-elena')!;

    // Create an additional active member Priya Sharma
    memberPriya = storageEngine.addUser(
      {
        displayName: 'Priya Sharma',
        email: 'priya.sharma@ojix-corp.internal',
        role: 'member',
      },
      adminUser,
      'proj-infra-01'
    );

    // Create a second Project Lead David Chen who does NOT manage proj-infra-01
    otherLeadDavid = storageEngine.addUser(
      {
        displayName: 'David Chen',
        email: 'david.chen@ojix-corp.internal',
        role: 'project_lead',
      },
      adminUser
    );
  });

  // ==========================================
  // 1. PERMISSION RULES & AUTHORIZATION BOUNDARIES
  // ==========================================
  describe('Permission Rules & Authorization Enforcement', () => {
    it('Project Lead can remove an active member from a project they manage', async () => {
      const result = await projectService.removeTeamMember(
        'proj-infra-01',
        memberPriya.uid,
        leadSarah
      );

      expect(result.removedUser.uid).toBe(memberPriya.uid);
      expect(result.project.memberIds).not.toContain(memberPriya.uid);

      // Verify member workspace account remains active and intact
      const priyaAccount = storageEngine.getUser(memberPriya.uid);
      expect(priyaAccount).toBeDefined();
      expect(priyaAccount?.status).toBe('active');
    });

    it('Workspace Admin can remove an active member from the project team', async () => {
      const result = await projectService.removeTeamMember(
        'proj-infra-01',
        memberPriya.uid,
        adminUser
      );

      expect(result.removedUser.uid).toBe(memberPriya.uid);
      expect(result.project.memberIds).not.toContain(memberPriya.uid);
    });

    it('A Project Lead CANNOT remove members from projects they do not manage', async () => {
      // David Chen is a project_lead, but owner of proj-infra-01 is Sarah Chen
      await expect(
        projectService.removeTeamMember('proj-infra-01', memberPriya.uid, otherLeadDavid)
      ).rejects.toThrow(/Permission denied: Only the authorized Project Lead/i);
    });

    it('Regular members cannot remove team members', async () => {
      await expect(
        projectService.removeTeamMember('proj-infra-01', memberPriya.uid, memberMarcus)
      ).rejects.toThrow(/Permission denied/i);
    });

    it('Viewers cannot remove team members', async () => {
      await expect(
        projectService.removeTeamMember('proj-infra-01', memberPriya.uid, viewerElena)
      ).rejects.toThrow(/Permission denied/i);
    });

    it('Blocked or terminated callers cannot perform member removal', async () => {
      storageEngine.setUserStatus(leadSarah.uid, 'blocked', adminUser);
      const blockedSarah = storageEngine.getUser(leadSarah.uid)!;

      await expect(
        projectService.removeTeamMember('proj-infra-01', memberPriya.uid, blockedSarah)
      ).rejects.toThrow(/Permission denied: Your workspace account is blocked/i);
    });

    it('Cannot remove project owner from their own project team', async () => {
      await expect(
        projectService.removeTeamMember('proj-infra-01', leadSarah.uid, leadSarah)
      ).rejects.toThrow(/Project owner cannot remove themselves from their project team/i);

      await expect(
        projectService.removeTeamMember('proj-infra-01', leadSarah.uid, adminUser)
      ).rejects.toThrow(/Project owner cannot be removed from their own team/i);
    });

    it('Project Lead cannot remove a Workspace Admin from the project team', async () => {
      await expect(
        projectService.removeTeamMember('proj-infra-01', adminUser.uid, leadSarah)
      ).rejects.toThrow(/Project Leads cannot remove a Workspace Admin/i);
    });

    it('Workspace Admin cannot remove themselves from the project team', async () => {
      await expect(
        projectService.removeTeamMember('proj-infra-01', adminUser.uid, adminUser)
      ).rejects.toThrow(/Workspace Admins cannot remove themselves from the project team/i);
    });
  });

  // ==========================================
  // 2. MEMBER REMOVAL SCENARIOS: NO TASKS & ONLY COMPLETED TASKS
  // ==========================================
  describe('Member Removal Scenarios: No Tasks & Completed Tasks', () => {
    it('Safe removal when member has 0 tasks', async () => {
      // Priya has no tasks assigned
      const taskSummary = projectService.getMemberProjectTasks(
        'proj-infra-01',
        memberPriya.uid,
        leadSarah
      );
      expect(taskSummary.activeTasks.length).toBe(0);
      expect(taskSummary.completedTasks.length).toBe(0);

      const result = await projectService.removeTeamMember(
        'proj-infra-01',
        memberPriya.uid,
        leadSarah,
        []
      );

      expect(result.reassignedTasks.length).toBe(0);
      expect(result.unassignedTasks.length).toBe(0);
      expect(result.preservedCompletedTasks.length).toBe(0);

      const updatedProject = storageEngine.getProjectById('proj-infra-01', leadSarah)!;
      expect(updatedProject.memberIds).not.toContain(memberPriya.uid);
    });

    it('Safe removal when member has ONLY completed tasks preserves historical ownership', async () => {
      // Create a completed task for Priya
      const doneTask: Task = {
        id: 'task-priya-done',
        workspaceId: 'ws-ojix-main',
        projectId: 'proj-infra-01',
        title: 'Telemetry dashboard deployment',
        description: 'Successfully deployed Grafana dashboards.',
        assigneeId: memberPriya.uid,
        priority: 'high',
        status: 'done',
        dueDate: '2026-10-15',
        createdBy: leadSarah.uid,
        createdAt: '2026-10-05T09:00:00Z',
        updatedAt: '2026-10-15T12:00:00Z',
      };
      storageEngine.saveTask(doneTask, leadSarah);

      // Verify summary shows 1 completed, 0 active
      const summary = projectService.getMemberProjectTasks(
        'proj-infra-01',
        memberPriya.uid,
        leadSarah
      );
      expect(summary.activeTasks.length).toBe(0);
      expect(summary.completedTasks.length).toBe(1);

      // Execute removal with no reassignments needed
      const result = await projectService.removeTeamMember(
        'proj-infra-01',
        memberPriya.uid,
        leadSarah,
        []
      );

      expect(result.preservedCompletedTasks.length).toBe(1);
      expect(result.preservedCompletedTasks[0].id).toBe('task-priya-done');

      // Verify the task in database still retains Priya's ownership and status 'done'
      const taskInDb = storageEngine.getTaskById('task-priya-done', leadSarah)!;
      expect(taskInDb.assigneeId).toBe(memberPriya.uid);
      expect(taskInDb.status).toBe('done');
      expect(taskInDb.title).toBe('Telemetry dashboard deployment');
    });

    it('Attempting to reassign a completed task is strictly rejected', async () => {
      // task-106 is Marcus's completed task
      const doneTask = storageEngine.getTaskById('task-106', leadSarah)!;
      expect(doneTask.status).toBe('done');
      expect(doneTask.assigneeId).toBe(memberMarcus.uid);

      await expect(
        projectService.removeTeamMember('proj-infra-01', memberMarcus.uid, leadSarah, [
          { taskId: 'task-106', newAssigneeId: memberPriya.uid },
        ])
      ).rejects.toThrow(/Cannot reassign completed tasks/i);
    });
  });

  // ==========================================
  // 3. TASK REASSIGNMENT WITH MULTIPLE UNFINISHED TASKS
  // ==========================================
  describe('Task Reassignment for Unfinished Tasks', () => {
    it('Allows reassigning some unfinished tasks to another active team member and leaving others unassigned', async () => {
      // Marcus has unfinished tasks: task-102 (todo), task-103 (in_progress), task-104 (in_review), task-107 (in_progress)
      // and completed task-106 (done).
      const reassignments = [
        { taskId: 'task-102', newAssigneeId: memberPriya.uid }, // Reassign to Priya
        { taskId: 'task-103', newAssigneeId: null },            // Leave unassigned
        { taskId: 'task-104', newAssigneeId: leadSarah.uid },   // Reassign to Lead Sarah
        { taskId: 'task-107', newAssigneeId: null },            // Leave unassigned
      ];

      const result = await projectService.removeTeamMember(
        'proj-infra-01',
        memberMarcus.uid,
        leadSarah,
        reassignments
      );

      expect(result.reassignedTasks.length).toBe(2);
      expect(result.unassignedTasks.length).toBe(2);
      expect(result.preservedCompletedTasks.length).toBe(1);

      // Verify task-102: reassigned to Priya, status 'todo' and details preserved
      const t102 = storageEngine.getTaskById('task-102', leadSarah)!;
      expect(t102.assigneeId).toBe(memberPriya.uid);
      expect(t102.status).toBe('todo');
      expect(t102.title).toBe('Zero-trust ingress proxy setup');

      // Verify task-103: unassigned, status 'in_progress' and details preserved
      const t103 = storageEngine.getTaskById('task-103', leadSarah)!;
      expect(t103.assigneeId).toBeNull();
      expect(t103.status).toBe('in_progress');

      // Verify task-104: reassigned to Sarah, status 'in_review' preserved
      const t104 = storageEngine.getTaskById('task-104', leadSarah)!;
      expect(t104.assigneeId).toBe(leadSarah.uid);
      expect(t104.status).toBe('in_review');

      // Verify task-106: still assigned to Marcus historically!
      const t106 = storageEngine.getTaskById('task-106', leadSarah)!;
      expect(t106.assigneeId).toBe(memberMarcus.uid);
      expect(t106.status).toBe('done');
    });

    it('Reassignment preserves status and blocker reason on BLOCKED tasks (does NOT automatically unblock)', async () => {
      // Create a blocked task assigned to Priya
      const blockedTask: Task = {
        id: 'task-priya-blocked',
        workspaceId: 'ws-ojix-main',
        projectId: 'proj-infra-01',
        title: 'Kafka event streaming setup',
        description: 'Configure multi-node Kafka cluster.',
        assigneeId: memberPriya.uid,
        priority: 'urgent',
        status: 'blocked',
        blockerReason: 'Waiting for AWS security group opening on port 9092.',
        dueDate: '2026-10-24',
        createdBy: leadSarah.uid,
        createdAt: '2026-10-10T10:00:00Z',
        updatedAt: '2026-10-14T11:00:00Z',
      };
      storageEngine.saveTask(blockedTask, leadSarah);

      // Reassign to Marcus
      const result = await projectService.removeTeamMember(
        'proj-infra-01',
        memberPriya.uid,
        leadSarah,
        [{ taskId: 'task-priya-blocked', newAssigneeId: memberMarcus.uid }]
      );

      expect(result.reassignedTasks.length).toBe(1);

      const reassignedBlocked = storageEngine.getTaskById('task-priya-blocked', leadSarah)!;
      expect(reassignedBlocked.assigneeId).toBe(memberMarcus.uid);
      // Status must remain 'blocked'
      expect(reassignedBlocked.status).toBe('blocked');
      // Blocker reason must remain intact
      expect(reassignedBlocked.blockerReason).toBe('Waiting for AWS security group opening on port 9092.');
      expect(reassignedBlocked.priority).toBe('urgent');
    });

    it('Reassignment preserves task dependencies', async () => {
      // Create a task with dependencies assigned to Priya
      const taskWithDeps: Task = {
        id: 'task-priya-deps',
        workspaceId: 'ws-ojix-main',
        projectId: 'proj-infra-01',
        title: 'End-to-end integration tests',
        description: 'Verify end-to-end pipeline.',
        assigneeId: memberPriya.uid,
        priority: 'medium',
        status: 'in_progress',
        dependencies: ['task-101', 'task-102'],
        dueDate: '2026-10-28',
        createdBy: leadSarah.uid,
        createdAt: '2026-10-11T12:00:00Z',
        updatedAt: '2026-10-15T15:00:00Z',
      };
      storageEngine.saveTask(taskWithDeps, leadSarah);

      // Reassign to Sarah
      await projectService.removeTeamMember('proj-infra-01', memberPriya.uid, leadSarah, [
        { taskId: 'task-priya-deps', newAssigneeId: leadSarah.uid },
      ]);

      const reassignedTask = storageEngine.getTaskById('task-priya-deps', leadSarah)!;
      expect(reassignedTask.assigneeId).toBe(leadSarah.uid);
      expect(reassignedTask.dependencies).toEqual(['task-101', 'task-102']);
    });
  });

  // ==========================================
  // 4. INVALID ASSIGNEES & BACKEND ATOMICITY / FAILURE HANDLING
  // ==========================================
  describe('Invalid Assignees & Backend Failure Atomicity', () => {
    it('Rejects reassigning tasks to a user outside the project team', async () => {
      // otherLeadDavid is NOT in proj-infra-01's team
      await expect(
        projectService.removeTeamMember('proj-infra-01', memberMarcus.uid, leadSarah, [
          { taskId: 'task-102', newAssigneeId: otherLeadDavid.uid },
        ])
      ).rejects.toThrow(/is not an active member of this project team/i);
    });

    it('Rejects reassigning tasks to the member being removed', async () => {
      await expect(
        projectService.removeTeamMember('proj-infra-01', memberMarcus.uid, leadSarah, [
          { taskId: 'task-102', newAssigneeId: memberMarcus.uid },
        ])
      ).rejects.toThrow(/Cannot reassign tasks to the member being removed/i);
    });

    it('Rejects reassigning tasks to a blocked or terminated user', async () => {
      // Block Priya
      storageEngine.setUserStatus(memberPriya.uid, 'blocked', adminUser);

      await expect(
        projectService.removeTeamMember('proj-infra-01', memberMarcus.uid, leadSarah, [
          { taskId: 'task-102', newAssigneeId: memberPriya.uid },
        ])
      ).rejects.toThrow(/account is blocked/i);
    });

    it('Atomic failure handling: If any reassignment fails, NO partial removal or assignment occurs', async () => {
      // Marcus has task-102, task-103
      // We submit 1 valid reassignment and 1 invalid reassignment (to non-team member otherLeadDavid)
      const invalidBatch = [
        { taskId: 'task-102', newAssigneeId: memberPriya.uid }, // Valid
        { taskId: 'task-103', newAssigneeId: otherLeadDavid.uid }, // INVALID!
      ];

      await expect(
        projectService.removeTeamMember('proj-infra-01', memberMarcus.uid, leadSarah, invalidBatch)
      ).rejects.toThrow(/is not an active member of this project team/i);

      // Verify atomic rollback: Marcus is STILL in project team!
      const project = storageEngine.getProjectById('proj-infra-01', leadSarah)!;
      expect(project.memberIds).toContain(memberMarcus.uid);

      // Verify task-102 was NOT partially reassigned!
      const t102 = storageEngine.getTaskById('task-102', leadSarah)!;
      expect(t102.assigneeId).toBe(memberMarcus.uid);

      // Verify task-103 is still with Marcus
      const t103 = storageEngine.getTaskById('task-103', leadSarah)!;
      expect(t103.assigneeId).toBe(memberMarcus.uid);
    });
  });

  // ==========================================
  // 5. AUDIT HISTORY & ACCESS REVOCATION
  // ==========================================
  describe('Audit History & Project Access Revocation', () => {
    it('Records member removal and task reassignments in audit logs while preserving historical comments', async () => {
      // Add a comment to task-102 before removal
      await auditService.addComment(
        'task-102',
        'proj-infra-01',
        'Pre-removal note from Marcus',
        memberMarcus
      );

      const preRemovalLogs = storageEngine.getTaskLogs('task-102', leadSarah);
      const preCount = preRemovalLogs.length;

      // Remove Marcus with task-102 reassigned to Priya
      await projectService.removeTeamMember('proj-infra-01', memberMarcus.uid, leadSarah, [
        { taskId: 'task-102', newAssigneeId: memberPriya.uid },
        { taskId: 'task-103', newAssigneeId: null },
        { taskId: 'task-104', newAssigneeId: null },
        { taskId: 'task-107', newAssigneeId: null },
      ]);

      // Check task audit logs
      const postRemovalLogs = storageEngine.getTaskLogs('task-102', leadSarah);
      expect(postRemovalLogs.length).toBe(preCount + 1);

      // Check reassignment log entry
      const reassignLog = postRemovalLogs.find(l => l.action === 'reassigned');
      expect(reassignLog).toBeDefined();
      expect(reassignLog?.oldValue).toBe(memberMarcus.displayName);
      expect(reassignLog?.newValue).toBe(memberPriya.displayName);

      // Verify team management logs contain the team_member_removed entry
      const teamLogs = storageEngine.getUserManagementLogs();
      const removeLog = teamLogs.find(
        l => l.action === 'team_member_removed' && l.oldValue === memberMarcus.displayName
      );
      expect(removeLog).toBeDefined();
      expect(removeLog?.projectId).toBe('proj-infra-01');
      expect(removeLog?.userId).toBe(leadSarah.uid);
    });

    it('Immediately revokes project and task access for the removed member', async () => {
      // Remove Marcus from proj-infra-01
      await projectService.removeTeamMember('proj-infra-01', memberMarcus.uid, leadSarah, [
        { taskId: 'task-102', newAssigneeId: null },
        { taskId: 'task-103', newAssigneeId: null },
        { taskId: 'task-104', newAssigneeId: null },
        { taskId: 'task-107', newAssigneeId: null },
      ]);

      // 1. Querying the project directly as Marcus is rejected
      expect(() => {
        storageEngine.getProjectById('proj-infra-01', memberMarcus);
      }).toThrow(/Permission denied: You do not have access to this project/i);

      // 2. Querying project tasks as Marcus is rejected
      expect(() => {
        storageEngine.getTasks('proj-infra-01', memberMarcus);
      }).toThrow(/Permission denied/i);

      // 3. Marcus's project list no longer contains proj-infra-01
      const marcusProjects = storageEngine.getProjects(memberMarcus);
      expect(marcusProjects.find(p => p.id === 'proj-infra-01')).toBeUndefined();

      // 4. Prevent new task creation in proj-infra-01 assigning to Marcus
      await expect(
        taskService.createTask(
          'proj-infra-01',
          {
            title: 'New task illegally assigned to removed user',
            description: 'Should fail',
            priority: 'medium',
            status: 'todo',
            assigneeId: memberMarcus.uid,
            dueDate: '2026-10-31',
          },
          leadSarah
        )
      ).rejects.toThrow(/is not an active member of this project team/i);
    });

    it('Removed member retains access to other projects they are authorized to access', async () => {
      // Add Marcus to proj-secret-02
      storageEngine.addMemberToProject('proj-secret-02', memberMarcus.uid);

      // Verify Marcus has access to proj-secret-02
      expect(storageEngine.getProjectById('proj-secret-02', memberMarcus)).toBeDefined();

      // Remove Marcus from proj-infra-01
      await projectService.removeTeamMember('proj-infra-01', memberMarcus.uid, leadSarah, [
        { taskId: 'task-102', newAssigneeId: null },
        { taskId: 'task-103', newAssigneeId: null },
        { taskId: 'task-104', newAssigneeId: null },
        { taskId: 'task-107', newAssigneeId: null },
      ]);

      // Marcus still has access to proj-secret-02!
      const secretProj = storageEngine.getProjectById('proj-secret-02', memberMarcus);
      expect(secretProj).toBeDefined();
      expect(secretProj?.id).toBe('proj-secret-02');
    });
  });
});
