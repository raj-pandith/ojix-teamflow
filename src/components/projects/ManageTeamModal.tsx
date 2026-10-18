import React, { useState, useEffect } from 'react';
import { Project, RemoveMemberResult } from '../../types/project';
import { UserProfile, UserRole } from '../../types/auth';
import { Modal } from '../common/Modal';
import { Badge } from '../common/Badge';
import { storageEngine } from '../../services/storageEngine';
import { useToast } from '../../hooks/useToast';
import { RemoveMemberConfirmModal } from './RemoveMemberConfirmModal';

interface ManageTeamModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project | null;
  currentUser: UserProfile | null;
}

export const ManageTeamModal: React.FC<ManageTeamModalProps> = ({
  isOpen,
  onClose,
  project,
  currentUser,
}) => {
  const [users, setUsers] = useState<UserProfile[]>(() => storageEngine.getUsers());
  const [activeTab, setActiveTab] = useState<'current' | 'add'>('current');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<UserRole | 'all'>('all');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<UserProfile | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    setUsers(storageEngine.getUsers());
    const unsubscribe = storageEngine.subscribe(() => {
      setUsers(storageEngine.getUsers());
    });
    return () => unsubscribe();
  }, [isOpen]);

  if (!isOpen || !project || !currentUser) return null;

  const currentMembers = project.memberIds
    .map(uid => users.find(u => u.uid === uid))
    .filter((u): u is UserProfile => u !== undefined);

  // Eligible users: active, not already members, and not workspace_admin if restricted
  const eligibleUsers = users.filter(u => {
    const isAlreadyMember = project.memberIds.includes(u.uid);
    const isSuspended = u.status === 'blocked' || u.status === 'terminated';
    if (isAlreadyMember || isSuspended) return false;

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = u.displayName.toLowerCase().includes(q);
      const matchEmail = u.email.toLowerCase().includes(q);
      if (!matchName && !matchEmail) return false;
    }

    // Category filter
    if (categoryFilter !== 'all' && u.role !== categoryFilter) {
      return false;
    }

    return true;
  });

  const handleAddMember = async (userId: string, userName: string) => {
    setIsSubmitting(true);
    try {
      storageEngine.addTeamMember(project.id, userId, currentUser);
      showToast('success', 'Member Added', `"${userName}" has been added to project team "${project.name}".`);
    } catch (err: unknown) {
      showToast('error', 'Failed to Add Member', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInitiateRemove = (member: UserProfile) => {
    if (member.uid === project.ownerId) {
      showToast('error', 'Operation Denied', 'Project owner cannot be removed from their own team.');
      return;
    }
    if (currentUser.role === 'project_lead' && member.role === 'workspace_admin') {
      showToast('error', 'Operation Denied', 'Project Leads cannot remove Workspace Admins from the project team.');
      return;
    }
    if (currentUser.role === 'workspace_admin' && member.uid === currentUser.uid) {
      showToast('error', 'Safety Restriction', 'Workspace Admins cannot remove themselves from the project team.');
      return;
    }
    setMemberToRemove(member);
  };

  const handleRemovalSuccess = (result: RemoveMemberResult) => {
    const { removedUser, reassignedTasks, unassignedTasks, preservedCompletedTasks } = result;
    showToast(
      'info',
      'Member Removed from Team',
      `"${removedUser.displayName}" was removed from the team. Reassigned ${reassignedTasks.length} task(s), ${unassignedTasks.length} left unassigned. ${preservedCompletedTasks.length} completed task(s) preserved.`
    );
    setMemberToRemove(null);
  };

  const getMemberAvatarStyle = (name: string) => {
    const palettes = [
      { bg: '#EEF4FB', color: '#1F4E79', border: '#C6D8E9' },
      { bg: '#FDF2EC', color: '#CC642D', border: '#F3D2C1' },
      { bg: '#EEF7F2', color: '#176E3C', border: '#C2E5D3' },
      { bg: '#F8F1FA', color: '#6B377D', border: '#DECAE6' },
      { bg: '#FDF5E8', color: '#A65700', border: '#F5D9A8' },
      { bg: '#F1F5F9', color: '#334155', border: '#CBD5E1' },
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % palettes.length;
    return palettes[index];
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Project Team: ${project.name}`}
      maxWidth="720px"
    >
      <div className="manage-team-container">
        {/* Governance banner */}
        <div className="team-governance-card">
          <div className="governance-icon-badge" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <div className="governance-content">
            <div className="governance-header-line">
              <span className="governance-badge">Governance Policy</span>
              <span className="governance-role-label">Project Lead Management</span>
            </div>
            <p className="governance-description">
              You can compose and manage this project’s active team from registered workspace accounts. Creating and terminating workspace accounts is handled exclusively by the Workspace Admin.
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="team-segmented-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'current'}
            className={`team-tab-btn ${activeTab === 'current' ? 'active' : ''}`}
            onClick={() => setActiveTab('current')}
            id="tab-current-team-members"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <span>Current Team</span>
            <span className="team-tab-count">{currentMembers.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'add'}
            className={`team-tab-btn ${activeTab === 'add' ? 'active' : ''}`}
            onClick={() => setActiveTab('add')}
            id="tab-add-team-members"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <line x1="20" y1="8" x2="20" y2="14" />
              <line x1="23" y1="11" x2="17" y2="11" />
            </svg>
            <span>Add Eligible Users</span>
            {eligibleUsers.length > 0 && (
              <span className="team-tab-count tab-count-available">{eligibleUsers.length}</span>
            )}
          </button>
        </div>

        {activeTab === 'current' && (
          <div className="current-members-list">
            <div className="team-table-card">
              <table className="team-management-table">
                <thead>
                  <tr>
                    <th style={{ width: '42%' }}>Member</th>
                    <th style={{ width: '24%' }}>Workspace Category</th>
                    <th style={{ width: '20%' }}>Account Status</th>
                    <th style={{ width: '14%', textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {currentMembers.map(member => {
                    const isOwner = member.uid === project.ownerId;
                    const isProtectedAdmin = currentUser.role === 'project_lead' && member.role === 'workspace_admin';
                    const isSelfAdmin = currentUser.role === 'workspace_admin' && member.uid === currentUser.uid;
                    const isBlocked = member.status === 'blocked';
                    const isTerminated = member.status === 'terminated';
                    const palette = getMemberAvatarStyle(member.displayName);

                    return (
                      <tr key={member.uid} className={isBlocked || isTerminated ? 'row-blocked' : ''}>
                        <td>
                          <div className="team-member-cell">
                            <span
                              className="team-avatar-pill"
                              style={{
                                background: palette.bg,
                                color: palette.color,
                                borderColor: palette.border,
                              }}
                            >
                              {member.displayName.charAt(0).toUpperCase()}
                            </span>
                            <div className="team-member-meta">
                              <div className="team-member-headline">
                                <span className="team-member-name">{member.displayName}</span>
                                {isOwner && (
                                  <span className="team-owner-tag">
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                                    </svg>
                                    OWNER
                                  </span>
                                )}
                              </div>
                              <span className="team-member-email">{member.email}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <Badge type="role" value={member.role} />
                        </td>
                        <td>
                          <Badge type="user-status" value={member.status || 'active'} />
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {isOwner ? (
                            <span className="team-owner-indicator">Lead Owner</span>
                          ) : isProtectedAdmin ? (
                            <span className="team-protected-indicator" title="Project Leads cannot remove Workspace Admins from the project team">
                              Protected
                            </span>
                          ) : isSelfAdmin ? (
                            <span className="team-protected-indicator" title="Workspace Admins cannot remove themselves from the project team">
                              You
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="team-btn-remove"
                              disabled={isSubmitting}
                              onClick={() => handleInitiateRemove(member)}
                              id={`remove-member-btn-${member.uid}`}
                              title="Remove from project team (preserves workspace account)"
                            >
                              Remove
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'add' && (
          <div className="add-members-section">
            <div className="team-search-filter-bar">
              <div className="team-search-input-box">
                <svg className="search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  className="team-filter-input"
                  placeholder="Search eligible users by name or email..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  id="search-eligible-users-input"
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="team-search-clear"
                    onClick={() => setSearchQuery('')}
                    aria-label="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>
              <select
                className="team-role-filter-select"
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value as UserRole | 'all')}
                id="filter-eligible-category-select"
              >
                <option value="all">All Categories</option>
                <option value="member">Members</option>
                <option value="viewer">Viewers</option>
                <option value="project_lead">Project Leads</option>
              </select>
            </div>

            <div className="eligible-users-list">
              {eligibleUsers.length > 0 ? (
                <div className="team-table-card" style={{ maxHeight: '340px', overflowY: 'auto' }}>
                  <table className="team-management-table">
                    <thead>
                      <tr>
                        <th style={{ width: '42%' }}>User</th>
                        <th style={{ width: '24%' }}>Category</th>
                        <th style={{ width: '20%' }}>Status</th>
                        <th style={{ width: '14%', textAlign: 'right' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {eligibleUsers.map(user => {
                        const palette = getMemberAvatarStyle(user.displayName);
                        return (
                          <tr key={user.uid}>
                            <td>
                              <div className="team-member-cell">
                                <span
                                  className="team-avatar-pill"
                                  style={{
                                    background: palette.bg,
                                    color: palette.color,
                                    borderColor: palette.border,
                                  }}
                                >
                                  {user.displayName.charAt(0).toUpperCase()}
                                </span>
                                <div className="team-member-meta">
                                  <span className="team-member-name">{user.displayName}</span>
                                  <span className="team-member-email">{user.email}</span>
                                </div>
                              </div>
                            </td>
                            <td>
                              <Badge type="role" value={user.role} />
                            </td>
                            <td>
                              <Badge type="user-status" value={user.status || 'active'} />
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <button
                                type="button"
                                className="team-btn-add"
                                disabled={isSubmitting}
                                onClick={() => handleAddMember(user.uid, user.displayName)}
                                id={`add-member-btn-${user.uid}`}
                              >
                                + Add
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-panel-state" style={{ padding: '32px 20px', textAlign: 'center', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px' }}>
                  <div style={{ fontSize: '24px', marginBottom: '8px' }}>👥</div>
                  <h4 style={{ margin: '0 0 6px 0', fontSize: '14px', color: 'var(--text-primary)' }}>No eligible workspace users found</h4>
                  <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                    All active workspace accounts are already on this team, or no accounts match your search filter.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="team-modal-footer">
          <span className="team-footer-summary">
            {currentMembers.length} member{currentMembers.length === 1 ? '' : 's'} assigned to this project
          </span>
          <button
            type="button"
            className="btn-team-done"
            onClick={onClose}
            id="close-manage-team-modal-btn"
          >
            Done
          </button>
        </div>
      </div>

      {memberToRemove && (
        <RemoveMemberConfirmModal
          isOpen={!!memberToRemove}
          onClose={() => setMemberToRemove(null)}
          project={project}
          member={memberToRemove}
          currentUser={currentUser}
          onSuccess={handleRemovalSuccess}
        />
      )}
    </Modal>
  );
};
