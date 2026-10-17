import React, { useState, useEffect } from 'react';
import { UserProfile, UserRole, UserStatus } from '../../types/auth';
import { ActivityLogEntry } from '../../types/audit';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import { Input } from '../common/Input';
import { Select } from '../common/Select';
import { storageEngine } from '../../services/storageEngine';
import { formatDisplayDate } from '../../domain/timezone';
import { useToast } from '../../hooks/useToast';

interface UserManagementViewProps {
  currentUser: UserProfile;
}

export const UserManagementView: React.FC<UserManagementViewProps> = ({ currentUser }) => {
  const [users, setUsers] = useState<UserProfile[]>(() => storageEngine.getUsers());
  const [logs, setLogs] = useState<ActivityLogEntry[]>(() => storageEngine.getUserManagementLogs());
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<UserStatus | 'all'>('all');

  // Modal states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [terminatingUser, setTerminatingUser] = useState<UserProfile | null>(null);
  const [pendingBlockUser, setPendingBlockUser] = useState<UserProfile | null>(null);

  // Form states
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formRole, setFormRole] = useState<UserRole>('member');
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { showToast } = useToast();

  const refreshData = () => {
    setUsers(storageEngine.getUsers());
    setLogs(storageEngine.getUserManagementLogs());
  };

  useEffect(() => {
    refreshData();
    const unsubscribe = storageEngine.subscribe(refreshData);
    return () => unsubscribe();
  }, []);

  // Filtered users
  const filteredUsers = users.filter(u => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = u.displayName.toLowerCase().includes(q);
      const matchEmail = u.email.toLowerCase().includes(q);
      const matchPhone = u.phone?.toLowerCase().includes(q) || false;
      if (!matchName && !matchEmail && !matchPhone) return false;
    }
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    if (statusFilter !== 'all' && u.status !== statusFilter) return false;
    return true;
  });

  const totalUsers = users.length;
  const activeCount = users.filter(u => (u.status || 'active') === 'active').length;
  const blockedCount = users.filter(u => u.status === 'blocked').length;
  const terminatedCount = users.filter(u => u.status === 'terminated').length;

  const handleOpenCreate = () => {
    setFormName('');
    setFormEmail('');
    setFormPhone('');
    setFormRole('member');
    setFormError('');
    setIsCreateModalOpen(true);
  };

  const handleOpenEdit = (user: UserProfile) => {
    setEditingUser(user);
    setFormName(user.displayName);
    setFormEmail(user.email);
    setFormPhone(user.phone || '');
    setFormRole(user.role);
    setFormError('');
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || formName.trim().length < 2) {
      setFormError('Full name must be at least 2 characters.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!formEmail.trim() || !emailRegex.test(formEmail.trim())) {
      setFormError('A valid email address is required.');
      return;
    }

    setIsSubmitting(true);
    setFormError('');
    try {
      const newUser: UserProfile = {
        uid: `user-${Date.now().toString(36)}`,
        displayName: formName.trim(),
        email: formEmail.trim().toLowerCase(),
        phone: formPhone.trim() || undefined,
        role: formRole,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      storageEngine.addUser(newUser, currentUser);
      showToast('success', 'User Created', `Workspace account for "${newUser.displayName}" created.`);
      setIsCreateModalOpen(false);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    if (!formName.trim() || formName.trim().length < 2) {
      setFormError('Full name must be at least 2 characters.');
      return;
    }

    setIsSubmitting(true);
    setFormError('');
    try {
      storageEngine.updateUser(
        editingUser.uid,
        {
          displayName: formName.trim(),
          email: formEmail.trim().toLowerCase(),
          phone: formPhone.trim() || undefined,
          role: formRole,
        },
        currentUser
      );
      showToast('success', 'User Updated', `Updated account details for "${formName.trim()}".`);
      setEditingUser(null);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to update user');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleBlock = (user: UserProfile) => {
    if (user.uid === currentUser.uid) {
      showToast('error', 'Safety Restriction', 'You cannot block your own administrative account.');
      return;
    }
    setPendingBlockUser(user);
  };

  const handleConfirmToggleBlock = () => {
    if (!pendingBlockUser) return;
    const isCurrentlyBlocked = pendingBlockUser.status === 'blocked';
    const newStatus: UserStatus = isCurrentlyBlocked ? 'active' : 'blocked';
    const actionLabel = isCurrentlyBlocked ? 'Unblock' : 'Block';

    if (pendingBlockUser.uid === currentUser.uid) {
      showToast('error', 'Safety Restriction', 'You cannot block your own administrative account.');
      setPendingBlockUser(null);
      return;
    }

    try {
      storageEngine.setUserStatus(pendingBlockUser.uid, newStatus, currentUser);
      showToast(
        newStatus === 'blocked' ? 'warning' : 'success',
        `User ${actionLabel}ed`,
        `"${pendingBlockUser.displayName}" is now ${newStatus.toUpperCase()}.`
      );
      setPendingBlockUser(null);
    } catch (err: unknown) {
      showToast('error', `Failed to ${actionLabel}`, err instanceof Error ? err.message : 'Error');
    }
  };

  const handleConfirmTerminate = () => {
    if (!terminatingUser) return;
    try {
      storageEngine.terminateUser(terminatingUser.uid, currentUser);
      showToast(
        'error',
        'Account Terminated',
        `"${terminatingUser.displayName}" has been permanently terminated. Workspace login access is revoked while task history is preserved.`
      );
      setTerminatingUser(null);
    } catch (err: unknown) {
      showToast('error', 'Termination Failed', err instanceof Error ? err.message : 'Error');
    }
  };

  return (
    <div className="user-management-view animate-fade-in" style={{ padding: 'var(--space-4)' }}>
      {/* View Header */}
      <div className="view-header" style={{ marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <h1 className="view-title">Member Directory</h1>
          <p className="view-subtitle">
            Manage member profiles, roles, and workspace access permissions.
          </p>
        </div>
        <Button variant="primary" onClick={handleOpenCreate} id="admin-create-user-btn">
          + Add Member
        </Button>
      </div>

      {/* Metrics Row */}
      <div className="metrics-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
        <div className="metric-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)' }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Total Registered</span>
          <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--color-text-primary)', marginTop: '4px' }}>{totalUsers}</div>
        </div>
        <div className="metric-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)' }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--status-done)', textTransform: 'uppercase', fontWeight: 600 }}>Active Accounts</span>
          <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--status-done)', marginTop: '4px' }}>{activeCount}</div>
        </div>
        <div className="metric-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)' }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--status-blocked)', textTransform: 'uppercase', fontWeight: 600 }}>Suspended / Blocked</span>
          <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--status-blocked)', marginTop: '4px' }}>{blockedCount}</div>
        </div>
        <div className="metric-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)' }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--status-overdue)', textTransform: 'uppercase', fontWeight: 600 }}>Terminated</span>
          <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--status-overdue)', marginTop: '4px' }}>{terminatedCount}</div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="filter-bar" style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="search-input-wrapper" style={{ flex: 1, minWidth: '240px' }}>
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="search-input"
            placeholder="Search users by name, email, or contact phone..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            id="user-search-input"
          />
          {searchQuery && (
            <button className="search-clear-btn" onClick={() => setSearchQuery('')}>✕</button>
          )}
        </div>

        <select
          className="filter-select"
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value as UserRole | 'all')}
          id="user-role-filter-select"
        >
          <option value="all">All Roles</option>
          <option value="project_lead">Project Lead</option>
          <option value="member">Member</option>
          <option value="viewer">Viewer</option>
          <option value="workspace_admin">Workspace Admin</option>
        </select>

        <select
          className="filter-select"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as UserStatus | 'all')}
          id="user-status-filter-select"
        >
          <option value="all">All Statuses</option>
          <option value="active">Active Only</option>
          <option value="blocked">Blocked Only</option>
          <option value="terminated">Terminated Only</option>
        </select>
      </div>

      {/* Users Table */}
      <div className="table-container" style={{ background: 'var(--bg-card)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table className="tasks-table" style={{ width: '100%', minWidth: '720px' }}>
          <thead>
            <tr>
              <th>User</th>
              <th>Email</th>
              <th>Contact Phone</th>
              <th>Category / Role</th>
              <th>Account Status</th>
              <th>Registered Date</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map(user => {
              const isSelf = user.uid === currentUser.uid;
              const isTerminated = user.status === 'terminated';
              const isBlocked = user.status === 'blocked';

              return (
                <tr key={user.uid} className={isBlocked || isTerminated ? 'row-blocked' : ''}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span className="member-avatar" style={{ width: '32px', height: '32px', fontSize: '13px' }}>
                        {user.displayName.charAt(0)}
                      </span>
                      <div>
                        <strong>{user.displayName}</strong>
                        {isSelf && (
                          <span style={{ marginLeft: '6px', fontSize: '10px', color: 'var(--accent-primary)', fontWeight: 600 }}>
                            (YOU)
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>{user.email}</td>
                  <td style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                    {user.phone ? `📞 ${user.phone}` : <span style={{ opacity: 0.5 }}>—</span>}
                  </td>
                  <td>
                    <Badge type="role" value={user.role} />
                  </td>
                  <td>
                    <Badge type="user-status" value={user.status || 'active'} />
                  </td>
                  <td style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                    {formatDisplayDate(user.createdAt ? user.createdAt.slice(0, 10) : '2026-10-01')}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                      {!isTerminated && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '3px 8px', fontSize: '12px' }}
                          onClick={() => handleOpenEdit(user)}
                          id={`edit-user-btn-${user.uid}`}
                          title="Edit user details"
                        >
                          ✏️ Edit
                        </button>
                      )}

                      {!isSelf && !isTerminated && (
                        <button
                          type="button"
                          className={`btn btn-sm ${isBlocked ? 'btn-secondary' : 'btn-secondary'}`}
                          style={{ padding: '3px 8px', fontSize: '12px', color: isBlocked ? 'var(--status-done)' : 'var(--status-blocked)' }}
                          onClick={() => handleToggleBlock(user)}
                          id={`toggle-block-user-btn-${user.uid}`}
                          title={isBlocked ? 'Unblock user account' : 'Block user account'}
                        >
                          {isBlocked ? '🔓 Unblock' : '🔒 Block'}
                        </button>
                      )}

                      {!isSelf && !isTerminated && (
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          style={{ padding: '3px 8px', fontSize: '12px' }}
                          onClick={() => setTerminatingUser(user)}
                          id={`terminate-user-btn-${user.uid}`}
                          title="Terminate account and revoke access"
                        >
                          🛑 Terminate
                        </button>
                      )}

                      {isTerminated && (
                        <span style={{ fontSize: '11px', color: 'var(--status-overdue)', fontWeight: 600 }}>
                          Access Revoked
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}

            {filteredUsers.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: 'var(--color-text-secondary)' }}>
                  No workspace users match your filter criteria.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Sensitive User-Management Audit Log Section */}
      <div style={{ marginTop: 'var(--space-5)' }}>
        <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, marginBottom: 'var(--space-2)' }}>
          📜 User Management Audit Trail ({logs.length} Events)
        </h3>
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-3)' }}>
          Immutable record of account creations, updates, suspensions, and terminations.
        </p>

        <div className="activity-timeline" style={{ background: 'var(--bg-card)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', maxHeight: '280px', overflowY: 'auto' }}>
          {logs.map(log => (
            <div key={log.id} className="timeline-item">
              <div className="timeline-marker" />
              <div className="timeline-content">
                <div className="timeline-header">
                  <span className="timeline-user">👤 {log.userDisplayName}</span>
                  <span className={`timeline-action-badge action-badge-${log.action}`}>
                    {log.action.replace('_', ' ').toUpperCase()}
                  </span>
                  <span className="timeline-time">
                    {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {formatDisplayDate(log.createdAt.slice(0, 10))}
                  </span>
                </div>
                {log.commentText && <div className="timeline-text">{log.commentText}</div>}
              </div>
            </div>
          ))}
          {logs.length === 0 && (
            <div style={{ textAlign: 'center', padding: '20px', color: 'var(--color-text-secondary)', fontSize: '13px' }}>
              No user management actions recorded yet.
            </div>
          )}
        </div>
      </div>

      {/* Create User Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create Workspace User Account"
        maxWidth="500px"
      >
        <form onSubmit={handleCreateSubmit}>
          {formError && <div className="form-alert-error" style={{ marginBottom: '12px' }}>{formError}</div>}

          <Input
            label="Full Name *"
            value={formName}
            onChange={e => setFormName(e.target.value)}
            placeholder="e.g. Jordan Miller"
            required
            autoFocus
            id="create-user-fullname-input"
          />

          <Input
            label="Email Address *"
            type="email"
            value={formEmail}
            onChange={e => setFormEmail(e.target.value)}
            placeholder="e.g. jordan@ojix.local"
            required
            id="create-user-email-input"
          />

          <Input
            label="Contact Phone"
            type="tel"
            value={formPhone}
            onChange={e => setFormPhone(e.target.value)}
            placeholder="e.g. +1 (555) 789-0123"
            id="create-user-phone-input"
          />

          <Select
            label="User Category / Role *"
            value={formRole}
            onChange={e => setFormRole(e.target.value as UserRole)}
            options={[
              { value: 'member', label: 'Member (Active Contributor)' },
              { value: 'project_lead', label: 'Project Lead (Creates & Manages Project Teams)' },
              { value: 'viewer', label: 'Viewer (Read-Only Observer)' },
              { value: 'workspace_admin', label: 'Workspace Admin (Full Governance)' },
            ]}
            id="create-user-role-select"
          />

          <div className="modal-actions" style={{ marginTop: '16px' }}>
            <Button variant="secondary" type="button" onClick={() => setIsCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" isLoading={isSubmitting} id="submit-create-user-btn">
              Create User Account
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit User Modal */}
      <Modal
        isOpen={!!editingUser}
        onClose={() => setEditingUser(null)}
        title={`Edit Workspace User: ${editingUser?.displayName}`}
        maxWidth="500px"
      >
        <form onSubmit={handleEditSubmit}>
          {formError && <div className="form-alert-error" style={{ marginBottom: '12px' }}>{formError}</div>}

          <Input
            label="Full Name *"
            value={formName}
            onChange={e => setFormName(e.target.value)}
            required
            id="edit-user-fullname-input"
          />

          <Input
            label="Email Address *"
            type="email"
            value={formEmail}
            onChange={e => setFormEmail(e.target.value)}
            required
            id="edit-user-email-input"
          />

          <Input
            label="Contact Phone"
            type="tel"
            value={formPhone}
            onChange={e => setFormPhone(e.target.value)}
            placeholder="e.g. +1 (555) 789-0123"
            id="edit-user-phone-input"
          />

          <Select
            label="Workspace Role / Category *"
            value={formRole}
            onChange={e => setFormRole(e.target.value as UserRole)}
            disabled={editingUser?.uid === currentUser.uid}
            options={[
              { value: 'member', label: 'Member (Active Contributor)' },
              { value: 'project_lead', label: 'Project Lead (Creates & Manages Project Teams)' },
              { value: 'viewer', label: 'Viewer (Read-Only Observer)' },
              { value: 'workspace_admin', label: 'Workspace Admin (Full Governance)' },
            ]}
            id="edit-user-role-select"
          />
          {editingUser?.uid === currentUser.uid && (
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '-8px', marginBottom: '12px' }}>
              You cannot demote your own active Workspace Admin role.
            </div>
          )}

          <div className="modal-actions" style={{ marginTop: '16px' }}>
            <Button variant="secondary" type="button" onClick={() => setEditingUser(null)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" isLoading={isSubmitting} id="submit-edit-user-btn">
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>

      {/* Block / Unblock User Confirmation Modal */}
      <Modal
        isOpen={!!pendingBlockUser}
        onClose={() => setPendingBlockUser(null)}
        title={pendingBlockUser?.status === 'blocked' ? '🔓 Restore Member Access' : '🔒 Suspend & Block Member'}
        maxWidth="520px"
      >
        <div style={{ lineHeight: 1.6 }}>
          {pendingBlockUser?.status === 'blocked' ? (
            <div>
              <p style={{ color: 'var(--status-done)', fontWeight: 600, marginBottom: '12px' }}>
                Restore workspace access for "{pendingBlockUser?.displayName}"?
              </p>
              <ul style={{ fontSize: '13px', color: 'var(--color-text-secondary)', paddingLeft: '20px', margin: '12px 0', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <li>Member can log in and access workspace projects again.</li>
                <li>They can receive new task assignments across their project teams.</li>
                <li>Their active role as <strong>{pendingBlockUser?.role.replace('_', ' ').toUpperCase()}</strong> will be restored.</li>
              </ul>

              <div className="modal-actions" style={{ marginTop: '20px' }}>
                <Button variant="secondary" onClick={() => setPendingBlockUser(null)}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={handleConfirmToggleBlock} id="confirm-unblock-user-btn">
                  🔓 Confirm & Unblock Member
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <p style={{ color: 'var(--status-blocked)', fontWeight: 600, marginBottom: '12px' }}>
                Are you sure you want to block "{pendingBlockUser?.displayName}"?
              </p>
              <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '16px' }}>
                <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '8px' }}>
                  What happens when this member is blocked:
                </strong>
                <ul style={{ paddingLeft: '20px', margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <li>
                    <strong>Immediate Access Revocation:</strong> The user is blocked from logging in and cannot switch into their persona.
                  </li>
                  <li>
                    <strong>Task Assignment Lockdown:</strong> Project leads and team members cannot assign new tasks to this member.
                  </li>
                  <li>
                    <strong>Mutation Prevention:</strong> The member cannot create, edit, or transition any project tasks.
                  </li>
                  <li>
                    <strong>Project Team Restriction:</strong> The member cannot be added to any project teams while blocked.
                  </li>
                  <li>
                    <strong>Audit & History Preserved:</strong> All past tasks, completed items, comments, and audit trail records remain 100% intact for compliance.
                  </li>
                </ul>
              </div>

              <div className="modal-actions" style={{ marginTop: '20px' }}>
                <Button variant="secondary" onClick={() => setPendingBlockUser(null)}>
                  Cancel
                </Button>
                <Button
                  variant="secondary"
                  style={{ color: 'var(--status-blocked)', borderColor: 'var(--status-blocked)', fontWeight: 600 }}
                  onClick={handleConfirmToggleBlock}
                  id="confirm-block-user-btn"
                >
                  🔒 Confirm & Block Member
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Terminate User Confirmation Modal */}
      <Modal
        isOpen={!!terminatingUser}
        onClose={() => setTerminatingUser(null)}
        title="Terminate Workspace Account"
        maxWidth="500px"
      >
        <div style={{ lineHeight: 1.6 }}>
          <p style={{ color: 'var(--status-overdue)', fontWeight: 600 }}>
            ⚠️ This will permanently terminate access for "{terminatingUser?.displayName}".
          </p>
          <ul style={{ fontSize: '13px', color: 'var(--color-text-secondary)', paddingLeft: '20px', margin: '12px 0' }}>
            <li>The user will be immediately blocked from logging in.</li>
            <li>New task assignments to this user will be prohibited.</li>
            <li>All past tasks, comments, and audit log history will be permanently preserved for compliance.</li>
          </ul>

          <div className="modal-actions" style={{ marginTop: '20px' }}>
            <Button variant="secondary" onClick={() => setTerminatingUser(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleConfirmTerminate} id="confirm-terminate-user-btn">
              🛑 Confirm Termination
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
