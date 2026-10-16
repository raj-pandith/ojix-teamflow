import { describe, it, expect } from 'vitest';
import { validateTaskForm, validateProjectForm } from '../../src/domain/validation';

describe('domain validation logic', () => {
  describe('validateTaskForm', () => {
    it('accepts valid task data', () => {
      const result = validateTaskForm({
        title: 'Provision telemetry cluster',
        description: 'Setup Prometheus agents and Grafana dashboards',
        priority: 'high',
        status: 'todo',
        dueDate: '2026-10-25',
      });
      expect(result.isValid).toBe(true);
      expect(Object.keys(result.errors).length).toBe(0);
    });

    it('rejects missing or too short title', () => {
      const empty = validateTaskForm({ title: '   ' });
      expect(empty.isValid).toBe(false);
      expect(empty.errors.title).toBeDefined();

      const short = validateTaskForm({ title: 'AB' });
      expect(short.isValid).toBe(false);
      expect(short.errors.title).toBeDefined();
    });

    it('rejects invalid due date format', () => {
      const result = validateTaskForm({
        title: 'Valid Title',
        dueDate: '10/25/2026', // Malformed format
      });
      expect(result.isValid).toBe(false);
      expect(result.errors.dueDate).toBeDefined();
    });
  });

  describe('validateProjectForm', () => {
    it('accepts valid project dates', () => {
      const result = validateProjectForm({
        name: 'Infrastructure Modernization',
        objective: 'Containerize core services and migrate to GCP',
        startDate: '2026-10-01',
        dueDate: '2026-12-31',
      });
      expect(result.isValid).toBe(true);
    });

    it('rejects project where dueDate is before startDate', () => {
      const result = validateProjectForm({
        name: 'Backwards Project',
        objective: 'Time travel experiments',
        startDate: '2026-11-01',
        dueDate: '2026-10-01', // Due before start
      });
      expect(result.isValid).toBe(false);
      expect(result.errors.dueDate).toBeDefined();
    });
  });
});
