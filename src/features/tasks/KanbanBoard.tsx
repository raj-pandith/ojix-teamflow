import React, { useState } from 'react';
import { Task, TaskStatus } from '../../types/task';
import { UserProfile } from '../../types/auth';
import { TaskCard } from '../../components/tasks/TaskCard';
import { BlockerModal } from '../../components/tasks/BlockerModal';
import { TaskDetailModal } from '../../components/tasks/TaskDetailModal';
import { storageEngine } from '../../services/storageEngine';

interface KanbanBoardProps {
  tasks: Task[];
  canMutate: boolean;
  currentUser: UserProfile | null;
  onTransitionStatus: (taskId: string, status: TaskStatus, blockerReason?: string) => Promise<unknown>;
  onUpdateTask?: (taskId: string, updates: { assigneeId: string | null }) => Promise<unknown>;
  onDeleteTask: (taskId: string) => Promise<unknown>;
}

const COLUMNS: Array<{ status: TaskStatus; label: string; icon: string }> = [
  { status: 'backlog', label: 'Backlog', icon: '📥' },
  { status: 'todo', label: 'To Do', icon: '📝' },
  { status: 'in_progress', label: 'In Progress', icon: '⚙️' },
  { status: 'in_review', label: 'In Review', icon: '👀' },
  { status: 'blocked', label: 'Blocked', icon: '⚠️' },
  { status: 'done', label: 'Done', icon: '✅' },
];

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  tasks,
  canMutate,
  currentUser,
  onTransitionStatus,
  onUpdateTask,
  onDeleteTask,
}) => {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [pendingBlockerTask, setPendingBlockerTask] = useState<Task | null>(null);
  const [activeDragOverCol, setActiveDragOverCol] = useState<TaskStatus | null>(null);

  const users = storageEngine.getUsers();

  const handleDragOver = (e: React.DragEvent, colStatus: TaskStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (activeDragOverCol !== colStatus) {
      setActiveDragOverCol(colStatus);
    }
  };

  const handleDragLeave = () => {
    setActiveDragOverCol(null);
  };

  const handleDrop = async (e: React.DragEvent, targetStatus: TaskStatus) => {
    e.preventDefault();
    setActiveDragOverCol(null);
    const taskId = e.dataTransfer.getData('text/plain');
    if (!taskId) return;

    const task = tasks.find(t => t.id === taskId);
    if (!task || task.status === targetStatus) return;

    if (targetStatus === 'blocked') {
      setPendingBlockerTask(task);
      return;
    }

    try {
      await onTransitionStatus(task.id, targetStatus);
    } catch {
      // Toast handles error display
    }
  };

  const handleQuickMove = async (task: Task, targetStatus: TaskStatus) => {
    if (targetStatus === 'blocked') {
      setPendingBlockerTask(task);
      return;
    }
    try {
      await onTransitionStatus(task.id, targetStatus);
    } catch {
      // Toast handles error display
    }
  };

  const handleBlockerConfirm = async (reason: string) => {
    if (!pendingBlockerTask) return;
    try {
      await onTransitionStatus(pendingBlockerTask.id, 'blocked', reason);
    } finally {
      setPendingBlockerTask(null);
    }
  };

  return (
    <div className="kanban-board-container">
      <div className="kanban-grid">
        {COLUMNS.map(col => {
          const colTasks = tasks.filter(t => t.status === col.status);
          const isDragOver = activeDragOverCol === col.status;

          return (
            <div
              key={col.status}
              className={`kanban-column ${isDragOver ? 'kanban-column-dragover' : ''} col-${col.status}`}
              onDragOver={e => handleDragOver(e, col.status)}
              onDragLeave={handleDragLeave}
              onDrop={e => handleDrop(e, col.status)}
            >
              <div className="kanban-column-header">
                <div className="column-title-group">
                  <span className="column-icon">{col.icon}</span>
                  <h3 className="column-name">{col.label}</h3>
                </div>
                <span className="column-count-badge">{colTasks.length}</span>
              </div>

              <div className="kanban-cards-list">
                {colTasks.map(task => {
                  const assignee = users.find(u => u.uid === task.assigneeId);
                  return (
                    <TaskCard
                      key={task.id}
                      task={task}
                      assigneeName={assignee?.displayName}
                      onClick={() => {
                        setSelectedTask(task);
                        setIsDetailOpen(true);
                      }}
                      onQuickMove={status => handleQuickMove(task, status)}
                      canMutate={canMutate}
                    />
                  );
                })}

                {colTasks.length === 0 && (
                  <div className="kanban-empty-dropzone">
                    <span>Drop tasks here</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Task Detail Modal */}
      <TaskDetailModal
        task={selectedTask}
        isOpen={isDetailOpen}
        onClose={() => {
          setIsDetailOpen(false);
          setSelectedTask(null);
        }}
        currentUser={currentUser}
        onDeleteTask={onDeleteTask}
        onUpdateTask={onUpdateTask}
        canMutate={canMutate}
      />

      {/* Mandatory Blocker Reason Modal */}
      <BlockerModal
        isOpen={!!pendingBlockerTask}
        onClose={() => setPendingBlockerTask(null)}
        onConfirm={handleBlockerConfirm}
        taskTitle={pendingBlockerTask?.title || ''}
      />
    </div>
  );
};
