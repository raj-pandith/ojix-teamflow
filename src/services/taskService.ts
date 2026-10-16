import { Task, TaskFormData, TaskStatus } from '../types/task';
import { UserProfile } from '../types/auth';
import { storageEngine } from './storageEngine';
import { validateTaskForm } from '../domain/validation';
import { validateTaskTransition, canUserMoveTask } from '../domain/taskStateMachine';
import { auditService } from './auditService';

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
    if (user.role === 'viewer') {
      throw new Error('Permission denied: Viewers cannot create tasks.');
    }

    const validation = validateTaskForm(data);
    if (!validation.isValid) {
      const firstError = Object.values(validation.errors)[0];
      throw new Error(firstError);
    }

    const idempotencyKey = `create-task-${projectId}-${data.title}-${user.uid}`;
    return storageEngine.executeIdempotent(idempotencyKey, async () => {
      const newTask: Task = {
        id: `task-${Date.now().toString(36)}`,
        workspaceId: 'ws-ojix-main',
        projectId,
        title: data.title.trim(),
        description: data.description?.trim() || '',
        assigneeId: data.assigneeId || null,
        priority: data.priority,
        status: data.status,
        blockerReason: data.status === 'blocked' ? data.blockerReason?.trim() : undefined,
        dueDate: data.dueDate,
        milestoneId: data.milestoneId,
        createdBy: user.uid,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      storageEngine.saveTask(newTask, user);

      // Audit log
      auditService.logActivity({
        id: `log-${Date.now().toString(36)}`,
        workspaceId: 'ws-ojix-main',
        projectId,
        taskId: newTask.id,
        userId: user.uid,
        userDisplayName: user.displayName,
        action: 'created',
        commentText: `Task created with priority "${newTask.priority}" and status "${newTask.status}".`,
        createdAt: new Date().toISOString(),
      }, user);

      return newTask;
    });
  }

  public async transitionStatus(
    taskId: string,
    targetStatus: TaskStatus,
    blockerReason: string | undefined,
    user: UserProfile
  ): Promise<Task> {
    if (user.role === 'viewer') {
      throw new Error('Permission denied: Viewers cannot update task status.');
    }

    const existing = storageEngine.getTaskById(taskId, user);
    if (!existing) {
      throw new Error(`Task ${taskId} not found.`);
    }

    const project = storageEngine.getProjectById(existing.projectId, user);
    const moveAuth = canUserMoveTask(existing, user, project);
    if (!moveAuth.allowed) {
      throw new Error(moveAuth.reason || 'Permission denied: You are not authorized to move this task.');
    }

    const transitionResult = validateTaskTransition(existing, targetStatus, blockerReason);
    if (!transitionResult.valid) {
      throw new Error(transitionResult.error || 'Invalid transition.');
    }

    const oldStatus = existing.status;
    const isNowBlocked = targetStatus === 'blocked';
    const wasBlocked = oldStatus === 'blocked';

    const updatedTask: Task = {
      ...existing,
      status: targetStatus,
      blockerReason: isNowBlocked ? blockerReason?.trim() : undefined,
      updatedAt: new Date().toISOString(),
    };

    storageEngine.saveTask(updatedTask, user);

    // Audit log
    const action = isNowBlocked ? 'blocked' : wasBlocked ? 'unblocked' : 'status_changed';
    auditService.logActivity({
      id: `log-${Date.now().toString(36)}`,
      workspaceId: existing.workspaceId,
      projectId: existing.projectId,
      taskId: existing.id,
      userId: user.uid,
      userDisplayName: user.displayName,
      action,
      fieldChanged: 'status',
      oldValue: oldStatus,
      newValue: targetStatus,
      commentText: isNowBlocked
        ? `Marked blocked: ${blockerReason}`
        : wasBlocked
        ? `Resolved blocker and transitioned to ${targetStatus}.`
        : `Moved status from ${oldStatus} to ${targetStatus}.`,
      createdAt: new Date().toISOString(),
    }, user);

    return updatedTask;
  }

  public async updateTask(
    taskId: string,
    updates: Partial<TaskFormData>,
    user: UserProfile
  ): Promise<Task> {
    if (user.role === 'viewer') {
      throw new Error('Permission denied: Viewers cannot edit tasks.');
    }

    const existing = storageEngine.getTaskById(taskId, user);
    if (!existing) {
      throw new Error(`Task ${taskId} not found.`);
    }

    const merged: TaskFormData = {
      title: updates.title ?? existing.title,
      description: updates.description ?? existing.description,
      assigneeId: updates.assigneeId !== undefined ? updates.assigneeId : existing.assigneeId,
      priority: updates.priority ?? existing.priority,
      status: updates.status ?? existing.status,
      blockerReason: updates.blockerReason ?? existing.blockerReason,
      dueDate: updates.dueDate ?? existing.dueDate,
      milestoneId: updates.milestoneId ?? existing.milestoneId,
    };

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
      priority: merged.priority,
      status: merged.status,
      blockerReason: merged.status === 'blocked' ? merged.blockerReason?.trim() : undefined,
      dueDate: merged.dueDate,
      milestoneId: merged.milestoneId,
      updatedAt: new Date().toISOString(),
    };

    storageEngine.saveTask(updatedTask, user);

    auditService.logActivity({
      id: `log-${Date.now().toString(36)}`,
      workspaceId: existing.workspaceId,
      projectId: existing.projectId,
      taskId: existing.id,
      userId: user.uid,
      userDisplayName: user.displayName,
      action: 'edited',
      commentText: 'Task details updated.',
      createdAt: new Date().toISOString(),
    }, user);

    return updatedTask;
  }

  public async deleteTask(taskId: string, user: UserProfile): Promise<void> {
    if (user.role !== 'workspace_admin' && user.role !== 'project_lead') {
      throw new Error('Permission denied: Only Workspace Admins and Project Leads can delete tasks.');
    }
    storageEngine.deleteTask(taskId, user);
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
