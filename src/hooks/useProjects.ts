import { useState, useEffect } from 'react';
import { Project, ProjectFormData, ProjectDeletionNotice } from '../types/project';
import { projectService } from '../services/projectService';
import { useAuth } from './useAuth';
import { useToast } from './useToast';

export function useProjects() {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>('proj-infra-01');
  const [deletionNotices, setDeletionNotices] = useState<ProjectDeletionNotice[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!currentUser) {
      setProjects([]);
      setDeletionNotices([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const updateNotices = () => {
      setDeletionNotices(projectService.getDeletionNotices(currentUser));
    };

    updateNotices();

    const unsubscribe = projectService.subscribe(currentUser, list => {
      setProjects(list);
      updateNotices();
      setLoading(false);
      // Auto-select first project if active is missing
      if (list.length > 0 && !list.some(p => p.id === activeProjectId)) {
        setActiveProjectId(list[0].id);
      }
    });

    return () => unsubscribe();
  }, [currentUser, activeProjectId]);

  const activeProject = projects.find(p => p.id === activeProjectId) || projects[0] || null;

  const createProject = async (data: ProjectFormData): Promise<Project | null> => {
    if (!currentUser) return null;
    try {
      const created = await projectService.createProject(data, currentUser);
      showToast('success', 'Project Created', `"${created.name}" is now active.`);
      setActiveProjectId(created.id);
      return created;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create project';
      showToast('error', 'Project Creation Rejected', msg);
      throw err;
    }
  };

  const updateProject = async (
    projectId: string,
    updates: Partial<ProjectFormData>
  ): Promise<Project | null> => {
    if (!currentUser) return null;
    try {
      const updated = await projectService.updateProject(projectId, updates, currentUser);
      showToast('success', 'Project Updated', `Saved changes to "${updated.name}".`);
      return updated;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update project';
      showToast('error', 'Update Failed', msg);
      throw err;
    }
  };

  const deleteProject = async (projectId: string): Promise<void> => {
    if (!currentUser) return;
    try {
      const targetProj = projects.find(p => p.id === projectId);
      const name = targetProj ? targetProj.name : 'Project';
      await projectService.deleteProject(projectId, currentUser);
      showToast('info', 'Project Deleted', `"${name}" and all associated tasks have been removed.`);
      // If we deleted the active project, switch to the first remaining one
      const remaining = projects.filter(p => p.id !== projectId);
      if (remaining.length > 0) {
        setActiveProjectId(remaining[0].id);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete project';
      showToast('error', 'Project Deletion Rejected', msg);
      throw err;
    }
  };

  const dismissNotice = (noticeId: string) => {
    if (!currentUser) return;
    projectService.dismissDeletionNotice(noticeId, currentUser);
    setDeletionNotices(projectService.getDeletionNotices(currentUser));
  };

  return {
    projects,
    activeProject,
    activeProjectId,
    setActiveProjectId,
    deletionNotices,
    dismissNotice,
    loading,
    createProject,
    updateProject,
    deleteProject,
  };
}
