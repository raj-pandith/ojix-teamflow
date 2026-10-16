import { useState, useEffect } from 'react';
import { Project, ProjectFormData } from '../types/project';
import { projectService } from '../services/projectService';
import { useAuth } from './useAuth';
import { useToast } from './useToast';

export function useProjects() {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>('proj-infra-01');
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!currentUser) {
      setProjects([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = projectService.subscribe(currentUser, list => {
      setProjects(list);
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

  return {
    projects,
    activeProject,
    activeProjectId,
    setActiveProjectId,
    loading,
    createProject,
    updateProject,
  };
}
