import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RemoveMemberConfirmModal } from '../../src/components/projects/RemoveMemberConfirmModal';
import { storageEngine } from '../../src/services/storageEngine';
import { Project } from '../../src/types/project';
import { UserProfile } from '../../src/types/auth';

describe('RemoveMemberConfirmModal UI Component', () => {
  let project: Project;
  let leadSarah: UserProfile;
  let memberMarcus: UserProfile;
  const mockOnClose = vi.fn();
  const mockOnSuccess = vi.fn();

  beforeEach(() => {
    storageEngine.initialize(true);
    mockOnClose.mockClear();
    mockOnSuccess.mockClear();

    leadSarah = storageEngine.getUser('user-lead-sarah')!;
    memberMarcus = storageEngine.getUser('user-member-marcus')!;
    project = storageEngine.getProjectById('proj-infra-01', leadSarah)!;
  });

  it('renders confirmation dialog with member details, active task count, completed task count, and consequence notice', () => {
    render(
      <RemoveMemberConfirmModal
        isOpen={true}
        onClose={mockOnClose}
        project={project}
        member={memberMarcus}
        currentUser={leadSarah}
        onSuccess={mockOnSuccess}
      />
    );

    // Modal title & member info
    expect(screen.getByText('Remove Member: Marcus Vance')).toBeDefined();
    expect(screen.getByText('member@ojix.local')).toBeDefined();

    // Consequence warning
    expect(screen.getByText('Team Governance & Access Impact')).toBeDefined();
    expect(screen.getByText(/Immediate Access Revocation/i)).toBeDefined();

    // Stats chips: Marcus has 4 active tasks and 1 completed task in mockData
    expect(screen.getByText('Active / Unfinished Tasks')).toBeDefined();
    expect(screen.getByText('Completed Tasks (Preserved)')).toBeDefined();

    // Task rows
    expect(screen.getByText('Zero-trust ingress proxy setup')).toBeDefined();
    expect(screen.getByText('Redis caching cluster configuration')).toBeDefined();
  });

  it('allows selecting replacement assignees and displays distinction between reassigned and unassigned', async () => {
    render(
      <RemoveMemberConfirmModal
        isOpen={true}
        onClose={mockOnClose}
        project={project}
        member={memberMarcus}
        currentUser={leadSarah}
        onSuccess={mockOnSuccess}
      />
    );

    // Initially all unfinished tasks are unassigned
    const unassignedBadges = screen.getAllByText('⏸ Will be Unassigned');
    expect(unassignedBadges.length).toBeGreaterThan(0);

    // Reassign task-102 to eligible Project Lead (Sarah Chen)
    const select102 = screen.getByLabelText(/Reassign task Zero-trust ingress proxy setup/i) as HTMLSelectElement;
    // Confirm Alex Morgan (admin) is excluded from options
    const optionValues = Array.from(select102.options).map(o => o.value);
    expect(optionValues).not.toContain('user-admin-alex');

    fireEvent.change(select102, { target: { value: 'user-lead-sarah' } });

    // Now there should be a badge indicating reassigned to Sarah Chen
    await waitFor(() => {
      expect(screen.getByText('➔ Reassigned to Sarah Chen')).toBeDefined();
    });
  });

  it('allows bulk reassigning all unfinished tasks with one click', async () => {
    render(
      <RemoveMemberConfirmModal
        isOpen={true}
        onClose={mockOnClose}
        project={project}
        member={memberMarcus}
        currentUser={leadSarah}
        onSuccess={mockOnSuccess}
      />
    );

    const bulkSelect = screen.getByRole('combobox', { name: '' });
    fireEvent.change(bulkSelect, { target: { value: 'user-lead-sarah' } });

    const applyAllBtn = screen.getByText('Apply All');
    fireEvent.click(applyAllBtn);

    // All active tasks should now be reassigned to Sarah Chen
    await waitFor(() => {
      const reassignedBadges = screen.getAllByText('➔ Reassigned to Sarah Chen');
      expect(reassignedBadges.length).toBe(4);
    });
  });

  it('submitting successfully calls projectService.removeTeamMember and onSuccess', async () => {
    render(
      <RemoveMemberConfirmModal
        isOpen={true}
        onClose={mockOnClose}
        project={project}
        member={memberMarcus}
        currentUser={leadSarah}
        onSuccess={mockOnSuccess}
      />
    );

    const confirmBtn = screen.getByText('Confirm & Remove from Team');
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockOnSuccess).toHaveBeenCalledTimes(1);
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    // Verify Marcus was removed from project
    const updatedProj = storageEngine.getProjectById('proj-infra-01', leadSarah)!;
    expect(updatedProj.memberIds).not.toContain(memberMarcus.uid);
  });

  it('displays the inner view of the task (TaskDetailModal) when user clicks on a task title', async () => {
    render(
      <RemoveMemberConfirmModal
        isOpen={true}
        onClose={mockOnClose}
        project={project}
        member={memberMarcus}
        currentUser={leadSarah}
        onSuccess={mockOnSuccess}
      />
    );

    // Click on the task title button for "Legacy auth token deprecation"
    const taskTitleBtn = screen.getByText('Legacy auth token deprecation');
    fireEvent.click(taskTitleBtn);

    // Verify the inner view of the task opens (TaskDetailModal)
    await waitFor(() => {
      // Shows task description
      expect(
        screen.getByText(/Migrate active client SDKs from v1 HMAC tokens to JWT asymmetric signed sessions/i)
      ).toBeDefined();
      // Shows comments and activity timeline header
      expect(screen.getByText(/ACTIVITY & COMMENTS/i)).toBeDefined();
      // Shows update task button
      expect(screen.getByText(/Update Task/i)).toBeDefined();
    });
  });
});
