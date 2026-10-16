import { useState, useEffect } from 'react';
import { Task, TaskFormData, TaskStatus, TaskFilterOptions } from '../types/task';
import { taskService } from '../services/taskService';
import { useAuth } from './useAuth';
import { useToast } from './useToast';
import { isTaskOverdue, getDueDateCategory } from '../domain/timezone';

export function useTasks(projectId?: string) {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filters, setFilters] = useState<TaskFilterOptions>({
    searchQuery: '',
    status: 'all',
    priority: 'all',
    assigneeId: 'all',
    dueDateRange: 'all',
  });

  useEffect(() => {
    if (!currentUser) {
      setTasks([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    let unsubscribe: () => void;

    if (projectId) {
      unsubscribe = taskService.subscribe(projectId, currentUser, list => {
        setTasks(list);
        setLoading(false);
      });
    } else {
      unsubscribe = taskService.subscribeAll(currentUser, list => {
        setTasks(list);
        setLoading(false);
      });
    }

    return () => unsubscribe();
  }, [projectId, currentUser]);

  const createTask = async (targetProjectId: string, data: TaskFormData): Promise<Task | null> => {
    if (!currentUser) return null;
    try {
      const created = await taskService.createTask(targetProjectId, data, currentUser);
      showToast('success', 'Task Created', `"${created.title}" added successfully.`);
      return created;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create task';
      showToast('error', 'Task Creation Rejected', msg);
      throw err;
    }
  };

  const transitionStatus = async (
    taskId: string,
    targetStatus: TaskStatus,
    blockerReason?: string
  ): Promise<Task | null> => {
    if (!currentUser) return null;
    try {
      const updated = await taskService.transitionStatus(taskId, targetStatus, blockerReason, currentUser);
      showToast('success', 'Status Transitioned', `Moved to ${targetStatus.replace('_', ' ').toUpperCase()}`);
      return updated;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid transition';
      showToast('error', 'Transition Rejected', msg);
      throw err;
    }
  };

  const updateTask = async (
    taskId: string,
    updates: Partial<TaskFormData>
  ): Promise<Task | null> => {
    if (!currentUser) return null;
    try {
      const updated = await taskService.updateTask(taskId, updates, currentUser);
      showToast('success', 'Task Updated', `Saved changes to "${updated.title}".`);
      return updated;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Update failed';
      showToast('error', 'Update Rejected', msg);
      throw err;
    }
  };

  const deleteTask = async (taskId: string): Promise<void> => {
    if (!currentUser) return;
    try {
      await taskService.deleteTask(taskId, currentUser);
      showToast('info', 'Task Removed', 'The task was deleted.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Deletion failed';
      showToast('error', 'Delete Rejected', msg);
      throw err;
    }
  };

  // Filtered task evaluation
  const filteredTasks = tasks.filter(task => {
    // Search filter
    if (filters.searchQuery) {
      const q = filters.searchQuery.toLowerCase();
      const matchTitle = task.title.toLowerCase().includes(q);
      const matchDesc = task.description.toLowerCase().includes(q);
      if (!matchTitle && !matchDesc) return false;
    }

    // Status filter
    if (filters.status && filters.status !== 'all' && task.status !== filters.status) {
      return false;
    }

    // Priority filter
    if (filters.priority && filters.priority !== 'all' && task.priority !== filters.priority) {
      return false;
    }

    // Assignee filter
    if (filters.assigneeId && filters.assigneeId !== 'all') {
      if (filters.assigneeId === 'unassigned') {
        if (task.assigneeId !== null) return false;
      } else if (task.assigneeId !== filters.assigneeId) {
        return false;
      }
    }

    // Due date range filter
    if (filters.dueDateRange && filters.dueDateRange !== 'all') {
      const cat = getDueDateCategory(task.dueDate, task.status);
      if (filters.dueDateRange === 'overdue' && cat !== 'overdue') return false;
      if (filters.dueDateRange === 'today' && cat !== 'due_today') return false;
      if (filters.dueDateRange === 'this_week' && cat !== 'due_today' && cat !== 'due_this_week') return false;
    }

    return true;
  });

  const myTasks = tasks.filter(t => t.assigneeId === currentUser?.uid);
  const overdueTasks = tasks.filter(t => isTaskOverdue(t.dueDate, t.status));
  const blockedTasks = tasks.filter(t => t.status === 'blocked');

  return {
    tasks,
    filteredTasks,
    myTasks,
    overdueTasks,
    blockedTasks,
    filters,
    setFilters,
    loading,
    createTask,
    transitionStatus,
    updateTask,
    deleteTask,
  };
}
