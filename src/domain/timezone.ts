import { TaskStatus } from '../types/task';

/**
 * Returns today's calendar date as 'YYYY-MM-DD' in the specified or local timezone.
 */
export function getLocalTodayDateString(referenceDate: Date = new Date()): string {
  const year = referenceDate.getFullYear();
  const month = String(referenceDate.getMonth() + 1).padStart(2, '0');
  const day = String(referenceDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Determines whether a task is overdue per DEC-005:
 * A task is overdue if and only if:
 * 1. status !== 'done'
 * 2. dueDate < today's calendar date in local timezone (i.e. past 23:59:59 of due date)
 */
export function isTaskOverdue(
  dueDate: string,
  status: TaskStatus,
  referenceDate: Date = new Date()
): boolean {
  if (status === 'done') {
    return false;
  }
  const todayStr = getLocalTodayDateString(referenceDate);
  return dueDate < todayStr;
}

/**
 * Calculates due date relative status for display badge:
 * 'overdue' | 'due_today' | 'due_this_week' | 'future'
 */
export function getDueDateCategory(
  dueDate: string,
  status: TaskStatus,
  referenceDate: Date = new Date()
): 'overdue' | 'due_today' | 'due_this_week' | 'future' {
  if (status === 'done') {
    return 'future';
  }

  const todayStr = getLocalTodayDateString(referenceDate);
  if (dueDate < todayStr) {
    return 'overdue';
  }
  if (dueDate === todayStr) {
    return 'due_today';
  }

  // Calculate days difference
  const dueTime = new Date(`${dueDate}T00:00:00`).getTime();
  const todayTime = new Date(`${todayStr}T00:00:00`).getTime();
  const diffDays = Math.ceil((dueTime - todayTime) / (1000 * 60 * 60 * 24));

  if (diffDays <= 7) {
    return 'due_this_week';
  }
  return 'future';
}

/**
 * Formats an ISO date into human-readable format, e.g. "Oct 24, 2026"
 */
export function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  if (!year || !month || !day) return dateStr;
  const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
