import { describe, it, expect } from 'vitest';
import { isTaskOverdue, getDueDateCategory, getLocalTodayDateString } from '../../src/domain/timezone';

describe('timezone overdue calculation logic (DEC-005)', () => {
  // Reference date: 2026-10-16
  const refDate = new Date(2026, 9, 16, 14, 30, 0); // Oct 16, 2026

  it('correctly formats local today calendar date string', () => {
    expect(getLocalTodayDateString(refDate)).toBe('2026-10-16');
  });

  it('marks tasks with due dates strictly before today as overdue', () => {
    // Yesterday: 2026-10-15
    expect(isTaskOverdue('2026-10-15', 'in_progress', refDate)).toBe(true);
    expect(isTaskOverdue('2026-10-10', 'todo', refDate)).toBe(true);
    expect(isTaskOverdue('2026-10-15', 'blocked', refDate)).toBe(true);
  });

  it('does NOT mark tasks due today as overdue (remains valid until 23:59:59)', () => {
    expect(isTaskOverdue('2026-10-16', 'in_progress', refDate)).toBe(false);
  });

  it('does NOT mark tasks due in the future as overdue', () => {
    expect(isTaskOverdue('2026-10-17', 'in_progress', refDate)).toBe(false);
    expect(isTaskOverdue('2026-11-01', 'todo', refDate)).toBe(false);
  });

  it('never marks a Done task as overdue regardless of due date', () => {
    expect(isTaskOverdue('2026-10-01', 'done', refDate)).toBe(false);
    expect(isTaskOverdue('2026-09-01', 'done', refDate)).toBe(false);
  });

  it('correctly categorizes due date ranges', () => {
    expect(getDueDateCategory('2026-10-15', 'todo', refDate)).toBe('overdue');
    expect(getDueDateCategory('2026-10-16', 'todo', refDate)).toBe('due_today');
    expect(getDueDateCategory('2026-10-20', 'todo', refDate)).toBe('due_this_week');
    expect(getDueDateCategory('2026-11-20', 'todo', refDate)).toBe('future');
  });
});
