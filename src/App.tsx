import React, { useState } from 'react';
import { ToastProvider } from './hooks/useToast';
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
import { WorkTriageDrawer } from './features/triage/WorkTriageDrawer';
import { TaskCreateModal } from './components/tasks/TaskCreateModal';
import { ProjectCreateModal } from './components/projects/ProjectCreateModal';
import { UserInviteModal } from './components/users/UserInviteModal';
import { Task } from './types/task';
import './styles/global.css';

const MainApp: React.FC = () => {
  const { currentUser } = useAuth();
  const { projects, activeProject, activeProjectId, setActiveProjectId, createProject } = useProjects();
  const {
    tasks,
    filteredTasks,
    myTasks,
    filters,
    setFilters,
    createTask,
    transitionStatus,
    updateTask,
    deleteTask,
  } = useTasks(activeProjectId);

  const [currentTab, setCurrentTab] = useState<ActiveNavTab>('kanban');
  const [isTriageOpen, setIsTriageOpen] = useState(false);
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [isInviteUserOpen, setIsInviteUserOpen] = useState(false);

  const canMutate = currentUser?.role !== 'viewer';

  const handleSelectTaskFromDashboard = (_task: Task) => {
    setCurrentTab('kanban');
  };

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
        onOpenNewProject={() => setIsCreateProjectOpen(true)}
        currentUser={currentUser}
      />

      {/* Main Shell */}
      <div className="main-layout">
        <Topbar
          onOpenTriage={() => setIsTriageOpen(true)}
          onOpenNewTask={() => setIsCreateTaskOpen(true)}
          onOpenAddUser={() => setIsInviteUserOpen(true)}
          canMutate={canMutate}
        />

        <main className="content-viewport animate-fade-in">
          {currentTab === 'kanban' && (
            <div className="tab-view-kanban">
              <div className="view-header">
                <div>
                  <h1 className="view-title">{activeProject?.name || 'Project Execution Board'}</h1>
                  <p className="view-subtitle">{activeProject?.objective || 'Active Project Board'}</p>
                </div>
              </div>
              <KanbanBoard
                tasks={tasks}
                canMutate={canMutate}
                currentUser={currentUser}
                project={activeProject}
                onTransitionStatus={transitionStatus}
                onUpdateTask={updateTask}
                onDeleteTask={deleteTask}
              />
            </div>
          )}

          {currentTab === 'list' && (
            <div className="tab-view-list">
              <div className="view-header">
                <div>
                  <h1 className="view-title">Grouped Task Directory</h1>
                  <p className="view-subtitle">Faceted filter search, status groupings, and inline transitions.</p>
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
            />
          )}

          {currentTab === 'my-tasks' && currentUser && (
            <PersonalDashboard
              myTasks={myTasks}
              currentUser={currentUser}
              onSelectTask={handleSelectTaskFromDashboard}
              onGoToBoard={() => setCurrentTab('kanban')}
            />
          )}

          {currentTab === 'security' && (
            <SecurityAssurancePanel />
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
      />

      {/* Task Creation Modal */}
      {activeProject && currentUser && (
        <TaskCreateModal
          isOpen={isCreateTaskOpen}
          onClose={() => setIsCreateTaskOpen(false)}
          project={activeProject}
          currentUser={currentUser}
          onCreateTask={data => createTask(activeProject.id, data)}
        />
      )}

      {/* Project Creation Modal */}
      <ProjectCreateModal
        isOpen={isCreateProjectOpen}
        onClose={() => setIsCreateProjectOpen(false)}
        onCreateProject={createProject}
      />

      {/* User Invitation Modal (Workspace Admin only) */}
      {currentUser && (
        <UserInviteModal
          isOpen={isInviteUserOpen}
          onClose={() => setIsInviteUserOpen(false)}
          currentUser={currentUser}
          activeProjectId={activeProjectId}
          activeProjectName={activeProject?.name}
        />
      )}
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <ToastProvider>
      <AuthProvider>
        <MainApp />
      </AuthProvider>
    </ToastProvider>
  );
};

export default App;
