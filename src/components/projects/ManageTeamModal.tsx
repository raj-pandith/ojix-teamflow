import React, { useState, useEffect } from 'react';
import { Project } from '../../types/project';
import { UserProfile, UserRole } from '../../types/auth';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { storageEngine } from '../../services/storageEngine';
import { useToast } from '../../hooks/useToast';

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

  const handleRemoveMember = async (userId: string, userName: string) => {
    if (userId === project.ownerId) {
      showToast('error', 'Operation Denied', 'Project owner cannot be removed from their own team.');
      return;
    }
    if (!window.confirm(`Are you sure you want to remove "${userName}" from project team "${project.name}"? Historical tasks and contributions will be preserved.`)) {
      return;
    }
    setIsSubmitting(true);
    try {
      storageEngine.removeTeamMember(project.id, userId, currentUser);
      showToast('info', 'Member Removed', `"${userName}" was removed from the team. Historical task records remain intact.`);
    } catch (err: unknown) {
      showToast('error', 'Failed to Remove Member', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Project Team: ${project.name}`}
      maxWidth="700px"
    >
      <div className="manage-team-container">
        {/* Governance banner */}
        <div className="team-governance-notice">
          <span className="notice-icon">🛡️</span>
          <div className="notice-text">
            <strong>Project Lead Governance:</strong> You can compose and manage this project’s active team from registered workspace accounts. Creating/terminating workspace accounts is handled exclusively by the Workspace Admin.
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="team-tabs-row" style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '1px solid var(--color-border)', paddingBottom: '8px' }}>
          <button
            type="button"
            className={`btn btn-sm ${activeTab === 'current' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('current')}
            id="tab-current-team-members"
          >
            👥 Current Team ({currentMembers.length})
          </button>
          <button
            type="button"
            className={`btn btn-sm ${activeTab === 'add' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('add')}
            id="tab-add-team-members"
          >
            ➕ Add Eligible Workspace Users
          </button>
        </div>

        {activeTab === 'current' && (
          <div className="current-members-list">
            <table className="tasks-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Workspace Category</th>
                  <th>Account Status</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {currentMembers.map(member => {
                  const isOwner = member.uid === project.ownerId;
                  const isBlocked = member.status === 'blocked';
                  const isTerminated = member.status === 'terminated';
                  return (
                    <tr key={member.uid} className={isBlocked || isTerminated ? 'row-blocked' : ''}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className="member-avatar" style={{ width: '28px', height: '28px', fontSize: '12px' }}>
                            {member.displayName.charAt(0)}
                          </span>
                          <div>
                            <strong>{member.displayName}</strong>
                            {isOwner && (
                              <span style={{ marginLeft: '6px', fontSize: '10px', color: 'var(--accent-primary)', fontWeight: 600 }}>
                                (PROJECT OWNER)
                              </span>
                            )}
                            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{member.email}</div>
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
                        {!isOwner ? (
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={isSubmitting}
                            onClick={() => handleRemoveMember(member.uid, member.displayName)}
                            id={`remove-member-btn-${member.uid}`}
                            title="Remove from project team (preserves workspace account)"
                          >
                            Remove
                          </Button>
                        ) : (
                          <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
                            Lead Owner
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'add' && (
          <div className="add-members-section">
            <div className="team-filter-bar" style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
              <input
                type="text"
                className="search-input"
                placeholder="Search eligible users by name or email..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ flex: 1, minWidth: '220px' }}
                id="search-eligible-users-input"
              />
              <select
                className="filter-select"
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

            <div className="eligible-users-list" style={{ maxHeight: '320px', overflowY: 'auto' }}>
              {eligibleUsers.length > 0 ? (
                <table className="tasks-table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Category</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eligibleUsers.map(user => (
                      <tr key={user.uid}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span className="member-avatar" style={{ width: '28px', height: '28px', fontSize: '12px' }}>
                              {user.displayName.charAt(0)}
                            </span>
                            <div>
                              <strong>{user.displayName}</strong>
                              <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{user.email}</div>
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
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={isSubmitting}
                            onClick={() => handleAddMember(user.uid, user.displayName)}
                            id={`add-member-btn-${user.uid}`}
                          >
                            + Add to Team
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="empty-panel-state" style={{ padding: '24px', textAlign: 'center' }}>
                  <p>No eligible workspace users found matching the filter.</p>
                  <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                    All active workspace users are already assigned to this project team, or no accounts match the search.
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="modal-actions" style={{ marginTop: '20px' }}>
          <Button variant="secondary" onClick={onClose} id="close-manage-team-modal-btn">
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
};
