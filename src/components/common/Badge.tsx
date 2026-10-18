import React from 'react';
import { TaskPriority, TaskStatus } from '../../types/task';
import { UserRole } from '../../types/auth';

export interface BadgeProps {
  type: 'status' | 'priority' | 'role' | 'overdue' | 'user-status';
  value: TaskStatus | TaskPriority | UserRole | string;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ type, value, className = '' }) => {
  let badgeClass = 'badge';
  let label = String(value);

  if (type === 'priority') {
    badgeClass += ` badge-${value}`;
    label = value.toUpperCase();
  } else if (type === 'status') {
    const statusSlug = String(value).toLowerCase().replace(/[\s-]/g, '_');
    badgeClass += ` badge-status-${value} badge-status-${statusSlug} badge-status-${statusSlug.replace('_', '')}`;
    label = String(value).replace('_', ' ').toUpperCase();
  } else if (type === 'role') {
    const roleSlug = String(value).toLowerCase().replace(/[\s-]/g, '_');
    badgeClass += ` badge-role badge-role-${roleSlug}`;
    label = String(value).replace('_', ' ').toUpperCase();
  } else if (type === 'overdue') {
    badgeClass += ' badge-urgent';
    label = 'OVERDUE';
  } else if (type === 'user-status') {
    if (value === 'active') {
      badgeClass += ' badge-status-done badge-user-active';
    } else if (value === 'blocked') {
      badgeClass += ' badge-status-blocked badge-user-blocked';
    } else if (value === 'terminated') {
      badgeClass += ' badge-urgent badge-user-terminated';
    } else if (value === 'pending_activation') {
      badgeClass += ' badge-status-inprogress badge-user-pending';
      label = 'PENDING ACTIVATION';
      return <span className={`${badgeClass} ${className}`}>{label}</span>;
    }
    label = String(value).toUpperCase();
  }

  return <span className={`${badgeClass} ${className}`}>{label}</span>;
};
