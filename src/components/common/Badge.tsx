import React from 'react';
import { TaskPriority, TaskStatus } from '../../types/task';
import { UserRole } from '../../types/auth';

export interface BadgeProps {
  type: 'status' | 'priority' | 'role' | 'overdue';
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
    badgeClass += ` badge-status-${value}`;
    label = String(value).replace('_', ' ').toUpperCase();
  } else if (type === 'role') {
    badgeClass += ' badge-role';
    label = String(value).replace('_', ' ').toUpperCase();
  } else if (type === 'overdue') {
    badgeClass += ' badge-urgent';
    label = 'OVERDUE';
  }

  return <span className={`${badgeClass} ${className}`}>{label}</span>;
};
