import { Project, ProjectFormData, ProjectDeletionNotice, TaskReassignmentDecision, RemoveMemberResult } from '../types/project';
import { UserProfile } from '../types/auth';
import { Task } from '../types/task';
import { storageEngine } from './storageEngine';
import { validateProjectForm } from '../domain/validation';

class ProjectService {
  public getProjects(user: UserProfile): Project[] {
    return storageEngine.getProjects(user);
  }

  public getProjectById(projectId: string, user: UserProfile): Project | undefined {
    return storageEngine.getProjectById(projectId, user);
  }

  public async createProject(data: ProjectFormData, user: UserProfile): Promise<Project> {
    const validation = validateProjectForm(data);
    if (!validation.isValid) {
      const firstError = Object.values(validation.errors)[0];
      throw new Error(firstError);
    }

    const idempotencyKey = `create-project-${data.name}-${user.uid}`;
    return storageEngine.executeIdempotent(idempotencyKey, async () => {
      const newProject: Project = {
        id: `proj-${Date.now().toString(36)}`,
        workspaceId: 'ws-ojix-main',
        name: data.name.trim(),
        objective: data.objective.trim(),
        ownerId: user.uid,
        status: data.status,
        startDate: data.startDate,
        dueDate: data.dueDate,
        memberIds: Array.from(new Set([user.uid, ...(data.memberIds || [])])),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      storageEngine.saveProject(newProject, user);
      return newProject;
    });
  }

  public async updateProject(
    projectId: string,
    updates: Partial<ProjectFormData>,
    user: UserProfile
  ): Promise<Project> {
    const existing = storageEngine.getProjectById(projectId, user);
    if (!existing) {
      throw new Error(`Project ${projectId} not found.`);
    }

    const mergedData: ProjectFormData = {
      name: updates.name ?? existing.name,
      objective: updates.objective ?? existing.objective,
      status: updates.status ?? existing.status,
      startDate: updates.startDate ?? existing.startDate,
      dueDate: updates.dueDate ?? existing.dueDate,
      memberIds: updates.memberIds ?? [...existing.memberIds],
    };

    const validation = validateProjectForm(mergedData);
    if (!validation.isValid) {
      const firstError = Object.values(validation.errors)[0];
      throw new Error(firstError);
    }

    const updated: Project = {
      ...existing,
      ...mergedData,
      updatedAt: new Date().toISOString(),
    };

    storageEngine.saveProject(updated, user);
    return updated;
  }

  public async deleteProject(projectId: string, user: UserProfile): Promise<void> {
    storageEngine.deleteProject(projectId, user);
  }

  public async removeTeamMember(
    projectId: string,
    userId: string,
    caller: UserProfile,
    reassignments?: TaskReassignmentDecision[]
  ): Promise<Project & RemoveMemberResult> {
    const idempotencyKey = `remove-team-member-${projectId}-${userId}-${caller.uid}-${JSON.stringify(reassignments || [])}`;
    return storageEngine.executeIdempotent(idempotencyKey, async () => {
      return storageEngine.removeTeamMember(projectId, userId, caller, reassignments);
    });
  }

  public getMemberProjectTasks(
    projectId: string,
    userId: string,
    caller: UserProfile
  ): { activeTasks: Task[]; completedTasks: Task[] } {
    return storageEngine.getMemberProjectTasks(projectId, userId, caller);
  }

  public getDeletionNotices(user: UserProfile): ProjectDeletionNotice[] {
    return storageEngine.getDeletionNotices(user);
  }

  public dismissDeletionNotice(noticeId: string, user: UserProfile): void {
    storageEngine.dismissDeletionNotice(noticeId, user);
  }

  public subscribe(user: UserProfile, listener: (projects: Project[]) => void): () => void {
    const update = () => {
      try {
        const list = storageEngine.getProjects(user);
        listener(list);
      } catch {
        listener([]);
      }
    };
    update();
    return storageEngine.subscribe(update);
  }
}

export const projectService = new ProjectService();
