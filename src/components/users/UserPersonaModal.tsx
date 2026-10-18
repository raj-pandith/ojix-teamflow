import React from 'react';
import { DemoPersona, UserProfile } from '../../types/auth';
import { Project } from '../../types/project';
import { Modal } from '../common/Modal';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { storageEngine } from '../../services/storageEngine';

interface UserPersonaModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile | DemoPersona | null;
  onSelectProject?: (projectId: string) => void;
  onSwitchPersona?: (uid: string) => void;
  currentUserId?: string;
}

export const UserPersonaModal: React.FC<UserPersonaModalProps> = ({
  isOpen,
  onClose,
  user,
  onSelectProject,
  onSwitchPersona,
  currentUserId,
}) => {
  if (!isOpen || !user) return null;

  // Retrieve persona information and permitted projects
  const persona = storageEngine.getPersona(user.uid) || (user as DemoPersona);
  const allProjects = storageEngine.getProjects({
    uid: user.uid,
    role: user.role,
    displayName: user.displayName,
    email: user.email,
    status: user.status || 'active',
    createdAt: '',
    updatedAt: '',
  });

  const isSelf = currentUserId === user.uid;
  const isAdmin = user.role === 'workspace_admin';

  const handleOpenProject = (projectId: string) => {
    onSelectProject?.(projectId);
    onClose();
  };

  const handleSwitchToThisPersona = () => {
    if (onSwitchPersona && user.uid) {
      onSwitchPersona(user.uid);
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="User Persona & Access Profile"
      maxWidth="620px"
    >
      <div className="persona-profile-modal-content">
        {/* Profile Card Header */}
        <div
          className="persona-modal-header"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            padding: '16px',
            background: 'var(--bg-surface-elevated, #1c2128)',
            border: '1px solid var(--border-default, #30363d)',
            borderRadius: 'var(--radius-md, 8px)',
            marginBottom: '18px',
          }}
        >
          <div
            className="persona-modal-avatar"
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--accent-primary, #6366f1), #8b5cf6)',
              color: '#fff',
              fontSize: '22px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.25)',
            }}
          >
            {user.displayName.charAt(0).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <h2
                style={{
                  fontSize: '18px',
                  fontWeight: 700,
                  margin: 0,
                  color: 'var(--color-text-primary, #f0f6fc)',
                }}
              >
                {user.displayName}
              </h2>
              {isSelf && (
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    padding: '1px 6px',
                    borderRadius: '4px',
                    background: 'var(--accent-primary-subtle, rgba(99,102,241,0.15))',
                    color: 'var(--accent-primary-light, #818cf8)',
                  }}
                >
                  Current User
                </span>
              )}
            </div>
            <div
              style={{
                fontSize: '13px',
                color: 'var(--color-text-secondary, #8b949e)',
                marginTop: '2px',
              }}
            >
              {user.email} {user.phone && `• 📞 ${user.phone}`}
            </div>
            <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
              <Badge type="role" value={user.role} />
              <Badge type="user-status" value={user.status || 'active'} />
            </div>
          </div>
        </div>

        {/* Operating Description */}
        <div
          className="persona-description-card"
          style={{
            padding: '12px 14px',
            background: 'var(--surface-sunken, #0d1117)',
            border: '1px solid var(--border-subtle, #21262d)',
            borderRadius: '6px',
            marginBottom: '18px',
          }}
        >
          <div
            style={{
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              fontWeight: 700,
              color: 'var(--color-text-secondary, #8b949e)',
              marginBottom: '4px',
            }}
          >
            Role Overview & Operating Responsibilities
          </div>
          <p
            style={{
              fontSize: '13px',
              lineHeight: 1.5,
              margin: 0,
              color: 'var(--color-text-primary, #c9d1d9)',
            }}
          >
            {persona.description || 'Executes assigned tasks and oversees project commitments.'}
          </p>
        </div>

        {/* Permitted Projects Section */}
        <div className="permitted-projects-section" style={{ marginBottom: '16px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '15px' }}>📁</span>
              <h3
                style={{
                  fontSize: '14px',
                  fontWeight: 700,
                  margin: 0,
                  color: 'var(--color-text-primary, #f0f6fc)',
                }}
              >
                Permitted Projects
              </h3>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  background: 'var(--surface-elevated, #21262d)',
                  color: 'var(--color-text-primary, #f0f6fc)',
                  border: '1px solid var(--border-default, #30363d)',
                  borderRadius: '10px',
                  padding: '1px 7px',
                }}
              >
                {isAdmin ? `All (${allProjects.length})` : allProjects.length}
              </span>
            </div>
            {isAdmin && (
              <span
                style={{
                  fontSize: '11px',
                  color: 'var(--accent-primary-light, #818cf8)',
                  fontWeight: 600,
                }}
              >
                ⚡ Global Admin Access
              </span>
            )}
          </div>

          <p
            style={{
              fontSize: '12px',
              color: 'var(--color-text-secondary, #8b949e)',
              margin: '0 0 10px 0',
            }}
          >
            {isAdmin
              ? 'As a Workspace Admin, this persona has global permission to view, manage, and contribute to all projects across the workspace.'
              : 'Projects this user has been permitted and invited to contribute in by a Project Lead or Workspace Admin.'}
          </p>

          <div
            className="permitted-projects-list"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              maxHeight: '220px',
              overflowY: 'auto',
              paddingRight: '4px',
            }}
          >
            {allProjects.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '24px 16px',
                  background: 'var(--surface-sunken, #0d1117)',
                  borderRadius: '6px',
                  border: '1px dashed var(--border-default, #30363d)',
                }}
              >
                <div style={{ fontSize: '24px', marginBottom: '6px' }}>📭</div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary, #f0f6fc)' }}>
                  No Permitted Projects Yet
                </div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary, #8b949e)', marginTop: '4px' }}>
                  This user has not yet been invited to contribute to any project. Project Leads or Admins can add them via Team Allocation.
                </div>
              </div>
            ) : (
              allProjects.map((project: Project) => {
                const isOwner = project.ownerId === user.uid;
                const roleBadgeText = isOwner
                  ? 'Project Owner'
                  : user.role === 'workspace_admin'
                  ? 'Global Admin'
                  : user.role === 'project_lead'
                  ? 'Co-Lead'
                  : user.role === 'viewer'
                  ? 'Viewer'
                  : 'Invited Contributor';

                return (
                  <div
                    key={project.id}
                    className="permitted-project-card"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      background: 'var(--surface-elevated, #21262d)',
                      border: '1px solid var(--border-default, #30363d)',
                      borderRadius: '6px',
                      gap: '10px',
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span
                          style={{
                            fontSize: '13px',
                            fontWeight: 600,
                            color: 'var(--color-text-primary, #f0f6fc)',
                          }}
                        >
                          {project.name}
                        </span>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 600,
                            padding: '1px 6px',
                            borderRadius: '4px',
                            background: isOwner ? 'rgba(99,102,241,0.2)' : 'rgba(46,160,67,0.2)',
                            color: isOwner ? 'var(--accent-primary-light, #818cf8)' : 'var(--status-done, #3fb950)',
                            border: `1px solid ${isOwner ? 'rgba(99,102,241,0.4)' : 'rgba(46,160,67,0.4)'}`,
                          }}
                        >
                          {roleBadgeText}
                        </span>
                        <span
                          style={{
                            fontSize: '10px',
                            padding: '1px 5px',
                            borderRadius: '4px',
                            background: 'var(--surface-sunken, #0d1117)',
                            color: 'var(--color-text-secondary, #8b949e)',
                          }}
                        >
                          {project.status.toUpperCase()}
                        </span>
                      </div>
                      {project.objective && (
                        <div
                          style={{
                            fontSize: '11px',
                            color: 'var(--color-text-secondary, #8b949e)',
                            marginTop: '2px',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {project.objective}
                        </div>
                      )}
                    </div>
                    {onSelectProject && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '3px 8px', fontSize: '11px', whiteSpace: 'nowrap' }}
                        onClick={() => handleOpenProject(project.id)}
                        id={`open-permitted-project-${project.id}`}
                      >
                        Open ➔
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Modal Action Footer */}
        <div
          className="persona-modal-actions"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            paddingTop: '12px',
            borderTop: '1px solid var(--border-default, #30363d)',
          }}
        >
          <div>
            {!isSelf && onSwitchPersona && user.status !== 'blocked' && user.status !== 'terminated' && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleSwitchToThisPersona}
                id="switch-to-this-persona-btn"
              >
                🔄 Switch to this Persona
              </Button>
            )}
          </div>
          <Button variant="secondary" size="sm" onClick={onClose} id="close-persona-modal-btn">
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
};
