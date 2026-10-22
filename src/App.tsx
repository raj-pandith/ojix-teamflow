import React, { useState, useEffect, useCallback } from 'react';
import { ToastProvider, useToast } from './hooks/useToast';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { useProjects } from './hooks/useProjects';
import { useTasks } from './hooks/useTasks';
import { Sidebar, ActiveNavTab } from './components/layout/Sidebar';
import { Topbar } from './components/layout/Topbar';
import { KanbanBoard } from './features/tasks/KanbanBoard';
import { GroupedListView } from './features/tasks/GroupedListView';
import { PersonalDashboard } from './features/dashboard/PersonalDashboard';
import { ProjectDashboard } from './features/dashboard/ProjectDashboard';
import { SecurityAssurancePanel } from './features/security/SecurityAssurancePanel';
import { UserManagementView } from './components/users/UserManagementView';
import { WorkTriageDrawer } from './features/triage/WorkTriageDrawer';
import { TaskCreateModal } from './components/tasks/TaskCreateModal';
import { ProjectCreateModal } from './components/projects/ProjectCreateModal';
import { CrmProjectImportModal } from './components/projects/CrmProjectImportModal';
import { ProjectDeleteModal } from './components/projects/ProjectDeleteModal';
import { UserInviteModal } from './components/users/UserInviteModal';
import { MessageCenterView } from './features/messages/MessageCenterView';
import { ProjectDeletionSummaryModal } from './features/messages/ProjectDeletionSummaryModal';
import { PushNotificationBanner } from './components/notifications/PushNotificationBanner';
import { TaskDetailModal } from './components/tasks/TaskDetailModal';
import { UserPersonaModal } from './components/users/UserPersonaModal';
import { useMessages } from './hooks/useMessages';
import { storageEngine } from './services/storageEngine';
import { Task, TaskStatus } from './types/task';
import { AppNotification } from './types/message';
import { FolderKanban } from 'lucide-react';
import { LoginPage } from './features/auth/LoginPage';
import { ActivateAccountPage } from './features/auth/ActivateAccountPage';
import './styles/global.css';

