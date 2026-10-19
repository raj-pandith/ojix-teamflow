import { Task, TaskFormData, TaskStatus, TaskLink } from '../types/task';
import { Project } from '../types/project';
import { UserProfile } from '../types/auth';
import { storageEngine } from './storageEngine';
import { validateTaskForm, validateAssigneeEligibility, validateReviewerEligibility } from '../domain/validation';
import { validateTaskTransition, canUserTransitionTask } from '../domain/taskStateMachine';
import { auditService } from './auditService';
import { notificationService } from './notificationService';
import { directMessageService } from './directMessageService';

class TaskService {
  public getTasks(projectId: string, user: UserProfile): Task[] {
    return storageEngine.getTasks(projectId, user);
  }

  public getAllAccessibleTasks(user: UserProfile): Task[] {
    return storageEngine.getAllAccessibleTasks(user);
  }

  public getMyTasks(user: UserProfile): Task[] {
    const accessible = storageEngine.getAllAccessibleTasks(user);
    return accessible.filter(t => t.assigneeId === user.uid);
  }

  public getTaskById(taskId: string, user: UserProfile): Task | undefined {
    return storageEngine.getTaskById(taskId, user);
  }

  public async createTask(
    projectId: string,
    data: TaskFormData,
    user: UserProfile
  ): Promise<Task> {
    if (user.status === 'blocked' || user.status === 'terminated') {
      throw new Error(`Permission denied: Your workspace account is ${user.status}. Access has been revoked.`);
    }

    if (user.role === 'viewer') {
      throw new Error('Permission denied: Viewers cannot create tasks.');
    }

    if (user.role === 'member') {
      throw new Error('Permission denied: Members cannot create tasks. Only Workspace Admins and Project Leads can create tasks.');
    }

    const project = storageEngine.getProjectById(projectId, user);
    if (!project) {
      throw new Error(`Project ${projectId} not found.`);
    }

    if (data.assigneeId) {
      const targetUser = storageEngine.getUser(data.assigneeId);
      const eligibility = validateAssigneeEligibility(targetUser, project);
      if (!eligibility.eligible) {
        throw new Error(`Permission denied: Cannot assign task. ${eligibility.reason}`);
      }
    }

    const validation = validateTaskForm(data);
    if (!validation.isValid) {
      const firstError = Object.values(validation.errors)[0];
      throw new Error(firstError);
    }

    // Reviewer validation
    let resolvedReviewerId = data.reviewerId?.trim();
    if (data.reviewerId !== undefined) {
      if (!resolvedReviewerId) {
        throw new Error('A designated reviewer is required for this task.');
      }
      const targetReviewer = storageEngine.getUser(resolvedReviewerId);
      const reviewerEligibility = validateReviewerEligibility(targetReviewer, project);
      if (!reviewerEligibility.eligible) {
        throw new Error(`Permission denied: Cannot select reviewer. ${reviewerEligibility.reason}`);
      }
    } else {
      // Default to valid project owner / lead if omitted in legacy programmatic calls
      resolvedReviewerId = project.ownerId || 'user-lead-sarah';
    }

    const idempotencyKey = `create-task-${projectId}-${data.title}-${data.description || ''}-${data.status}-${data.priority}-${data.dueDate}-${resolvedReviewerId}-${user.uid}`;
    return storageEngine.executeIdempotent(idempotencyKey, async () => {
      const newTask: Task = {
        id: `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        workspaceId: 'ws-ojix-main',
        projectId,
        title: data.title.trim(),
        description: data.description?.trim() || '',
        assigneeId: data.assigneeId || null,
        reviewerId: resolvedReviewerId || null,
        priority: data.priority,
        status: data.status,
        blockerReason: data.status === 'blocked' ? data.blockerReason?.trim() : undefined,
        dueDate: data.dueDate,
        milestoneId: data.milestoneId,
        links: data.links || [],
        createdBy: user.uid,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      storageEngine.saveTask(newTask, user);

      // Audit log
      const reviewerUser = resolvedReviewerId ? storageEngine.getUser(resolvedReviewerId) : null;
      auditService.logActivity({
        id: `log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        workspaceId: 'ws-ojix-main',
        projectId,
        taskId: newTask.id,
        userId: user.uid,
        userDisplayName: user.displayName,
        action: 'created',
        commentText: reviewerUser
          ? `Task created with priority "${newTask.priority}", status "${newTask.status}", and designated reviewer "${reviewerUser.displayName}".`
          : `Task created with priority "${newTask.priority}" and status "${newTask.status}".`,
        createdAt: new Date().toISOString(),
      }, user);

      // Notification to assignee
      if (newTask.assigneeId) {
        const assigneeUser = storageEngine.getUser(newTask.assigneeId);
        if (assigneeUser) {
          notificationService.notifyTaskAssigned(newTask, project, assigneeUser, user, false);
        }
      }

      return newTask;
    });
  }

  public async transitionStatus(
    taskId: string,
    targetStatus: TaskStatus,
    blockerReason: string | undefined,
    user: UserProfile,
    reviewComment?: string
  ): Promise<Task> {
    if (user.status === 'blocked' || user.status === 'terminated') {
      throw new Error(`Permission denied: Your workspace account is ${user.status}. Access has been revoked.`);
    }

    if (user.role === 'viewer') {
      throw new Error('Permission denied: Viewers cannot update task status.');
    }

    const existing = storageEngine.getTaskById(taskId, user);
    if (!existing) {
      throw new Error(`Task ${taskId} not found.`);
    }

    const project = storageEngine.getProjectById(existing.projectId, user);

    // Validate permission for this specific status transition (enforces RBAC and self-review policy)
    const transitionAuth = canUserTransitionTask(existing, targetStatus, user, project);
    if (!transitionAuth.allowed) {
      throw new Error(transitionAuth.reason || 'Permission denied: You are not authorized to make this transition.');
    }

    const transitionResult = validateTaskTransition(existing, targetStatus, blockerReason);
    if (!transitionResult.valid) {
      throw new Error(transitionResult.error || 'Invalid transition.');
    }

    const oldStatus = existing.status;
    const isNowBlocked = targetStatus === 'blocked';
    const wasBlocked = oldStatus === 'blocked';
    const isRequestReview = targetStatus === 'in_review';
    const isApprove = oldStatus === 'in_review' && targetStatus === 'done';
    const isRequestChanges = oldStatus === 'in_review' && targetStatus === 'in_progress';

    if (isRequestChanges) {
      const cleanComment = reviewComment?.trim() || '';
      if (!cleanComment) {
        throw new Error('A comment explaining the changes needed is required.');
      }
    }

    const now = new Date().toISOString();

    const updatedTask: Task = {
      ...existing,
      status: targetStatus,
      blockerReason: isNowBlocked ? blockerReason?.trim() : undefined,
      submittedForReviewBy: isRequestReview ? user.uid : existing.submittedForReviewBy,
      submittedForReviewAt: isRequestReview ? now : existing.submittedForReviewAt,
      approvedBy: isApprove ? user.uid : existing.approvedBy,
      approvedAt: isApprove ? now : existing.approvedAt,
      changesRequestedBy: isRequestChanges ? user.uid : existing.changesRequestedBy,
      changesRequestedAt: isRequestChanges ? now : existing.changesRequestedAt,
      changesRequestedComment: isRequestChanges ? reviewComment?.trim() : existing.changesRequestedComment,
      updatedAt: now,
    };

    storageEngine.saveTask(updatedTask, user);

    // Audit log
    const oldStatusLabel = oldStatus.replace('_', ' ').toUpperCase();
    const targetStatusLabel = targetStatus.replace('_', ' ').toUpperCase();
    const action = isNowBlocked
      ? 'blocked'
      : wasBlocked
      ? 'unblocked'
      : isRequestReview
      ? 'status_changed'
      : isApprove
      ? 'status_changed'
      : isRequestChanges
      ? 'status_changed'
      : 'status_changed';

    let commentText = `${user.displayName} moved status from "${oldStatusLabel}" to "${targetStatusLabel}".`;
    if (isNowBlocked) {
      commentText = `${user.displayName} marked task as BLOCKED: "${blockerReason}"`;
    } else if (wasBlocked) {
      commentText = `${user.displayName} resolved blocker and moved status to "${targetStatusLabel}".`;
    } else if (isRequestReview) {
      commentText = `${user.displayName} requested review of task.`;
    } else if (isApprove) {
      commentText = `${user.displayName} approved task and marked it Done.`;
    } else if (isRequestChanges) {
      commentText = `${user.displayName} requested changes: "${reviewComment?.trim()}".`;
    }

    auditService.logActivity({
      id: `log-${Date.now().toString(36)}`,
      workspaceId: existing.workspaceId,
      projectId: existing.projectId,
      taskId: existing.id,
      userId: user.uid,
      userDisplayName: user.displayName,
      action,
      fieldChanged: 'status',
      oldValue: oldStatusLabel,
      newValue: targetStatusLabel,
      commentText,
      createdAt: now,
    }, user);

    // Resolve project object safely for notifications
    const activeProject: Project = project || (storageEngine.getProjectById(existing.projectId, user) as Project) || {
      id: existing.projectId,
      name: 'Project',
      description: '',
      objective: '',
      status: 'active',
      priority: 'medium',
      ownerId: '',
      memberIds: [],
      startDate: '',
      dueDate: '',
      createdAt: now,
      updatedAt: now,
    };

    // Trigger Notifications only when database mutation successfully completes
    if (isRequestReview && updatedTask.reviewerId) {
      const reviewerUser = storageEngine.getUser(updatedTask.reviewerId);
      if (reviewerUser) {
        notificationService.notifyReviewRequested(updatedTask, activeProject, reviewerUser, user);
      }
    } else if (isApprove && updatedTask.assigneeId) {
      const assigneeUser = storageEngine.getUser(updatedTask.assigneeId);
      if (assigneeUser) {
        notificationService.notifyReviewApproved(updatedTask, activeProject, assigneeUser, user);
        if (assigneeUser.uid !== user.uid) {
          try {
            directMessageService.sendMessage({
              recipientId: updatedTask.assigneeId,
              subject: `Task Approved & Completed: ${updatedTask.title}`,
              body: `Hello ${assigneeUser.displayName},\n\nYour task "${updatedTask.title}" in project "${activeProject.name}" has been approved by reviewer ${user.displayName}.\n\nStage/State: In Review ➔ Done (Completed)`,
            }, user);
          } catch (err) {
            console.warn('Failed to send direct message for task approval:', err);
          }
        }
      }
    } else if (isRequestChanges && updatedTask.assigneeId && reviewComment) {
      const assigneeUser = storageEngine.getUser(updatedTask.assigneeId);
      if (assigneeUser) {
        notificationService.notifyChangesRequested(updatedTask, activeProject, assigneeUser, user, reviewComment.trim());
        if (assigneeUser.uid !== user.uid) {
          try {
            directMessageService.sendMessage({
              recipientId: updatedTask.assigneeId,
              subject: `Changes Requested: ${updatedTask.title}`,
              body: `Hello ${assigneeUser.displayName},\n\nReviewer ${user.displayName} has requested changes on your task "${updatedTask.title}" in project "${activeProject.name}".\n\nStage/State: In Review ➔ In Progress (Changes Requested)\n\nFeedback:\n"${reviewComment.trim()}"\n\nPlease address the requested changes and submit for re-review.`,
            }, user);
          } catch (err) {
            console.warn('Failed to send direct message for changes requested:', err);
          }
        }
      }
    } else if (isNowBlocked && updatedTask.reviewerId && blockerReason) {
      const reviewerUser = storageEngine.getUser(updatedTask.reviewerId);
      if (reviewerUser) {
        notificationService.notifyTaskBlocked(updatedTask, activeProject, reviewerUser, user, blockerReason.trim());
      }
    }

    return updatedTask;
  }

  public async requestReview(taskId: string, user: UserProfile): Promise<Task> {
    return this.transitionStatus(taskId, 'in_review', undefined, user);
  }

  public async approveTask(taskId: string, user: UserProfile): Promise<Task> {
    return this.transitionStatus(taskId, 'done', undefined, user);
  }

  public async requestChanges(taskId: string, comment: string, user: UserProfile): Promise<Task> {
    return this.transitionStatus(taskId, 'in_progress', undefined, user, comment);
  }

  public async updateTask(
    taskId: string,
    updates: Partial<TaskFormData>,
    user: UserProfile
  ): Promise<Task> {
    if (user.status === 'blocked' || user.status === 'terminated') {
      throw new Error(`Permission denied: Your workspace account is ${user.status}. Access has been revoked.`);
    }

    if (user.role === 'viewer') {
      throw new Error('Permission denied: Viewers cannot edit tasks.');
    }

    const existing = storageEngine.getTaskById(taskId, user);
    if (!existing) {
      throw new Error(`Task ${taskId} not found.`);
    }

    const project = storageEngine.getProjectById(existing.projectId, user);
    if (!project) {
      throw new Error(`Project ${existing.projectId} not found.`);
    }

    const merged: TaskFormData = {
      title: updates.title ?? existing.title,
      description: updates.description ?? existing.description,
      assigneeId: updates.assigneeId !== undefined ? updates.assigneeId : existing.assigneeId,
      reviewerId: updates.reviewerId !== undefined ? updates.reviewerId : (existing.reviewerId || undefined),
      priority: updates.priority ?? existing.priority,
      status: updates.status ?? existing.status,
      blockerReason: updates.blockerReason ?? existing.blockerReason,
      dueDate: updates.dueDate ?? existing.dueDate,
      milestoneId: updates.milestoneId ?? existing.milestoneId,
    };

    if (merged.assigneeId && merged.assigneeId !== existing.assigneeId) {
      const targetUser = storageEngine.getUser(merged.assigneeId);
      const eligibility = validateAssigneeEligibility(targetUser, project);
      if (!eligibility.eligible) {
        throw new Error(`Permission denied: Cannot assign task. ${eligibility.reason}`);
      }
    }

    if (merged.reviewerId && merged.reviewerId !== existing.reviewerId) {
      const targetReviewer = storageEngine.getUser(merged.reviewerId);
      const eligibility = validateReviewerEligibility(targetReviewer, project);
      if (!eligibility.eligible) {
        throw new Error(`Permission denied: Cannot set reviewer. ${eligibility.reason}`);
      }
    }

    const validation = validateTaskForm(merged);
    if (!validation.isValid) {
      const firstError = Object.values(validation.errors)[0];
      throw new Error(firstError);
    }

    const updatedTask: Task = {
      ...existing,
      title: merged.title.trim(),
      description: merged.description.trim(),
      assigneeId: merged.assigneeId,
      reviewerId: merged.reviewerId || existing.reviewerId || null,
      priority: merged.priority,
      status: merged.status,
      blockerReason: merged.status === 'blocked' ? merged.blockerReason?.trim() : undefined,
      dueDate: merged.dueDate,
      milestoneId: merged.milestoneId,
      links: merged.links !== undefined ? merged.links : existing.links,
      updatedAt: new Date().toISOString(),
    };

    storageEngine.saveTask(updatedTask, user);

    const userDisplayName = user.displayName;
    let anyLogged = false;

    // 1. Assignee update
    if (merged.assigneeId !== existing.assigneeId) {
      anyLogged = true;
      const oldUser = existing.assigneeId ? (storageEngine.getUser(existing.assigneeId)?.displayName || 'Unassigned') : 'Unassigned';
      const newUser = merged.assigneeId ? (storageEngine.getUser(merged.assigneeId)?.displayName || 'Unassigned') : 'Unassigned';
      auditService.logActivity({
        id: `log-${Date.now().toString(36)}-assignee`,
        workspaceId: existing.workspaceId,
        projectId: existing.projectId,
        taskId: existing.id,
        userId: user.uid,
        userDisplayName,
        action: 'reassigned',
        fieldChanged: 'assignee',
        oldValue: oldUser,
        newValue: newUser,
        commentText: `${userDisplayName} reassigned task from "${oldUser}" to "${newUser}".`,
        createdAt: new Date().toISOString(),
      }, user);

      if (merged.assigneeId) {
        const assigneeUser = storageEngine.getUser(merged.assigneeId);
        if (assigneeUser) {
          const isReassignment = Boolean(existing.assigneeId && existing.assigneeId !== merged.assigneeId);
          notificationService.notifyTaskAssigned(updatedTask, project, assigneeUser, user, isReassignment);
        }
      }
    }

    // 2. Status update
    if (merged.status !== existing.status) {
      anyLogged = true;
      const oldStatus = existing.status.replace('_', ' ').toUpperCase();
      const newStatus = merged.status.replace('_', ' ').toUpperCase();
      auditService.logActivity({
        id: `log-${Date.now().toString(36)}-status`,
        workspaceId: existing.workspaceId,
        projectId: existing.projectId,
        taskId: existing.id,
        userId: user.uid,
        userDisplayName,
        action: merged.status === 'blocked' ? 'blocked' : 'status_changed',
        fieldChanged: 'status',
        oldValue: oldStatus,
        newValue: newStatus,
        commentText: `${userDisplayName} moved status from "${oldStatus}" to "${newStatus}".`,
        createdAt: new Date().toISOString(),
      }, user);
    }

    // 3. Priority update
    if (merged.priority !== existing.priority) {
      anyLogged = true;
      const oldPriority = existing.priority.toUpperCase();
      const newPriority = merged.priority.toUpperCase();
      auditService.logActivity({
        id: `log-${Date.now().toString(36)}-priority`,
        workspaceId: existing.workspaceId,
        projectId: existing.projectId,
        taskId: existing.id,
        userId: user.uid,
        userDisplayName,
        action: 'edited',
        fieldChanged: 'priority',
        oldValue: oldPriority,
        newValue: newPriority,
        commentText: `${userDisplayName} changed priority from "${oldPriority}" to "${newPriority}".`,
        createdAt: new Date().toISOString(),
      }, user);
    }

    // 4. Due date update
    if (merged.dueDate !== existing.dueDate) {
      anyLogged = true;
      auditService.logActivity({
        id: `log-${Date.now().toString(36)}-due`,
        workspaceId: existing.workspaceId,
        projectId: existing.projectId,
        taskId: existing.id,
        userId: user.uid,
        userDisplayName,
        action: 'edited',
        fieldChanged: 'dueDate',
        oldValue: existing.dueDate,
        newValue: merged.dueDate,
        commentText: `${userDisplayName} changed due date from "${existing.dueDate}" to "${merged.dueDate}".`,
        createdAt: new Date().toISOString(),
      }, user);
    }

    // 5. Title update
    if (merged.title.trim() !== existing.title.trim()) {
      anyLogged = true;
      auditService.logActivity({
        id: `log-${Date.now().toString(36)}-title`,
        workspaceId: existing.workspaceId,
        projectId: existing.projectId,
        taskId: existing.id,
        userId: user.uid,
        userDisplayName,
        action: 'edited',
        fieldChanged: 'title',
        oldValue: existing.title,
        newValue: merged.title.trim(),
        commentText: `${userDisplayName} updated title to "${merged.title.trim()}".`,
        createdAt: new Date().toISOString(),
      }, user);
    }

    // 6. Description update
    if (merged.description.trim() !== existing.description.trim()) {
      anyLogged = true;
      auditService.logActivity({
        id: `log-${Date.now().toString(36)}-desc`,
        workspaceId: existing.workspaceId,
        projectId: existing.projectId,
        taskId: existing.id,
        userId: user.uid,
        userDisplayName,
        action: 'edited',
        fieldChanged: 'description',
        oldValue: existing.description ? `${existing.description.slice(0, 30)}...` : 'none',
        newValue: `${merged.description.slice(0, 30)}...`,
        commentText: `${userDisplayName} updated task description.`,
        createdAt: new Date().toISOString(),
      }, user);
    }

    // 7. Blocker Reason update
    if (merged.blockerReason?.trim() !== (existing.blockerReason?.trim() || '') && merged.blockerReason) {
      anyLogged = true;
      auditService.logActivity({
        id: `log-${Date.now().toString(36)}-blocker`,
        workspaceId: existing.workspaceId,
        projectId: existing.projectId,
        taskId: existing.id,
        userId: user.uid,
        userDisplayName,
        action: 'blocked',
        fieldChanged: 'blocker reason',
        oldValue: existing.blockerReason || 'none',
        newValue: merged.blockerReason,
        commentText: `${userDisplayName} updated blocker reason: "${merged.blockerReason}".`,
        createdAt: new Date().toISOString(),
      }, user);
    }

    if (!anyLogged) {
      auditService.logActivity({
        id: `log-${Date.now().toString(36)}`,
        workspaceId: existing.workspaceId,
        projectId: existing.projectId,
        taskId: existing.id,
        userId: user.uid,
        userDisplayName,
        action: 'edited',
        commentText: `${userDisplayName} saved task changes.`,
        createdAt: new Date().toISOString(),
      }, user);
    }

    return updatedTask;
  }

  public async deleteTask(taskId: string, user: UserProfile): Promise<void> {
    if (user.status === 'blocked' || user.status === 'terminated') {
      throw new Error(`Permission denied: Your workspace account is ${user.status}. Access has been revoked.`);
    }
    if (user.role !== 'workspace_admin' && user.role !== 'project_lead') {
      throw new Error('Permission denied: Only Workspace Admins and Project Leads can delete tasks.');
    }
    storageEngine.deleteTask(taskId, user);
  }

  public async addTaskLink(
    taskId: string,
    url: string,
    title: string | undefined,
    user: UserProfile
  ): Promise<Task> {
    if (user.status === 'blocked' || user.status === 'terminated') {
      throw new Error(`Permission denied: Your workspace account is ${user.status}. Access has been revoked.`);
    }
    if (user.role === 'viewer') {
      throw new Error('Permission denied: Viewers have read-only access and cannot mutate tasks.');
    }
    const existing = this.getTaskById(taskId, user);
    if (!existing) {
      throw new Error('Task not found.');
    }
    const cleanUrl = url.trim();
    if (!cleanUrl) {
      throw new Error('A valid URL is required.');
    }

    const newLink: TaskLink = {
      id: `link-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      url: cleanUrl,
      title: title?.trim() || undefined,
      addedAt: new Date().toISOString(),
      addedByUid: user.uid,
      addedByName: user.displayName,
    };

    const currentLinks = existing.links || [];
    const updatedLinks = [...currentLinks, newLink];
    const updatedTask: Task = {
      ...existing,
      links: updatedLinks,
      updatedAt: new Date().toISOString(),
    };
    storageEngine.saveTask(updatedTask, user);

    auditService.logActivity({
      id: `log-${Date.now().toString(36)}-link`,
      workspaceId: existing.workspaceId,
      projectId: existing.projectId,
      taskId: existing.id,
      userId: user.uid,
      userDisplayName: user.displayName,
      action: 'edited',
      fieldChanged: 'attached link',
      newValue: cleanUrl,
      commentText: `${user.displayName} attached link: "${title?.trim() || cleanUrl}".`,
      createdAt: new Date().toISOString(),
    }, user);

    return updatedTask;
  }

  public async removeTaskLink(
    taskId: string,
    linkId: string,
    user: UserProfile
  ): Promise<Task> {
    if (user.status === 'blocked' || user.status === 'terminated') {
      throw new Error(`Permission denied: Your workspace account is ${user.status}. Access has been revoked.`);
    }
    if (user.role === 'viewer') {
      throw new Error('Permission denied: Viewers have read-only access and cannot mutate tasks.');
    }
    const existing = this.getTaskById(taskId, user);
    if (!existing) {
      throw new Error('Task not found.');
    }
    const currentLinks = existing.links || [];
    const removedLink = currentLinks.find(l => l.id === linkId);
    const updatedLinks = currentLinks.filter(l => l.id !== linkId);
    const updatedTask: Task = {
      ...existing,
      links: updatedLinks,
      updatedAt: new Date().toISOString(),
    };
    storageEngine.saveTask(updatedTask, user);

    if (removedLink) {
      auditService.logActivity({
        id: `log-${Date.now().toString(36)}-link-rm`,
        workspaceId: existing.workspaceId,
        projectId: existing.projectId,
        taskId: existing.id,
        userId: user.uid,
        userDisplayName: user.displayName,
        action: 'edited',
        fieldChanged: 'removed link',
        oldValue: removedLink.url,
        commentText: `${user.displayName} removed attached link "${removedLink.title || removedLink.url}".`,
        createdAt: new Date().toISOString(),
      }, user);
    }

    return updatedTask;
  }

  public subscribe(
    projectId: string,
    user: UserProfile,
    listener: (tasks: Task[]) => void
  ): () => void {
    const update = () => {
      try {
        const list = storageEngine.getTasks(projectId, user);
        listener(list);
      } catch {
        listener([]);
      }
    };
    update();
    return storageEngine.subscribe(update);
  }

  public subscribeAll(
    user: UserProfile,
    listener: (tasks: Task[]) => void
  ): () => void {
    const update = () => {
      try {
        const list = storageEngine.getAllAccessibleTasks(user);
        listener(list);
      } catch {
        listener([]);
      }
    };
    update();
    return storageEngine.subscribe(update);
  }
}

export const taskService = new TaskService();
