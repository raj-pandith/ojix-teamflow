import {
  Project,
  ProjectFormData,
  ProjectDeletionNotice,
  TaskReassignmentDecision,
  RemoveMemberResult,
  CrmRawProject,
  CrmImportReport,
} from '../types/project';
import { UserProfile } from '../types/auth';
import { Task } from '../types/task';
import { storageEngine } from './storageEngine';
import { validateProjectForm } from '../domain/validation';
import { notificationService } from './notificationService';

class ProjectService {
  public getProjects(user: UserProfile): Project[] {
    return storageEngine.getProjects(user);
  }

  public getProjectById(projectId: string, user: UserProfile): Project | undefined {
    return storageEngine.getProjectById(projectId, user);
  }

  public async createProject(data: ProjectFormData, user: UserProfile): Promise<Project> {
    if (user.status === 'blocked' || user.status === 'terminated') {
      throw new Error(`Permission denied: Your workspace account is ${user.status}. Access has been revoked.`);
    }

    if (user.role !== 'workspace_admin' && user.role !== 'project_lead') {
      throw new Error('Permission denied: Only Workspace Admins and Project Leads can create projects.');
    }

    const validation = validateProjectForm(data);
    if (!validation.isValid) {
      const firstError = Object.values(validation.errors)[0];
      throw new Error(firstError);
    }

    const idempotencyKey = `create-project-${data.name}-${user.uid}-${data.crmMetadata?.externalId || ''}`;
    return storageEngine.executeIdempotent(idempotencyKey, async () => {
      // Workspace Admins are always added by default on every new project created
      const adminUsers = storageEngine
        .getUsers()
        .filter(u => u.role === 'workspace_admin' && u.status !== 'blocked' && u.status !== 'terminated');
      const adminIds = adminUsers.map(u => u.uid);

      const newProject: Project = {
        id: `proj-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
        workspaceId: 'ws-ojix-main',
        name: data.name.trim(),
        objective: data.objective.trim(),
        ownerId: user.uid,
        status: data.status,
        startDate: data.startDate,
        dueDate: data.dueDate,
        memberIds: Array.from(new Set([user.uid, ...adminIds, ...(data.memberIds || [])])),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...(data.crmMetadata ? { crmMetadata: data.crmMetadata } : {}),
      };

      storageEngine.saveProject(newProject, user);

      // Notify newly added members
      try {
        const otherMembers = newProject.memberIds.filter(mId => mId !== user.uid);
        for (const mId of otherMembers) {
          const mProfile = storageEngine.getUser(mId);
          if (mProfile) {
            notificationService.notifyProjectMembership(newProject, mProfile, 'added_member', user);
          }
        }
      } catch (err) {
        console.warn('Failed to notify project members on create:', err);
      }

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

    // Notify newly added or removed members
    try {
      const addedMembers = updated.memberIds.filter(id => !existing.memberIds.includes(id));
      const removedMembers = existing.memberIds.filter(id => !updated.memberIds.includes(id));
      for (const mId of addedMembers) {
        if (mId !== user.uid) {
          const mProfile = storageEngine.getUser(mId);
          if (mProfile) {
            notificationService.notifyProjectMembership(updated, mProfile, 'added_member', user);
          }
        }
      }
      for (const mId of removedMembers) {
        if (mId !== user.uid) {
          const mProfile = storageEngine.getUser(mId);
          if (mProfile) {
            notificationService.notifyProjectMembership(updated, mProfile, 'removed_member', user);
          }
        }
      }
    } catch (err) {
      console.warn('Failed to notify member changes on update:', err);
    }

    return updated;
  }

  public async deleteProject(projectId: string, user: UserProfile, reason?: string): Promise<void> {
    storageEngine.deleteProject(projectId, user, reason);
  }

  public async addTeamMember(
    projectId: string,
    userId: string,
    caller: UserProfile
  ): Promise<Project> {
    const existing = storageEngine.getProjectById(projectId, caller);
    if (existing && existing.memberIds.includes(userId)) {
      return existing;
    }
    const idempotencyKey = `add-team-member-${projectId}-${userId}-${caller.uid}`;
    return storageEngine.executeIdempotent(idempotencyKey, async () => {
      return storageEngine.addTeamMember(projectId, userId, caller);
    });
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

  public async importCrmProjects(
    crmProjects: CrmRawProject[],
    user: UserProfile
  ): Promise<CrmImportReport> {
    if (user.status === 'blocked' || user.status === 'terminated') {
      throw new Error(`Permission denied: Your workspace account is ${user.status}. Access has been revoked.`);
    }

    if (user.role !== 'workspace_admin') {
      throw new Error('Permission denied: Only Workspace Admins can import projects from ClientFlow CRM.');
    }

    const importedProjects: Project[] = [];
    const failedProjects: Array<{ id: string; name: string; reason: string }> = [];

    for (const crmProj of crmProjects) {
      const projName = (crmProj.name || crmProj.title || '').trim();
      const projObjective = (crmProj.objective || '').trim();
      const crmId = crmProj.id || crmProj.dealId || '';

      if (!crmId) {
        failedProjects.push({
          id: crmId || 'unknown',
          name: projName || 'Unnamed CRM Project',
          reason: 'Missing external project identifier.',
        });
        continue;
      }

      if (
        storageEngine.isCrmProjectImported(crmId) ||
        (crmProj.dealId && storageEngine.isCrmProjectImported(crmProj.dealId))
      ) {
        failedProjects.push({
          id: crmId,
          name: projName || crmId,
          reason: 'This project has already been imported into TeamFlow.',
        });
        continue;
      }

      const formData: ProjectFormData = {
        name: projName,
        objective: projObjective || `Imported from OJIX ClientFlow CRM (Deal ID: ${crmProj.dealId || crmId}).`,
        status: (crmProj.status === 'active' || crmProj.status === 'planning' || crmProj.status === 'on_hold')
          ? crmProj.status
          : 'active',
        startDate: crmProj.startDate || '',
        dueDate: crmProj.dueDate || '',
        memberIds: [],
        crmMetadata: {
          source: 'clientflow_crm',
          externalId: crmProj.id,
          dealId: crmProj.dealId,
          clientName: crmProj.client?.name,
          clientEmail: crmProj.client?.email,
          clientPhone: crmProj.client?.phone,
          dealValue: crmProj.dealValue,
          dealStage: crmProj.dealStage,
          temperature: crmProj.temperature,
          sourceStatus: crmProj.status,
          isReadyForExecution: crmProj.isReadyForExecution,
          crmWorkspaceId: crmProj.workspaceId,
          crmWorkspaceName: crmProj.workspaceName,
          sourceCreatedAt: crmProj.createdAt,
          lastActivityAt: crmProj.lastActivityAt,
          importedAt: new Date().toISOString(),
          importedByUid: user.uid,
        },
      };

      const validation = validateProjectForm(formData);
      if (!validation.isValid) {
        const errorMsg = Object.values(validation.errors)[0] || 'Invalid project details';
        failedProjects.push({
          id: crmId,
          name: projName || crmId,
          reason: errorMsg,
        });
        continue;
      }

      try {
        const created = await this.createProject(formData, user);
        importedProjects.push(created);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Creation failed';
        failedProjects.push({
          id: crmId,
          name: projName || crmId,
          reason: msg,
        });
      }
    }

    return {
      success: failedProjects.length === 0,
      totalRequested: crmProjects.length,
      importedCount: importedProjects.length,
      failedCount: failedProjects.length,
      importedProjects,
      failedProjects,
    };
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
