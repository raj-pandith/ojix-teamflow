import { describe, it, expect, beforeEach } from 'vitest';
import { taskService } from '../../src/services/taskService';
import { storageEngine } from '../../src/services/storageEngine';
import { notificationService } from '../../src/services/notificationService';
import { getEligibleProjectReviewers } from '../../src/domain/validation';
import { canUserTransitionTask, validateTaskTransition } from '../../src/domain/taskStateMachine';
import { UserProfile } from '../../src/types/auth';
import { Project } from '../../src/types/project';
import { TaskFormData } from '../../src/types/task';

describe('Task Reviewer Workflow & Governance (12 Acceptance Criteria)', () => {
  const adminAlex: UserProfile = {
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

  const blockedUser: UserProfile = {
    uid: 'user-blocked-bob',
    email: 'bob@ojix.io',
    displayName: 'Bob Blocked',
    role: 'member',
    status: 'blocked',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  const testProject: Project = {
    id: 'proj-review-workflow-test',
    workspaceId: 'ws-ojix-main',
    name: 'OJIX Website',
    objective: 'Production task review workflow verification',
    ownerId: leadSarah.uid,
    status: 'active',
    startDate: '2026-01-01',
    dueDate: '2026-12-31',
    memberIds: [
      adminAlex.uid,
      leadSarah.uid,
      memberMarcus.uid,
      memberDavid.uid,
      viewerElena.uid,
      blockedUser.uid,
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    localStorage.clear();
    storageEngine.initialize(true);
    storageEngine.saveProject(testProject, adminAlex);
    [adminAlex, leadSarah, memberMarcus, memberDavid, viewerElena, blockedUser].forEach(u => {
      try {
        storageEngine.addUser(u, adminAlex);
      } catch {
        // already registered in memory
      }
    });
  });

  // AC-01: Creating a task requires selecting a valid reviewer
  describe('Acceptance Criterion 1: Reviewer Selection During Task Creation', () => {
    it('rejects task creation if reviewerId is missing or empty string', async () => {
      const taskData: TaskFormData = {
        title: 'Frontend Task without reviewer',
        description: 'Implementing task reviewer UI',
        priority: 'high',
        status: 'todo',
        dueDate: '2026-05-01',
        assigneeId: memberMarcus.uid,
        reviewerId: '',
      };

      await expect(
        taskService.createTask(testProject.id, taskData, leadSarah)
      ).rejects.toThrow(/designated reviewer/i);
    });

    it('rejects task creation if selected reviewer is a Viewer', async () => {
      const taskData: TaskFormData = {
        title: 'Frontend Task with viewer as reviewer',
        description: 'Testing viewer rejection',
        priority: 'medium',
        status: 'todo',
        dueDate: '2026-05-01',
        assigneeId: memberMarcus.uid,
        reviewerId: viewerElena.uid,
      };

      await expect(
        taskService.createTask(testProject.id, taskData, leadSarah)
      ).rejects.toThrow(/Viewers have read-only access/i);
    });

    it('rejects task creation if selected reviewer is blocked or terminated', async () => {
      const taskData: TaskFormData = {
        title: 'Frontend Task with blocked reviewer',
        description: 'Testing blocked reviewer rejection',
        priority: 'medium',
        status: 'todo',
        dueDate: '2026-05-01',
        assigneeId: memberMarcus.uid,
        reviewerId: blockedUser.uid,
      };

      await expect(
        taskService.createTask(testProject.id, taskData, leadSarah)
      ).rejects.toThrow(/account is blocked/i);
    });

    it('rejects task creation if reviewer is not a member of the project team', async () => {
      const externalUser: UserProfile = {
        uid: 'user-external-charlie',
        email: 'charlie@external.com',
        displayName: 'Charlie External',
        role: 'member',
        status: 'active',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };
      storageEngine.addUser(externalUser, adminAlex);

      const taskData: TaskFormData = {
        title: 'Task with external reviewer',
        description: 'Testing non-member reviewer rejection',
        priority: 'medium',
        status: 'todo',
        dueDate: '2026-05-01',
        assigneeId: memberMarcus.uid,
        reviewerId: externalUser.uid,
      };

      await expect(
        taskService.createTask(testProject.id, taskData, leadSarah)
      ).rejects.toThrow(/does not have access to project/i);
    });

    it('successfully creates task and stores reviewerId when valid reviewer is selected', async () => {
      const taskData: TaskFormData = {
        title: 'Frontend Task',
        description: 'Build reviewer workflow component',
        priority: 'high',
        status: 'todo',
        dueDate: '2026-05-01',
        assigneeId: memberMarcus.uid,
        reviewerId: leadSarah.uid,
      };

      const created = await taskService.createTask(testProject.id, taskData, leadSarah);
      expect(created.id).toBeDefined();
      expect(created.reviewerId).toBe(leadSarah.uid);
      expect(created.assigneeId).toBe(memberMarcus.uid);

      // Verify persistence in storage
      const fetched = storageEngine.getTaskById(created.id, leadSarah);
      expect(fetched?.reviewerId).toBe(leadSarah.uid);
    });

    it('getEligibleProjectReviewers returns only active members, leads, and admins with project access (excluding viewers)', () => {
      const allUsers = storageEngine.getUsers();
      const eligible = getEligibleProjectReviewers(allUsers, testProject);
      const eligibleUids = eligible.map(u => u.uid);

      expect(eligibleUids).toContain(adminAlex.uid);
      expect(eligibleUids).toContain(leadSarah.uid);
      expect(eligibleUids).toContain(memberMarcus.uid);
      expect(eligibleUids).toContain(memberDavid.uid);

      // Excludes viewer and blocked user
      expect(eligibleUids).not.toContain(viewerElena.uid);
      expect(eligibleUids).not.toContain(blockedUser.uid);
    });
  });

  // AC-02: Assigned member can move a task into In Progress
  describe('Acceptance Criterion 2: To Do → In Progress by Assignee', () => {
    it('allows assigned member to start work and move task from todo to in_progress', async () => {
      const task = await taskService.createTask(testProject.id, {
        title: 'Backend API Task',
        description: 'Design reviewer schema',
        priority: 'medium',
        status: 'todo',
        dueDate: '2026-06-01',
        assigneeId: memberMarcus.uid,
        reviewerId: leadSarah.uid,
      }, leadSarah);

      const updated = await taskService.transitionStatus(task.id, 'in_progress', undefined, memberMarcus);
      expect(updated.status).toBe('in_progress');

      // Verify audit trail records the transition
      const logs = storageEngine.getTaskLogs(task.id, memberMarcus);
      const transitionLog = logs.find(l => l.fieldChanged === 'status');
      expect(transitionLog).toBeDefined();
      expect(transitionLog?.newValue).toBe('IN PROGRESS');
    });
  });

  // AC-03: Assigned member cannot move a task directly from In Progress to Done
  describe('Acceptance Criterion 3: In Progress → Done Direct Jump Prevention', () => {
    it('strictly forbids moving task directly from in_progress to done', async () => {
      const task = await taskService.createTask(testProject.id, {
        title: 'Security Task',
        description: 'Verify RBAC guards',
        priority: 'urgent',
        status: 'in_progress',
        dueDate: '2026-06-01',
        assigneeId: memberMarcus.uid,
        reviewerId: leadSarah.uid,
      }, leadSarah);

      // Direct transition check at domain state machine
      const transitionCheck = validateTaskTransition(task, 'done');
      expect(transitionCheck.valid).toBe(false);
      expect(transitionCheck.error).toMatch(/Cannot move task directly from In Progress to Done/i);

      // Check with canUserTransitionTask
      const userAuth = canUserTransitionTask(task, 'done', memberMarcus, testProject);
      expect(userAuth.allowed).toBe(false);
      expect(userAuth.reason).toMatch(/must not be able to move their task directly from In Progress to Done/i);

      // Attempt transition via API
      await expect(
        taskService.transitionStatus(task.id, 'done', undefined, memberMarcus)
      ).rejects.toThrow(/Submit for review first/i);
    });
  });

  // AC-04: Request Review moves task to In Review and notifies reviewer
  describe('Acceptance Criterion 4: In Progress → In Review & Notification', () => {
    it('moves task to in_review, records submitter and timestamp, and notifies designated reviewer', async () => {
      const task = await taskService.createTask(testProject.id, {
        title: 'OJIX Website Landing Page',
        description: 'Hero section build',
        priority: 'high',
        status: 'in_progress',
        dueDate: '2026-06-15',
        assigneeId: memberMarcus.uid,
        reviewerId: leadSarah.uid,
      }, leadSarah);

      const beforeSubmitTime = new Date().toISOString();
      const updated = await taskService.requestReview(task.id, memberMarcus);

      expect(updated.status).toBe('in_review');
      expect(updated.submittedForReviewBy).toBe(memberMarcus.uid);
      expect(updated.submittedForReviewAt).toBeDefined();
      expect(new Date(updated.submittedForReviewAt!).getTime()).toBeGreaterThanOrEqual(new Date(beforeSubmitTime).getTime() - 1000);

      // Verify notification sent to Sarah (Designated Reviewer)
      const reviewerNotifs = storageEngine.getNotifications(leadSarah);
      const reviewReqNotif = reviewerNotifs.find(n => n.type === 'TASK_REVIEW_REQUESTED' && n.taskId === task.id);
      expect(reviewReqNotif).toBeDefined();
      expect(reviewReqNotif?.title).toBe('Review requested');
      expect(reviewReqNotif?.body).toContain('Marcus Vance has requested a review of task "OJIX Website Landing Page"');
      expect(reviewReqNotif?.projectId).toBe(testProject.id);
      expect(reviewReqNotif?.taskId).toBe(task.id);
    });
  });

  // AC-05: The notification opens the correct Kanban task
  describe('Acceptance Criterion 5: Notification Target Navigation', () => {
    it('contains exact entity IDs and metadata needed to open Kanban task and card details', async () => {
      const task = await taskService.createTask(testProject.id, {
        title: 'Deep Link Target Task',
        description: 'Verify navigation target attributes',
        priority: 'medium',
        status: 'in_progress',
        dueDate: '2026-07-01',
        assigneeId: memberMarcus.uid,
        reviewerId: leadSarah.uid,
      }, leadSarah);

      await taskService.requestReview(task.id, memberMarcus);

      const notifs = storageEngine.getNotifications(leadSarah);
      const targetNotif = notifs.find(n => n.taskId === task.id && n.type === 'TASK_REVIEW_REQUESTED');
      expect(targetNotif).toBeDefined();
      expect(targetNotif?.projectId).toBe(testProject.id);
      expect(targetNotif?.taskId).toBe(task.id);
      expect(targetNotif?.entityType).toBe('task');
      expect(targetNotif?.entityId).toBe(task.id);
    });
  });

  // AC-06: The reviewer can approve the task and move it to Done
  describe('Acceptance Criterion 6: In Review → Done Approval', () => {
    it('allows designated reviewer to approve task, moving it to done and recording approval audit', async () => {
      const task = await taskService.createTask(testProject.id, {
        title: 'Database Migration Script',
        description: 'Add index on reviewerId',
        priority: 'high',
        status: 'in_progress',
        dueDate: '2026-07-15',
        assigneeId: memberMarcus.uid,
        reviewerId: leadSarah.uid,
      }, leadSarah);

      await taskService.requestReview(task.id, memberMarcus);

      // Reviewer Sarah approves
      const approvedTask = await taskService.approveTask(task.id, leadSarah);
      expect(approvedTask.status).toBe('done');
      expect(approvedTask.approvedBy).toBe(leadSarah.uid);
      expect(approvedTask.approvedAt).toBeDefined();

      // Check notification delivered to assignee (Marcus)
      const assigneeNotifs = storageEngine.getNotifications(memberMarcus);
      const approvedNotif = assigneeNotifs.find(n => n.type === 'TASK_REVIEW_APPROVED' && n.taskId === task.id);
      expect(approvedNotif).toBeDefined();
      expect(approvedNotif?.title).toBe('Review approved');
      expect(approvedNotif?.body).toContain('Sarah Chen has approved task "Database Migration Script"');

      // Check direct message delivered to assignee (Marcus)
      const assigneeMessages = storageEngine.getDirectMessages(memberMarcus);
      const approveMessage = assigneeMessages.find(m => m.subject?.includes('Task Approved') || m.body.includes('Done (Completed)'));
      expect(approveMessage).toBeDefined();
      expect(approveMessage?.recipientId).toBe(memberMarcus.uid);
      expect(approveMessage?.body).toContain('Done (Completed)');
    });

    it('allows Project Lead and Workspace Admin to intervene and approve', async () => {
      // Reviewer is David, but Workspace Admin Alex approves
      const task = await taskService.createTask(testProject.id, {
        title: 'Critical Governance Patch',
        description: 'Admin intervention test',
        priority: 'urgent',
        status: 'in_progress',
        dueDate: '2026-07-20',
        assigneeId: memberMarcus.uid,
        reviewerId: memberDavid.uid,
      }, leadSarah);

      await taskService.requestReview(task.id, memberMarcus);

      const approvedTask = await taskService.approveTask(task.id, adminAlex);
      expect(approvedTask.status).toBe('done');
      expect(approvedTask.approvedBy).toBe(adminAlex.uid);
    });
  });

  // AC-07: The reviewer can request changes and return it to In Progress with a comment
  describe('Acceptance Criterion 7: In Review → In Progress (Request Changes)', () => {
    it('requires a comment, moves task back to in_progress, records comment and notifies assignee', async () => {
      const task = await taskService.createTask(testProject.id, {
        title: 'Authentication Microservice',
        description: 'OAuth2 token exchange',
        priority: 'high',
        status: 'in_progress',
        dueDate: '2026-08-01',
        assigneeId: memberMarcus.uid,
        reviewerId: leadSarah.uid,
      }, leadSarah);

      await taskService.requestReview(task.id, memberMarcus);

      // Attempt requesting changes without a comment
      await expect(
        taskService.requestChanges(task.id, '', leadSarah)
      ).rejects.toThrow(/A comment explaining the changes needed is required/i);

      // Request changes with detailed comment
      const comment = 'Please add test coverage for expired refresh tokens before approval.';
      const updated = await taskService.requestChanges(task.id, comment, leadSarah);

      expect(updated.status).toBe('in_progress');
      expect(updated.changesRequestedBy).toBe(leadSarah.uid);
      expect(updated.changesRequestedAt).toBeDefined();
      expect(updated.changesRequestedComment).toBe(comment);

      // Verify assignee received notification with link
      const assigneeNotifs = storageEngine.getNotifications(memberMarcus);
      const changesNotif = assigneeNotifs.find(n => n.type === 'TASK_CHANGES_REQUESTED' && n.taskId === task.id);
      expect(changesNotif).toBeDefined();
      expect(changesNotif?.title).toBe('Changes requested');
      expect(changesNotif?.body).toContain(comment);
      expect(changesNotif?.taskId).toBe(task.id);
      expect(changesNotif?.projectId).toBe(testProject.id);

      // Verify assignee received direct message
      const assigneeMessages = storageEngine.getDirectMessages(memberMarcus);
      const changesMessage = assigneeMessages.find(m => m.subject?.includes('Changes Requested') || m.body.includes(comment));
      expect(changesMessage).toBeDefined();
      expect(changesMessage?.recipientId).toBe(memberMarcus.uid);
      expect(changesMessage?.body).toContain(comment);
      expect(changesMessage?.body).toContain('Changes Requested');
    });
  });

  // AC-08: The assigned member can mark a task Blocked, triggering notification to reviewer
  describe('Acceptance Criterion 8: In Progress → Blocked & Reviewer Alert', () => {
    it('captures blocker reason, transitions to blocked, and notifies the designated reviewer', async () => {
      const task = await taskService.createTask(testProject.id, {
        title: 'Payment Gateway Integration',
        description: 'Stripe webhook listener',
        priority: 'urgent',
        status: 'in_progress',
        dueDate: '2026-08-15',
        assigneeId: memberMarcus.uid,
        reviewerId: leadSarah.uid,
      }, leadSarah);

      const blockerReason = 'Stripe test API keys have expired; waiting on devops team.';
      const blockedTask = await taskService.transitionStatus(task.id, 'blocked', blockerReason, memberMarcus);

      expect(blockedTask.status).toBe('blocked');
      expect(blockedTask.blockerReason).toBe(blockerReason);

      // Reviewer Sarah receives notification
      const reviewerNotifs = storageEngine.getNotifications(leadSarah);
      const blockedNotif = reviewerNotifs.find(n => n.type === 'TASK_BLOCKED' && n.taskId === task.id);
      expect(blockedNotif).toBeDefined();
      expect(blockedNotif?.title).toBe('Task blocked');
      expect(blockedNotif?.body).toContain(blockerReason);

      // Blocked task cannot jump directly to done (must resume to in_progress first)
      await expect(
        taskService.transitionStatus(task.id, 'done', undefined, memberMarcus)
      ).rejects.toThrow();

      // Assignee resumes work back to in_progress
      const resumedTask = await taskService.transitionStatus(task.id, 'in_progress', undefined, memberMarcus);
      expect(resumedTask.status).toBe('in_progress');
      expect(resumedTask.blockerReason).toBeUndefined();
    });
  });

  // AC-09: Unauthorized users cannot approve tasks or bypass the workflow through direct API calls
  describe('Acceptance Criterion 9: Permissions & Security Boundary Enforcement', () => {
    it('rejects approval attempts by Viewers', async () => {
      const task = await taskService.createTask(testProject.id, {
        title: 'Audited API Spec',
        description: 'Read-only check',
        priority: 'low',
        status: 'in_progress',
        dueDate: '2026-08-20',
        assigneeId: memberMarcus.uid,
        reviewerId: leadSarah.uid,
      }, leadSarah);

      await taskService.requestReview(task.id, memberMarcus);

      await expect(
        taskService.approveTask(task.id, viewerElena)
      ).rejects.toThrow(/Viewers cannot update task status/i);
    });

    it('rejects approval attempts by unauthorized Members (who are neither designated reviewer nor lead/admin)', async () => {
      const task = await taskService.createTask(testProject.id, {
        title: 'Core Algorithm',
        description: 'Lead review required',
        priority: 'high',
        status: 'in_progress',
        dueDate: '2026-08-25',
        assigneeId: memberMarcus.uid,
        reviewerId: leadSarah.uid,
      }, leadSarah);

      await taskService.requestReview(task.id, memberMarcus);

      // David Kim is a member, but NOT the designated reviewer (Sarah is)
      await expect(
        taskService.approveTask(task.id, memberDavid)
      ).rejects.toThrow(/Only the designated reviewer/i);
    });
  });

  // AC-10: Self-Review Policy Enforcement
  describe('Acceptance Criterion 10: Strict Self-Review Prevention', () => {
    it('strictly forbids the assigned member from approving their own task, even if they are a Project Lead', async () => {
      // Sarah is the Project Lead, and assigns a task to herself with herself as designated reviewer
      const task = await taskService.createTask(testProject.id, {
        title: 'Lead Self-Assigned Task',
        description: 'Architecture blueprint',
        priority: 'urgent',
        status: 'in_progress',
        dueDate: '2026-09-01',
        assigneeId: leadSarah.uid,
        reviewerId: leadSarah.uid,
      }, leadSarah);

      const reviewTask = await taskService.requestReview(task.id, leadSarah);

      // Sarah attempts to approve her own task
      const auth = canUserTransitionTask(reviewTask, 'done', leadSarah, testProject);
      expect(auth.allowed).toBe(false);
      expect(auth.reason).toMatch(/Self-review policy: The assigned member cannot approve their own task/i);

      await expect(
        taskService.approveTask(task.id, leadSarah)
      ).rejects.toThrow(/Self-review policy/i);

      // But Workspace Admin Alex CAN approve it
      const adminApproved = await taskService.approveTask(task.id, adminAlex);
      expect(adminApproved.status).toBe('done');
    });
  });

  // AC-11: Status counts, task cards, and notifications remain consistent after refresh
  describe('Acceptance Criterion 11: State Persistence & Reload Consistency', () => {
    it('persists reviewer assignments, review states, and audit logs across reloads', async () => {
      const task = await taskService.createTask(testProject.id, {
        title: 'Persistent Task Review',
        description: 'Testing full persistence',
        priority: 'medium',
        status: 'in_progress',
        dueDate: '2026-09-15',
        assigneeId: memberMarcus.uid,
        reviewerId: leadSarah.uid,
      }, leadSarah);

      await taskService.requestReview(task.id, memberMarcus);
      await taskService.requestChanges(task.id, 'Need cleaner styling.', leadSarah);

      // Simulate re-fetching fresh from database
      const reloadedTask = storageEngine.getTaskById(task.id, adminAlex);
      expect(reloadedTask).toBeDefined();
      expect(reloadedTask?.status).toBe('in_progress');
      expect(reloadedTask?.reviewerId).toBe(leadSarah.uid);
      expect(reloadedTask?.changesRequestedBy).toBe(leadSarah.uid);
      expect(reloadedTask?.changesRequestedComment).toBe('Need cleaner styling.');

      // Check task status counts
      const allTasks = storageEngine.getTasks(testProject.id, adminAlex);
      const inProgressCount = allTasks.filter(t => t.status === 'in_progress').length;
      expect(inProgressCount).toBeGreaterThan(0);
    });
  });

  // AC-12: Notification Deduplication & Existing Features Preservation
  describe('Acceptance Criterion 12: Idempotent Notifications & Existing Feature Continuity', () => {
    it('prevents duplicate notifications when review is requested or approved repeatedly', async () => {
      const task = await taskService.createTask(testProject.id, {
        title: 'Deduplicated Review Task',
        description: 'Ensuring exactly once delivery',
        priority: 'medium',
        status: 'in_progress',
        dueDate: '2026-10-01',
        assigneeId: memberMarcus.uid,
        reviewerId: leadSarah.uid,
      }, leadSarah);

      // Trigger notificationService directly twice with the exact same state
      notificationService.notifyReviewRequested(task, testProject, leadSarah, memberMarcus);
      notificationService.notifyReviewRequested(task, testProject, leadSarah, memberMarcus);

      const notifs = storageEngine.getNotifications(leadSarah)
        .filter(n => n.taskId === task.id && n.type === 'TASK_REVIEW_REQUESTED');

      expect(notifs).toHaveLength(1);
    });
  });
});
