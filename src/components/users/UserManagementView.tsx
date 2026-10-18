import React, { useState, useEffect, useMemo } from 'react';
import {
  UserPlus,
  Search,
  X,
  Phone,
  User,
  Mail,
  Pencil,
  Lock,
  Unlock,
  UserX,
  ShieldCheck,
  MoreVertical,
} from 'lucide-react';
import { UserProfile, UserRole, UserStatus } from '../../types/auth';
import { ActivityLogEntry } from '../../types/audit';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import { Input } from '../common/Input';
import { Select } from '../common/Select';
import { Pagination } from '../common/Pagination';
import { storageEngine } from '../../services/storageEngine';
import { formatDisplayDate } from '../../domain/timezone';
import { useToast } from '../../hooks/useToast';
import { UserPersonaModal } from './UserPersonaModal';
import { UserInviteModal } from './UserInviteModal';
import { authService } from '../../services/authService';

interface UserManagementViewProps {
  currentUser: UserProfile;
}

export const UserManagementView: React.FC<UserManagementViewProps> = ({ currentUser }) => {
  const [users, setUsers] = useState<UserProfile[]>(() => storageEngine.getUsers());
  const [logs, setLogs] = useState<ActivityLogEntry[]>(() => storageEngine.getUserManagementLogs());
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<UserStatus | 'all'>('all');

  // Pagination states
  const [membersPage, setMembersPage] = useState(1);
  const [membersPageSize, setMembersPageSize] = useState(10);
  const [logsPage, setLogsPage] = useState(1);
  const [logsPageSize, setLogsPageSize] = useState(10);

  // Context Menu state
  const [contextMenu, setContextMenu] = useState<{
    user: UserProfile;
    x: number;
    y: number;
  } | null>(null);

  // Modal states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [terminatingUser, setTerminatingUser] = useState<UserProfile | null>(null);
  const [pendingBlockUser, setPendingBlockUser] = useState<UserProfile | null>(null);
  const [inspectingPersonaUser, setInspectingPersonaUser] = useState<UserProfile | null>(null);
  const [resendResult, setResendResult] = useState<{ activationUrl: string; email: string } | null>(null);

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
    if (currentUser.role === 'workspace_admin') {
      authService.getAdminUsers().then(synced => {
        if (synced && synced.length > 0) {
          setUsers(synced);
        }
      }).catch(() => {});
    }
    const unsubscribe = storageEngine.subscribe(refreshData);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenu(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      unsubscribe();
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [currentUser]);

  // Filtered users
  const filteredUsers = useMemo(() => {
    return users.filter(u => {
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
  }, [users, searchQuery, roleFilter, statusFilter]);

  // Reset page when search or filters change
  useEffect(() => {
    setMembersPage(1);
  }, [searchQuery, roleFilter, statusFilter]);

  // Paginated users slice
  const paginatedUsers = useMemo(() => {
    const startIndex = (membersPage - 1) * membersPageSize;
    return filteredUsers.slice(startIndex, startIndex + membersPageSize);
  }, [filteredUsers, membersPage, membersPageSize]);

  // Paginated audit logs slice
  const paginatedLogs = useMemo(() => {
    const startIndex = (logsPage - 1) * logsPageSize;
    return logs.slice(startIndex, startIndex + logsPageSize);
  }, [logs, logsPage, logsPageSize]);

  const totalUsers = users.length;
  const activeCount = users.filter(u => (u.status || 'active') === 'active').length;
  const pendingCount = users.filter(u => u.status === 'pending_activation').length;
  const blockedCount = users.filter(u => u.status === 'blocked').length;
  const terminatedCount = users.filter(u => u.status === 'terminated').length;

  const handleResendInvite = async (user: UserProfile) => {
    try {
      const res = await authService.resendInvitation(user.email);
      setResendResult({ activationUrl: res.activationUrl, email: user.email });
      showToast('success', 'Invitation Link Regenerated', `New activation link created for ${user.email}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to resend invitation';
      showToast('error', 'Resend Error', msg);
    }
  };

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
      <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, letterSpacing: '-0.025em', color: 'var(--color-text-primary, #1E293B)', margin: '0 0 4px 0' }}>
            Member Directory
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--color-text-secondary, #64748B)', margin: 0 }}>
            Manage member profiles, roles, and workspace access permissions.
          </p>
        </div>
        <Button variant="primary" onClick={handleOpenCreate} id="admin-create-user-btn">
          <UserPlus size={15} style={{ marginRight: 6 }} /> Add Member
        </Button>
      </div>

      {/* Metrics Row */}
      <div className="members-metrics-grid">
        <div className="member-metric-card">
          <div className="member-metric-label">
            <User size={13} style={{ color: 'var(--accent-primary, #C9662F)' }} />
            <span>Total Members</span>
          </div>
          <div className="member-metric-value">{totalUsers}</div>
        </div>
        <div className="member-metric-card">
          <div className="member-metric-label">
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--status-done, #176E3C)' }} />
            <span style={{ color: 'var(--status-done, #176E3C)' }}>Active</span>
          </div>
          <div className="member-metric-value" style={{ color: 'var(--status-done, #176E3C)' }}>{activeCount}</div>
        </div>
        <div className="member-metric-card">
          <div className="member-metric-label">
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#0284C7' }} />
            <span style={{ color: '#0284C7' }}>Pending Activation</span>
          </div>
          <div className="member-metric-value" style={{ color: '#0284C7' }}>{pendingCount}</div>
        </div>
        <div className="member-metric-card">
          <div className="member-metric-label">
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--status-blocked, #D97706)' }} />
            <span style={{ color: 'var(--status-blocked, #D97706)' }}>Suspended / Blocked</span>
          </div>
          <div className="member-metric-value" style={{ color: 'var(--status-blocked, #D97706)' }}>{blockedCount}</div>
        </div>
        <div className="member-metric-card">
          <div className="member-metric-label">
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--status-overdue, #E11D48)' }} />
            <span style={{ color: 'var(--status-overdue, #E11D48)' }}>Terminated</span>
          </div>
          <div className="member-metric-value" style={{ color: 'var(--status-overdue, #E11D48)' }}>{terminatedCount}</div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="filter-bar" style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="search-input-wrapper" style={{ flex: 1, minWidth: '240px' }}>
          <span className="search-icon"><Search size={14} /></span>
          <input
            type="text"
            className="search-input"
            placeholder="Search users by name, email, or contact phone..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            id="user-search-input"
          />
          {searchQuery && (
            <button className="search-clear-btn" onClick={() => setSearchQuery('')} aria-label="Clear search">
              <X size={14} />
            </button>
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
          <option value="pending_activation">Pending Activation Only</option>
          <option value="blocked">Blocked Only</option>
          <option value="terminated">Terminated Only</option>
        </select>
      </div>

      {/* Users Table */}
      <div className="members-table-wrapper">
        <table className="members-table">
          <thead>
            <tr>
              <th style={{ width: '24%' }}>Member</th>
              <th style={{ width: '25%' }}>Email</th>
              <th style={{ width: '17%' }}>Phone</th>
              <th style={{ width: '13%' }}>Role</th>
              <th style={{ width: '11%' }}>Status</th>
              <th style={{ width: '10%' }}>Joined</th>
              <th style={{ textAlign: 'right', width: '28px' }}></th>
            </tr>
          </thead>
          <tbody>
            {paginatedUsers.map(user => {
              const isSelf = user.uid === currentUser.uid;
              const isTerminated = user.status === 'terminated';
              const isBlocked = user.status === 'blocked';
              const isContextActive = contextMenu?.user.uid === user.uid;
              const avatarClass = user.role === 'workspace_admin'
                ? 'member-avatar member-avatar-admin'
                : user.role === 'project_lead'
                ? 'member-avatar member-avatar-lead'
                : user.role === 'viewer'
                ? 'member-avatar member-avatar-viewer'
                : 'member-avatar member-avatar-member';

              return (
                <tr
                  key={user.uid}
                  className={`member-row-interactive ${isBlocked || isTerminated ? 'row-blocked' : ''} ${isContextActive ? 'context-active' : ''}`}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    const x = Math.min(e.clientX, window.innerWidth - 210);
                    const y = Math.min(e.clientY, window.innerHeight - 230);
                    setContextMenu({ user, x, y });
                  }}
                  title="Right-click for member actions"
                >
                  <td>
                    <div className="member-identity-cell">
                      <div className={avatarClass}>
                        {user.displayName.charAt(0).toUpperCase()}
                      </div>
                      <div className="member-info">
                        <div className="member-name-row">
                          <span className="member-name">{user.displayName}</span>
                          {isSelf && <span className="member-you-pill">You</span>}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="member-email-text" title={user.email}>
                      {user.email}
                    </span>
                  </td>
                  <td>
                    {user.phone ? (
                      <span className="member-phone-text">
                        <Phone size={12} style={{ color: 'var(--color-text-muted, #94A3B8)' }} />
                        <span>{user.phone}</span>
                      </span>
                    ) : (
                      <span style={{ color: 'var(--color-text-muted, #94A3B8)', opacity: 0.5 }}>—</span>
                    )}
                  </td>
                  <td>
                    <Badge type="role" value={user.role} />
                  </td>
                  <td>
                    <Badge type="user-status" value={user.status || 'active'} />
                  </td>
                  <td style={{ fontSize: '12px', color: 'var(--color-text-secondary, #64748B)', whiteSpace: 'nowrap' }}>
                    {formatDisplayDate(user.createdAt ? user.createdAt.slice(0, 10) : '2026-10-01')}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      className="member-menu-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = Math.min(rect.right - 190, window.innerWidth - 210);
                        const y = Math.min(rect.bottom + 4, window.innerHeight - 230);
                        setContextMenu({ user, x, y });
                      }}
                      title="Actions (or right-click row)"
                      aria-label={`Actions for ${user.displayName}`}
                    >
                      <MoreVertical size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}

            {filteredUsers.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: 'var(--color-text-secondary, #64748B)' }}>
                  No workspace members match your search or filter criteria.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Member Directory Pagination */}
        {filteredUsers.length > 0 && (
          <Pagination
            currentPage={membersPage}
            totalItems={filteredUsers.length}
            pageSize={membersPageSize}
            onPageChange={setMembersPage}
            pageSizeOptions={[10, 20, 50]}
            onPageSizeChange={size => {
              setMembersPageSize(size);
              setMembersPage(1);
            }}
            itemLabel="members"
          />
        )}
      </div>

      {/* Right-Click & Action Context Menu Floating Popover */}
      {contextMenu && (
        <>
          <div
            className="context-menu-backdrop"
            onClick={() => setContextMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu(null);
            }}
          />
          <div
            className="member-context-menu"
            style={{
              top: `${contextMenu.y}px`,
              left: `${contextMenu.x}px`,
            }}
            onClick={(e) => e.stopPropagation()}
            role="menu"
          >
            <div className="context-menu-header">
              <span className="context-menu-user-name">{contextMenu.user.displayName}</span>
            </div>

            <button
              type="button"
              className="context-menu-item"
              id={`view-persona-btn-${contextMenu.user.uid}`}
              onClick={() => {
                setInspectingPersonaUser(contextMenu.user);
                setContextMenu(null);
              }}
            >
              <User size={13} style={{ color: 'var(--accent-primary, #C9662F)' }} />
              <span>Persona &amp; Access</span>
            </button>

            {contextMenu.user.status !== 'terminated' && (
              <button
                type="button"
                className="context-menu-item"
                id={`edit-user-btn-${contextMenu.user.uid}`}
                onClick={() => {
                  handleOpenEdit(contextMenu.user);
                  setContextMenu(null);
                }}
              >
                <Pencil size={13} />
                <span>Edit Member</span>
              </button>
            )}

            {contextMenu.user.status === 'pending_activation' && (
              <button
                type="button"
                className="context-menu-item context-menu-highlight"
                id={`resend-invite-btn-${contextMenu.user.uid}`}
                onClick={() => {
                  handleResendInvite(contextMenu.user);
                  setContextMenu(null);
                }}
              >
                <Mail size={13} />
                <span>Resend Invitation</span>
              </button>
            )}

            {contextMenu.user.uid !== currentUser.uid && contextMenu.user.status !== 'terminated' && (
              <>
                <div className="context-menu-divider" />
                <button
                  type="button"
                  className="context-menu-item"
                  id={`toggle-block-user-btn-${contextMenu.user.uid}`}
                  onClick={() => {
                    handleToggleBlock(contextMenu.user);
                    setContextMenu(null);
                  }}
                >
                  {contextMenu.user.status === 'blocked' ? (
                    <>
                      <Unlock size={13} style={{ color: 'var(--status-done, #176E3C)' }} />
                      <span>Unblock Account</span>
                    </>
                  ) : (
                    <>
                      <Lock size={13} style={{ color: 'var(--status-blocked, #D97706)' }} />
                      <span>Block / Suspend</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  className="context-menu-item context-menu-danger"
                  id={`terminate-user-btn-${contextMenu.user.uid}`}
                  onClick={() => {
                    setTerminatingUser(contextMenu.user);
                    setContextMenu(null);
                  }}
                >
                  <UserX size={13} />
                  <span>Terminate</span>
                </button>
              </>
            )}
          </div>
        </>
      )}

      {/* Sensitive User-Management Audit Log Section */}
      <div style={{ marginTop: 'var(--space-5)' }}>
        <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, marginBottom: 'var(--space-2)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <ShieldCheck size={18} style={{ color: 'var(--accent-primary)' }} />
          User Management Audit Trail ({logs.length} Events)
        </h3>
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-3)' }}>
          Immutable record of account creations, updates, suspensions, and terminations.
        </p>

        <div className="activity-timeline" style={{ background: 'var(--bg-card)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', maxHeight: '320px', overflowY: 'auto' }}>
          {paginatedLogs.map(log => (
            <div key={log.id} className="timeline-item">
              <div className="timeline-marker" />
              <div className="timeline-content">
                <div className="timeline-header">
                  <span className="timeline-user" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <User size={12} style={{ color: 'var(--accent-primary, #C9662F)' }} />
                    {log.userDisplayName}
                  </span>
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

          {logs.length > logsPageSize && (
            <Pagination
              currentPage={logsPage}
              totalItems={logs.length}
              pageSize={logsPageSize}
              onPageChange={setLogsPage}
              pageSizeOptions={[5, 10, 25]}
              onPageSizeChange={size => {
                setLogsPageSize(size);
                setLogsPage(1);
              }}
              itemLabel="audit events"
              compact
            />
          )}
        </div>
      </div>

      {/* Invite / Create User Modal */}
      <UserInviteModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        currentUser={currentUser}
      />

      {/* Resend Link Result Modal */}
      <Modal
        isOpen={!!resendResult}
        onClose={() => setResendResult(null)}
        title="Regenerated Activation Link"
        maxWidth="500px"
      >
        <div style={{ padding: '10px 0' }}>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary, #8b949e)', marginBottom: '14px' }}>
            A fresh 48-hour activation link has been generated for <strong>{resendResult?.email}</strong>.
          </p>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <input
              type="text"
              readOnly
              className="form-input font-mono"
              style={{ flex: 1, fontSize: '12px' }}
              value={resendResult?.activationUrl || ''}
            />
            <Button
              variant="primary"
              size="sm"
              onClick={async () => {
                if (resendResult?.activationUrl) {
                  await navigator.clipboard.writeText(resendResult.activationUrl);
                  showToast('success', 'Copied!', 'Link copied to clipboard.');
                }
              }}
            >
              Copy
            </Button>
          </div>
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setResendResult(null)}>
              Done
            </Button>
          </div>
        </div>
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

      {/* User Persona & Permitted Projects Modal */}
      <UserPersonaModal
        isOpen={Boolean(inspectingPersonaUser)}
        onClose={() => setInspectingPersonaUser(null)}
        user={inspectingPersonaUser}
        currentUserId={currentUser.uid}
      />
    </div>
  );
};