const MainApp: React.FC = () => {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const {
    projects,
    activeProject,
    activeProjectId,
    setActiveProjectId,
    createProject,
    updateProject,
    deleteProject,
  } = useProjects();
  const {
    tasks,
    filteredTasks,
    allMyTasks,
    filters,
    setFilters,
    createTask,
    transitionStatus,
    updateTask,
    deleteTask,
  } = useTasks(activeProjectId);

  const { totalUnreadCount } = useMessages();
  const [currentTab, setCurrentTab] = useState<ActiveNavTab>('kanban');
  const [messagesActiveTab, setMessagesActiveTab] = useState<'all' | 'unread' | 'notifications' | 'direct_messages' | 'sent'>('all');
  const [messagesSelectedConversationId, setMessagesSelectedConversationId] = useState<string | null>(null);
  const [isTriageOpen, setIsTriageOpen] = useState(false);
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [isCrmImportOpen, setIsCrmImportOpen] = useState(false);
  const [isInviteUserOpen, setIsInviteUserOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);
  const [inspectedTask, setInspectedTask] = useState<{ task: Task; commentId?: string | null } | null>(null);
  const [deletionSummaryNotif, setDeletionSummaryNotif] = useState<AppNotification | null>(null);
  const [isPersonaModalOpen, setIsPersonaModalOpen] = useState(false);

  const canMutate = currentUser?.role !== 'viewer';
  const canCreateProject = currentUser?.role === 'workspace_admin' || currentUser?.role === 'project_lead';
  const canCreateTask = currentUser?.role === 'workspace_admin' || currentUser?.role === 'project_lead';

  const [kanbanAssigneeFilter, setKanbanAssigneeFilter] = useState<string>('all');

  const handleOpenMessages = useCallback((conversationId?: string | null) => {
    if (conversationId) {
      setMessagesActiveTab('direct_messages');
      setMessagesSelectedConversationId(conversationId);
    }
    setCurrentTab('messages');
  }, []);

  const handleOpenDirectMessage = useCallback((memberId: string) => {
    if (!currentUser) return;
    const conversationId = `conv-${[currentUser.uid, memberId].sort().join('-')}`;
    handleOpenMessages(conversationId);
  }, [currentUser, handleOpenMessages]);

  const handleNavigateToTasks = useCallback(({
    assigneeId = 'all',
    status = 'all',
    view = 'list',
  }: {
    assigneeId?: string;
    status?: TaskStatus | 'all' | 'pending';
    view?: 'list' | 'kanban';
  }) => {
    setFilters({
      searchQuery: '',
      status: status,
      priority: 'all',
      assigneeId: assigneeId,
      dueDateRange: 'all',
    });
    setKanbanAssigneeFilter(assigneeId);
    setCurrentTab(view);
  }, [setFilters]);

  const handleSelectTaskFromDashboard = (task: Task) => {
    if (task.projectId && task.projectId !== activeProjectId) {
      setActiveProjectId(task.projectId);
    }
    setCurrentTab('kanban');
    setHighlightedTaskId(task.id);
  };

  const handleNavigateToProject = (projectId: string) => {
    setActiveProjectId(projectId);
    setCurrentTab('kanban');
  };

  const handleNavigateToTask = (projectId: string, taskId: string, commentId?: string | null) => {
    setActiveProjectId(projectId);
    setCurrentTab('kanban');
    if (!currentUser) return;
    try {
      const target = storageEngine.getTaskById(taskId, currentUser);
      if (target) {
        setInspectedTask({ task: target, commentId: commentId || null });
        setHighlightedTaskId(taskId);
      } else {
        showToast('error', 'Task Not Found', 'This task could not be found or you do not have permission to view it.');
      }
    } catch (e) {
      console.warn('Failed to inspect task from notification:', e);
      showToast('error', 'Access Denied', 'You do not have permission to access this project or task.');
    }
  };

  useEffect(() => {
    if ((currentTab === 'security' || currentTab === 'users') && currentUser?.role !== 'workspace_admin') {
      setCurrentTab('kanban');
    }
  }, [currentUser, currentTab]);

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        projects={projects}
        activeProjectId={activeProjectId}
        onSelectProject={id => {
          setActiveProjectId(id);
        }}
        onOpenNewProject={() => {
          if (canCreateProject) {
            setIsCreateProjectOpen(true);
          }
        }}
        currentUser={currentUser}
        unreadMessagesCount={totalUnreadCount}
        isMobileOpen={isMobileNavOpen}
        onCloseMobile={() => setIsMobileNavOpen(false)}
        onOpenProfile={() => setIsPersonaModalOpen(true)}
        onOpenFetchCrm={() => setIsCrmImportOpen(true)}
      />

      {/* Main Shell */}
      <div className="main-layout">
        <Topbar
          onOpenTriage={() => setIsTriageOpen(true)}
          onOpenNewTask={() => {
            if (!canCreateTask) return;
            if (!activeProject) {
              if (canCreateProject) {
                setIsCreateProjectOpen(true);
              }
            } else {
              setIsCreateTaskOpen(true);
            }
          }}
          onOpenAddUser={() => setIsInviteUserOpen(true)}
          onOpenMessages={() => handleOpenMessages()}
          unreadMessagesCount={totalUnreadCount}
          canMutate={canMutate}
          canCreateTask={canCreateTask}
          onToggleMobileNav={() => setIsMobileNavOpen(prev => !prev)}
          onOpenPersonaModal={() => setIsPersonaModalOpen(true)}
        />

        <main className="content-viewport animate-fade-in">
          {currentTab === 'kanban' && (
            <div className="tab-view-kanban">
              <KanbanBoard
                tasks={tasks}
                canMutate={canMutate}
                canCreateProject={canCreateProject}
                canCreateTask={canCreateTask}
                currentUser={currentUser}
                project={activeProject}
                onTransitionStatus={transitionStatus}
                onUpdateTask={updateTask}
                onDeleteTask={deleteTask}
                highlightedTaskId={highlightedTaskId}
                onClearHighlight={() => setHighlightedTaskId(null)}
                initialAssigneeFilter={kanbanAssigneeFilter}
                onOpenNewTask={() => {
                  if (!canCreateTask) return;
                  if (!activeProject) {
                    if (canCreateProject) {
                      setIsCreateProjectOpen(true);
                    }
                  } else {
                    setIsCreateTaskOpen(true);
                  }
                }}
                onSwitchToListView={() => setCurrentTab('list')}
              />
            </div>
          )}

          {currentTab === 'list' && (
            <div className="tab-view-list">
              <div className="view-header">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <div className="view-header-breadcrumb">
                      <span className="view-breadcrumb-item">
                        <FolderKanban size={13} style={{ color: 'var(--brand-primary, #C9662F)' }} />
                        <span>{activeProject?.name || 'Workspace'}</span>
                      </span>
                      <span className="view-breadcrumb-separator">/</span>
                      <span className="view-breadcrumb-current">All Tasks</span>
                    </div>
                    <h1 className="view-title">
                      {activeProject?.name ? `${activeProject.name} — All Tasks` : 'Task Directory'}
                    </h1>
                    <p className="view-subtitle">Filter by assignee, milestone, or urgency. Update status inline.</p>
                  </div>
                  {activeProject && (
                    <div className="view-header-stats">
                      <span className="view-stat-pill">
                        <span className="view-stat-num">{tasks.length}</span>
                        <span className="view-stat-lbl">Total Tasks</span>
                      </span>
                      <span className="view-stat-pill">
                        <span className="view-stat-num" style={{ color: 'var(--status-inprogress, #2563EB)' }}>
                          {tasks.filter(t => t.status === 'in_progress').length}
                        </span>
                        <span className="view-stat-lbl">In Progress</span>
                      </span>
                      <span className="view-stat-pill">
                        <span className="view-stat-num" style={{ color: 'var(--status-done, #16A34A)' }}>
                          {tasks.filter(t => t.status === 'done').length}
                        </span>
                        <span className="view-stat-lbl">Completed</span>
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <GroupedListView
                tasks={filteredTasks}
                filters={filters}
                onFilterChange={setFilters}
                canMutate={canMutate}
                currentUser={currentUser}
                project={activeProject}
                onTransitionStatus={transitionStatus}
                onUpdateTask={updateTask}
                onDeleteTask={deleteTask}
              />
            </div>
          )}

          {currentTab === 'dashboard' && (
            <ProjectDashboard
              project={activeProject}
              tasks={tasks}
              onSelectTask={handleSelectTaskFromDashboard}
              onGoToKanban={() => setCurrentTab('kanban')}
              onUpdateProject={updateProject}
              onDeleteProject={deleteProject}
              onRequestDelete={(id, name) => setProjectToDelete({ id, name })}
              currentUser={currentUser}
              onNavigateToTasks={handleNavigateToTasks}
              onOpenDirectMessage={handleOpenDirectMessage}
              onOpenFetchCrm={() => setIsCrmImportOpen(true)}
            />
          )}

          {currentTab === 'my-tasks' && currentUser && (
            <PersonalDashboard
              myTasks={allMyTasks}
              currentUser={currentUser}
              onSelectTask={handleSelectTaskFromDashboard}
              onGoToBoard={() => setCurrentTab('kanban')}
            />
          )}

          {currentTab === 'security' && (
            currentUser?.role === 'workspace_admin' ? (
              <SecurityAssurancePanel />
            ) : (
              <div className="empty-panel-state">
                <p>Access restricted: Workspace Admins only.</p>
              </div>
            )
          )}

          {currentTab === 'users' && currentUser && (
            currentUser.role === 'workspace_admin' ? (
              <UserManagementView currentUser={currentUser} />
            ) : (
              <div className="empty-panel-state">
                <p>Access restricted: Workspace Admins only.</p>
              </div>
            )
          )}

          {currentTab === 'messages' && (
            <MessageCenterView
              onNavigateToProject={handleNavigateToProject}
              onNavigateToTask={handleNavigateToTask}
              initialTab={messagesActiveTab}
              initialConversationId={messagesSelectedConversationId}
              onConversationChange={setMessagesSelectedConversationId}
              onTabChange={setMessagesActiveTab}
            />
          )}
        </main>
      </div>

      {/* Work Triage Slide-over Drawer (DEC-012) */}
      <WorkTriageDrawer
        isOpen={isTriageOpen}
        onClose={() => setIsTriageOpen(false)}
        project={activeProject}
        tasks={tasks}
        currentUser={currentUser!}
        onCreateTask={(projId, data) => createTask(projId, data)}
        onSelectTask={task => {
          setIsTriageOpen(false);
          handleSelectTaskFromDashboard(task);
        }}
      />

      {/* Task Creation Modal (Workspace Admin and Project Lead only) */}
      {activeProject && currentUser && canCreateTask && (
        <TaskCreateModal
          isOpen={isCreateTaskOpen}
          onClose={() => setIsCreateTaskOpen(false)}
          project={activeProject}
          currentUser={currentUser}
          onCreateTask={data => createTask(activeProject.id, data)}
        />
      )}

      {/* Project Creation Modal (Workspace Admin and Project Lead only) */}
      {canCreateProject && (
        <ProjectCreateModal
          isOpen={isCreateProjectOpen}
          onClose={() => setIsCreateProjectOpen(false)}
          onCreateProject={createProject}
          onOpenFetchCrm={() => setIsCrmImportOpen(true)}
          currentUser={currentUser}
        />
      )}

      {/* CRM Project Import Modal (Workspace Admin only) */}
      {currentUser && currentUser.role === 'workspace_admin' && (
        <CrmProjectImportModal
          isOpen={isCrmImportOpen}
          onClose={() => setIsCrmImportOpen(false)}
          currentUser={currentUser}
          onProjectsImported={importedList => {
            if (importedList.length > 0) {
              setActiveProjectId(importedList[0].id);
              showToast(
                'success',
                'Projects Imported',
                `Successfully imported ${importedList.length} project${importedList.length === 1 ? '' : 's'} from OJIX ClientFlow CRM.`
              );
            }
          }}
        />
      )}

      {/* User Invitation Modal (Workspace Admin only) */}
      {currentUser && (
        <UserInviteModal
          isOpen={isInviteUserOpen}
          onClose={() => setIsInviteUserOpen(false)}
          currentUser={currentUser}
        />
      )}

      {/* Project Deletion Confirmation Modal */}
      <ProjectDeleteModal
        isOpen={!!projectToDelete}
        projectId={projectToDelete?.id || ''}
        projectName={projectToDelete?.name || ''}
        onClose={() => setProjectToDelete(null)}
        onConfirm={async (id, reason) => {
          await deleteProject(id, reason);
          setProjectToDelete(null);
        }}
      />

      {/* Task Inspection Modal (from notification click-through) */}
      {inspectedTask && currentUser && (
        <TaskDetailModal
          task={inspectedTask.task}
          isOpen={true}
          onClose={() => setInspectedTask(null)}
          currentUser={currentUser}
          project={projects.find(p => p.id === inspectedTask.task.projectId) || activeProject}
          onDeleteTask={deleteTask}
          onUpdateTask={updateTask}
          canMutate={canMutate}
          highlightCommentId={inspectedTask.commentId}
        />
      )}

      {/* Project Deletion Summary Modal (from push notification click) */}
      {deletionSummaryNotif && (
        <ProjectDeletionSummaryModal
          isOpen={true}
          onClose={() => setDeletionSummaryNotif(null)}
          notification={deletionSummaryNotif}
        />
      )}

      {/* On-Screen Real-Time Push Notification Alerts */}
      <PushNotificationBanner
        currentUser={currentUser}
        onNavigateToProject={handleNavigateToProject}
        onNavigateToTask={handleNavigateToTask}
        onOpenMessages={handleOpenMessages}
        onOpenDeletionSummary={notif => {
          setDeletionSummaryNotif(notif);
        }}
      />

      {/* User Persona & Permitted Projects Profile Modal */}
      {currentUser && (
        <UserPersonaModal
          isOpen={isPersonaModalOpen}
          onClose={() => setIsPersonaModalOpen(false)}
          user={currentUser}
          onSelectProject={id => {
            setActiveProjectId(id);
            setCurrentTab('kanban');
          }}
          currentUserId={currentUser.uid}
        />
      )}
    </div>
  );
};

const AuthGate: React.FC = () => {
  const { currentUser, isAuthenticated } = useAuth();
  const [authView, setAuthView] = useState<'login' | 'activate'>(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname;
      const search = window.location.search;
      if (path === '/activate' || search.includes('token=')) {
        return 'activate';
      }
    }
    return 'login';
  });

  useEffect(() => {
    const handleUrlChange = () => {
      if (typeof window !== 'undefined') {
        const path = window.location.pathname;
        const search = window.location.search;
        if (path === '/activate' || search.includes('token=')) {
          setAuthView('activate');
        } else {
          setAuthView('login');
        }
      }
    };
    window.addEventListener('popstate', handleUrlChange);
    return () => window.removeEventListener('popstate', handleUrlChange);
  }, []);

  if (!isAuthenticated || !currentUser) {
    if (authView === 'activate') {
      return (
        <ActivateAccountPage
          onNavigateToLogin={() => {
            if (typeof window !== 'undefined' && window.history) {
              window.history.pushState({}, '', '/');
            }
            setAuthView('login');
          }}
        />
      );
    }
    return (
      <LoginPage
        onNavigateToActivate={() => {
          if (typeof window !== 'undefined' && window.history) {
            window.history.pushState({}, '', '/activate');
          }
          setAuthView('activate');
        }}
      />
    );
  }

  return <MainApp />;
};

export const App: React.FC = () => {
  return (
    <ToastProvider>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </ToastProvider>
  );
};

export default App;

