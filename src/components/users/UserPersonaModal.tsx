import React from 'react';
import { DemoPersona, UserProfile } from '../../types/auth';
import { Project } from '../../types/project';
import { Modal } from '../common/Modal';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { storageEngine } from '../../services/storageEngine';
import {
  FolderKanban,
  ShieldCheck,
  Shield,
  Phone,
  Mail,
  ArrowRight,
  RotateCcw,
  Inbox,
} from 'lucide-react';

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
        <div className="persona-modal-header">
          <div className="persona-modal-avatar">
            {user.displayName.charAt(0).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <h2
                style={{
                  fontSize: '18px',
                  fontWeight: 600,
                  letterSpacing: '-0.015em',
                  margin: 0,
                  color: 'var(--color-text-primary, #1E293B)',
                }}
              >
                {user.displayName}
              </h2>
              {isSelf && (
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: '6px',
                    background: 'var(--accent-primary-subtle, #FDF4EF)',
                    color: 'var(--accent-primary, #C9662F)',
                    border: '1px solid var(--accent-primary-border, #F3D3C1)',
                  }}
                >
                  Current User
                </span>
              )}
            </div>
            <div
              style={{
                fontSize: '13px',
                color: 'var(--color-text-secondary, #64748B)',
                marginTop: '4px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                flexWrap: 'wrap',
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <Mail size={13} style={{ color: 'var(--text-muted, #8E9EA5)' }} />
                <span>{user.email}</span>
              </span>
              {user.phone && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ opacity: 0.4 }}>•</span>
                  <Phone size={13} style={{ color: 'var(--text-muted, #8E9EA5)' }} />
                  <span>{user.phone}</span>
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
              <Badge type="role" value={user.role} />
              <Badge type="user-status" value={user.status || 'active'} />
            </div>
          </div>
        </div>

        {/* Operating Description */}
        <div className="persona-description-card">
          <div
            style={{
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              fontWeight: 700,
              color: 'var(--accent-primary, #C9662F)',
              marginBottom: '6px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Shield size={13} />
            <span>Role Overview &amp; Operating Responsibilities</span>
          </div>
          <p
            style={{
              fontSize: '13px',
              lineHeight: 1.55,
              margin: 0,
              color: 'var(--color-text-secondary, #475569)',
            }}
          >
            {persona.description || 'Executes assigned tasks and oversees project commitments.'}
          </p>
        </div>

        {/* Permitted Projects Section */}
        <div className="permitted-projects-section">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FolderKanban size={16} style={{ color: 'var(--accent-primary, #C9662F)' }} />
              <h3
                style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  margin: 0,
                  color: 'var(--color-text-primary, #1E293B)',
                }}
              >
                Permitted Projects
              </h3>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  background: 'var(--bg-canvas-subtle, #F3EAE3)',
                  color: 'var(--color-text-secondary, #64748B)',
                  border: '1px solid var(--border-subtle, #E8DED5)',
                  borderRadius: '12px',
                  padding: '1px 8px',
                }}
              >
                {isAdmin ? `All (${allProjects.length})` : allProjects.length}
              </span>
            </div>
            {isAdmin && (
              <span
                style={{
                  fontSize: '11px',
                  color: 'var(--accent-primary, #C9662F)',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <ShieldCheck size={13} />
                <span>Global Admin Access</span>
              </span>
            )}
          </div>

          <p
            style={{
              fontSize: '12px',
              color: 'var(--color-text-secondary, #64748B)',
              margin: '0 0 12px 0',
              lineHeight: 1.5,
            }}
          >
            {isAdmin
              ? 'As a Workspace Admin, this persona has global permission to view, manage, and contribute to all projects across the workspace.'
              : 'Projects this user has been permitted and invited to contribute in by a Project Lead or Workspace Admin.'}
          </p>

          <div className="permitted-projects-list">
            {allProjects.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '28px 16px',
                  background: 'var(--bg-surface-elevated, #FAF5F0)',
                  borderRadius: '10px',
                  border: '1px dashed var(--border-subtle, #E8DED5)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
                  <Inbox size={26} color="var(--accent-primary, #C9662F)" />
                </div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary, #1E293B)' }}>
                  No Permitted Projects Yet
                </div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary, #64748B)', marginTop: '4px' }}>
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
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span
                          style={{
                            fontSize: '13px',
                            fontWeight: 600,
                            color: 'var(--color-text-primary, #1E293B)',
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
                            background: isOwner ? 'var(--accent-primary-subtle, #FDF4EF)' : 'rgba(23, 110, 60, 0.08)',
                            color: isOwner ? 'var(--accent-primary, #C9662F)' : 'var(--status-done, #176E3C)',
                            border: `1px solid ${isOwner ? 'var(--accent-primary-border, #F3D3C1)' : 'rgba(23, 110, 60, 0.2)'}`,
                          }}
                        >
                          {roleBadgeText}
                        </span>
                        <span
                          style={{
                            fontSize: '10px',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            background: 'var(--bg-canvas-subtle, #F3EAE3)',
                            color: 'var(--color-text-secondary, #64748B)',
                            fontWeight: 600,
                          }}
                        >
                          {project.status.toUpperCase()}
                        </span>
                      </div>
                      {project.objective && (
                        <div
                          style={{
                            fontSize: '11px',
                            color: 'var(--color-text-secondary, #64748B)',
                            marginTop: '3px',
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
                        style={{ padding: '4px 10px', fontSize: '11px', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        onClick={() => handleOpenProject(project.id)}
                        id={`open-permitted-project-${project.id}`}
                      >
                        <span>Open</span>
                        <ArrowRight size={12} />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Modal Action Footer */}
        <div className="persona-modal-actions">
          <div>
            {!isSelf && onSwitchPersona && user.status !== 'blocked' && user.status !== 'terminated' && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleSwitchToThisPersona}
                id="switch-to-this-persona-btn"
              >
                <RotateCcw size={13} style={{ marginRight: '6px' }} />
                <span>Switch to this Persona</span>
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
