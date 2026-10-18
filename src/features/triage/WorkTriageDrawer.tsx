import React, { useState } from 'react';
import { Task, TaskPriority } from '../../types/task';
import { Project } from '../../types/project';
import { UserProfile } from '../../types/auth';
import { Button } from '../../components/common/Button';
import { isTaskOverdue, formatDisplayDate } from '../../domain/timezone';
import { isUserEligibleForAssignment } from '../../domain/validation';

interface WorkTriageDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project | null;
  tasks: Task[];
  currentUser: UserProfile;
  onCreateTask: (projectId: string, data: { title: string; description: string; priority: TaskPriority; status: 'todo'; dueDate: string; assigneeId: string | null }) => Promise<unknown>;
  onSelectTask?: (task: Task) => void;
}

export const WorkTriageDrawer: React.FC<WorkTriageDrawerProps> = ({
  isOpen,
  onClose,
  project,
  tasks,
  currentUser,
  onCreateTask,
  onSelectTask,
}) => {
  const [activeTab, setActiveTab] = useState<'overdue' | 'blockers' | 'extraction'>('overdue');
  const [meetingNotes, setMeetingNotes] = useState('');
  const [extractedTasks, setExtractedTasks] = useState<Array<{ title: string; assignee: string; priority: TaskPriority }>>([]);
  const [addingTaskIndex, setAddingTaskIndex] = useState<number | null>(null);

  const canCreateTask = currentUser?.role === 'workspace_admin' || currentUser?.role === 'project_lead';

  if (!isOpen) return null;

  const overdue = tasks.filter(t => isTaskOverdue(t.dueDate, t.status));
  const blocked = tasks.filter(t => t.status === 'blocked');

  const sampleMeetingNotes = `Q4 Sync Action Items:
- Alex to configure TLS 1.3 cipher suites on ingress gateway (High priority)
- Marcus to benchmark Redis failover under packet loss (Urgent priority)
- Sarah to draft runbook for disaster recovery failover (Medium priority)`;

  const handleParseNotes = () => {
    const lines = meetingNotes.split('\n').filter(l => l.trim().startsWith('-'));
    const parsed = lines.map(line => {
      const clean = line.replace(/^-\s*/, '');
      const priorityMatch = clean.match(/\((urgent|high|medium|low)\s+priority\)/i);
      const priority: TaskPriority = priorityMatch
        ? (priorityMatch[1].toLowerCase() as TaskPriority)
        : 'medium';
      const title = clean.replace(/\s*\([^)]*\)\s*$/, '').trim();
      return {
        title,
        assignee: 'Marcus Vance',
        priority,
      };
    });
    setExtractedTasks(parsed);
  };

  const handleAddExtractedTask = async (task: { title: string; priority: TaskPriority }, index: number) => {
    if (!project || !canCreateTask) return;
    setAddingTaskIndex(index);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const isEligible = isUserEligibleForAssignment(currentUser, project);
      await onCreateTask(project.id, {
        title: task.title,
        description: 'Imported from team notes.',
        priority: task.priority,
        status: 'todo',
        dueDate: today,
        assigneeId: isEligible ? currentUser.uid : null,
      });
      setExtractedTasks(prev => prev.filter((_, i) => i !== index));
    } finally {
      setAddingTaskIndex(null);
    }
  };

  return (
    <div className="drawer-backdrop animate-fade-in" onClick={onClose}>
      <div className="drawer-panel" onClick={e => e.stopPropagation()}>
        <div className="drawer-header">
          <div className="drawer-title-group">
            <span className="drawer-icon">⚡</span>
            <div>
              <h3 className="drawer-title">Work Triage</h3>
              <p className="drawer-subtitle">Unblock bottlenecks, clear overdue tasks, and parse meeting notes into work items.</p>
            </div>
          </div>
          <button className="drawer-close-btn" onClick={onClose} aria-label="Close drawer">
            ✕
          </button>
        </div>

        {/* Tab buttons */}
        <div className="drawer-tabs">
          <button
            className={`drawer-tab-btn ${activeTab === 'overdue' ? 'active' : ''}`}
            onClick={() => setActiveTab('overdue')}
          >
            Overdue ({overdue.length})
          </button>
          <button
            className={`drawer-tab-btn ${activeTab === 'blockers' ? 'active' : ''}`}
            onClick={() => setActiveTab('blockers')}
          >
            Blockers ({blocked.length})
          </button>
          <button
            className={`drawer-tab-btn ${activeTab === 'extraction' ? 'active' : ''}`}
            onClick={() => setActiveTab('extraction')}
          >
            Notes to Tasks
          </button>
        </div>

        <div className="drawer-body">
          {/* Overdue Triage */}
          {activeTab === 'overdue' && (
            <div className="triage-section">
              <p className="triage-lead">
                Tasks past deadline. Rebalance assignments or update milestone schedules.
              </p>
              <div className="triage-items-list">
                {overdue.map(t => (
                  <div key={t.id} className="triage-card triage-card-overdue">
                    <div className="triage-card-header">
                      <span className="badge badge-urgent">OVERDUE</span>
                      <span className="triage-due-date">Due: {formatDisplayDate(t.dueDate)}</span>
                    </div>
                    <h4 className="triage-card-title">{t.title}</h4>
                    <p className="triage-recommendation">
                      💡 <strong>Action:</strong> Adjust due date or reassign to keep momentum.
                    </p>
                  </div>
                ))}
                {overdue.length === 0 && (
                  <div className="empty-panel-state">
                    <p>No overdue tasks in this project.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Blocker Analysis */}
          {activeTab === 'blockers' && (
            <div className="triage-section">
              <p className="triage-lead">
                Active bottlenecks slowing down deliverables.
              </p>
              <div className="triage-items-list">
                {blocked.map(t => (
                  <div
                    key={t.id}
                    className="triage-card triage-card-blocked"
                    onClick={() => onSelectTask?.(t)}
                    style={{ cursor: onSelectTask ? 'pointer' : 'default' }}
                    title={onSelectTask ? 'Click to navigate to Kanban and emphasize task' : undefined}
                  >
                    <div className="triage-card-header">
                      <span className="badge badge-status-blocked">BLOCKED</span>
                      <span className="badge badge-urgent">{t.priority.toUpperCase()}</span>
                    </div>
                    <h4 className="triage-card-title">{t.title}</h4>
                    <div className="triage-blocker-text">
                      <strong>Reason:</strong> {t.blockerReason}
                    </div>
                  </div>
                ))}
                {blocked.length === 0 && (
                  <div className="empty-panel-state">
                    <p>No blocked items currently recorded.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Meeting Notes Extraction */}
          {activeTab === 'extraction' && (
            <div className="triage-section">
              {!canCreateTask ? (
                <div
                  style={{
                    padding: '32px 16px',
                    textAlign: 'center',
                    background: 'rgba(255, 255, 255, 0.03)',
                    borderRadius: '8px',
                    border: '1px solid var(--border-subtle, #30363d)',
                  }}
                >
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔒</div>
                  <h4 style={{ margin: '0 0 6px 0', color: 'var(--text-primary, #f0f6fc)' }}>
                    Task Creation Restricted
                  </h4>
                  <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary, #8b949e)', lineHeight: 1.5 }}>
                    Only Project Leads and Workspace Admins can convert meeting notes into tasks.
                  </p>
                </div>
              ) : (
                <>
                  <p className="triage-lead">
                    Paste notes or bullet points below to convert them directly into tasks.
                  </p>
                  <div className="notes-input-group">
                    <div className="notes-header-actions">
                      <span className="form-label">Raw Meeting Notes</span>
                      <button
                        type="button"
                        className="btn-sample-notes"
                        onClick={() => setMeetingNotes(sampleMeetingNotes)}
                      >
                        Paste Sample Postmortem
                      </button>
                    </div>
                    <textarea
                      className="form-textarea"
                      rows={5}
                      value={meetingNotes}
                      onChange={e => setMeetingNotes(e.target.value)}
                      placeholder="Paste bullets starting with '- '..."
                    />
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleParseNotes}
                      disabled={!meetingNotes.trim()}
                      className="btn-extract-actions"
                    >
                      ⚡ Parse Action Items
                    </Button>
                  </div>

                  {extractedTasks.length > 0 && (
                    <div className="extracted-results">
                      <h4 className="extracted-title">Extracted Action Items ({extractedTasks.length})</h4>
                      <div className="extracted-list">
                        {extractedTasks.map((task, i) => (
                          <div key={i} className="extracted-item-row">
                            <div className="extracted-info">
                              <span className={`badge badge-${task.priority}`}>{task.priority.toUpperCase()}</span>
                              <span className="extracted-task-name">{task.title}</span>
                            </div>
                            <Button
                              variant="secondary"
                              size="sm"
                              isLoading={addingTaskIndex === i}
                              onClick={() => handleAddExtractedTask(task, i)}
                            >
                              + Add to Project
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
