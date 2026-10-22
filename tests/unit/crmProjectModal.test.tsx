import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CrmProjectImportModal } from '../../src/components/projects/CrmProjectImportModal';
import { crmService } from '../../src/services/crmService';
import { storageEngine } from '../../src/services/storageEngine';
import { UserProfile } from '../../src/types/auth';

describe('CrmProjectImportModal UI Component', () => {
  let adminUser: UserProfile;
  const mockOnClose = vi.fn();
  const mockOnProjectsImported = vi.fn();

  const mockCrmProjects = [
    {
      id: 'proj-d-1',
      dealId: 'd-1',
      name: 'Autonomous Fleet Telemetry Suite',
      title: 'Autonomous Fleet Telemetry Suite',
      objective: 'Customer confirmed budget clearance for Q4 rollout.',
      client: {
        name: 'Sophia Sterling',
        email: 'sophia@aurarobotics.synthetic',
        phone: '+91 98765 43210',
      },
      dealValue: 125000,
      dealStage: 'WON',
      temperature: 'HOT',
      status: 'active',
      isReadyForExecution: true,
      startDate: '2026-10-22',
      dueDate: '2026-10-19', // Invalid date range
      isAlreadyImported: false,
      isValidDateRange: false,
      validationError: 'Target completion date must be on or after start date.',
    },
    {
      id: 'proj-d-4',
      dealId: 'd-4',
      name: 'Enterprise Single Sign-On Module',
      title: 'Enterprise Single Sign-On Module',
      objective: 'Execute deliverables for Sophia Sterling under closed contract.',
      client: {
        name: 'Sophia Sterling',
        email: 'sophia@aurarobotics.synthetic',
        phone: '+91 98765 43210',
      },
      dealValue: 35000,
      dealStage: 'WON',
      temperature: 'NORMAL',
      status: 'active',
      isReadyForExecution: true,
      startDate: '2026-10-22',
      dueDate: '2026-10-26', // Valid date range
      isAlreadyImported: false,
      isValidDateRange: true,
    },
    {
      id: 'proj-d-9',
      dealId: 'd-9',
      name: 'Cloud Infrastructure Migration',
      title: 'Cloud Infrastructure Migration',
      objective: 'Completed cloud transition milestone.',
      client: {
        name: 'Acme Corp',
        email: 'contact@acme.corp',
      },
      dealValue: 80000,
      dealStage: 'WON',
      temperature: 'HOT',
      status: 'active',
      isReadyForExecution: true,
      startDate: '2026-10-01',
      dueDate: '2026-10-31',
      isAlreadyImported: true, // Previously imported
      isValidDateRange: true,
    },
  ];

  beforeEach(() => {
    storageEngine.initialize(true);
    mockOnClose.mockClear();
    mockOnProjectsImported.mockClear();
    adminUser = storageEngine.getUser('user-admin-alex')!;

    // Spy on fetchAvailableProjects by default
    vi.spyOn(crmService, 'fetchAvailableProjects').mockResolvedValue({
      success: true,
      totalCount: mockCrmProjects.length,
      projects: [...mockCrmProjects],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders modal with correct title, dynamic count summary, and project card details', async () => {
    render(
      <CrmProjectImportModal
        isOpen={true}
        onClose={mockOnClose}
        currentUser={adminUser}
        onProjectsImported={mockOnProjectsImported}
      />
    );

    // Dialog title
    expect(await screen.findByText('Available Projects from ClientFlow')).toBeDefined();

    // Summary banner
    expect(
      screen.getByText(/Found 3 available projects from OJIX ClientFlow/i)
    ).toBeDefined();

    // Check project names and details rendered
    expect(screen.getByText('Autonomous Fleet Telemetry Suite')).toBeDefined();
    expect(screen.getByText('Enterprise Single Sign-On Module')).toBeDefined();
    expect(screen.getByText('Cloud Infrastructure Migration')).toBeDefined();

    // Client name and formatted deal values
    expect(screen.getAllByText('Sophia Sterling').length).toBeGreaterThan(0);
    expect(screen.getByText('$125,000')).toBeDefined();
    expect(screen.getByText('$35,000')).toBeDefined();

    // Deal stage and readiness badges
    expect(screen.getAllByText('WON').length).toBe(3);
    expect(screen.getAllByText('Ready for Execution').length).toBe(3);
  });

  it('identifies previously imported projects with an Already Imported label and disables selection', async () => {
    render(
      <CrmProjectImportModal
        isOpen={true}
        onClose={mockOnClose}
        currentUser={adminUser}
        onProjectsImported={mockOnProjectsImported}
      />
    );

    await screen.findByText('Cloud Infrastructure Migration');

    // Verify Already Imported badge
    expect(screen.getByText(/Already Imported/i)).toBeDefined();

    // Checkbox for already imported project should be disabled
    const importedCheckbox = screen.getByLabelText('Select Cloud Infrastructure Migration') as HTMLInputElement;
    expect(importedCheckbox.disabled).toBe(true);
  });

  it('flags invalid date ranges with a clear warning callout and disables selection', async () => {
    render(
      <CrmProjectImportModal
        isOpen={true}
        onClose={mockOnClose}
        currentUser={adminUser}
        onProjectsImported={mockOnProjectsImported}
      />
    );

    await screen.findByText('Autonomous Fleet Telemetry Suite');

    // Warning callout about target completion date before start date
    expect(screen.getByText(/Invalid Date Range:/i)).toBeDefined();
    expect(screen.getByText(/Validation rules prohibit importing/i)).toBeDefined();

    // Checkbox should be disabled
    const invalidCheckbox = screen.getByLabelText('Select Autonomous Fleet Telemetry Suite') as HTMLInputElement;
    expect(invalidCheckbox.disabled).toBe(true);
  });

  it('starts with 0 projects selected, disabling Accept Projects (0) button', async () => {
    render(
      <CrmProjectImportModal
        isOpen={true}
        onClose={mockOnClose}
        currentUser={adminUser}
        onProjectsImported={mockOnProjectsImported}
      />
    );

    await screen.findByText('Enterprise Single Sign-On Module');

    const acceptBtn = screen.getByRole('button', { name: /Accept Projects \(0\)/i }) as HTMLButtonElement;
    expect(acceptBtn.disabled).toBe(true);
  });

  it('updates Accept Projects count when manually selecting an eligible project', async () => {
    render(
      <CrmProjectImportModal
        isOpen={true}
        onClose={mockOnClose}
        currentUser={adminUser}
        onProjectsImported={mockOnProjectsImported}
      />
    );

    await screen.findByText('Enterprise Single Sign-On Module');

    const validCheckbox = screen.getByLabelText('Select Enterprise Single Sign-On Module') as HTMLInputElement;
    fireEvent.click(validCheckbox);

    // Accept button should now show (1) and be enabled
    const acceptBtn = screen.getByRole('button', { name: /Accept Projects \(1\)/i }) as HTMLButtonElement;
    expect(acceptBtn.disabled).toBe(false);

    // Unchecking reverts back to (0)
    fireEvent.click(validCheckbox);
    expect(screen.getByRole('button', { name: /Accept Projects \(0\)/i })).toBeDefined();
  });

  it('Select All Projects checkbox selects all eligible projects and clears when unchecked', async () => {
    render(
      <CrmProjectImportModal
        isOpen={true}
        onClose={mockOnClose}
        currentUser={adminUser}
        onProjectsImported={mockOnProjectsImported}
      />
    );

    await screen.findByText('Enterprise Single Sign-On Module');

    // Only 1 project is eligible (proj-d-4), since proj-d-1 has invalid dates and proj-d-9 is already imported
    const selectAllCheckbox = screen.getByLabelText('Select All Projects') as HTMLInputElement;
    expect(selectAllCheckbox.checked).toBe(false);

    // Click Select All
    fireEvent.click(selectAllCheckbox);
    expect(selectAllCheckbox.checked).toBe(true);
    expect(screen.getByRole('button', { name: /Accept Projects \(1\)/i })).toBeDefined();

    // Click Uncheck All
    fireEvent.click(selectAllCheckbox);
    expect(selectAllCheckbox.checked).toBe(false);
    expect(screen.getByRole('button', { name: /Accept Projects \(0\)/i })).toBeDefined();
  });

  it('Cancel button closes the dialog without triggering any project imports', async () => {
    const importSpy = vi.spyOn(crmService, 'importProjects');

    render(
      <CrmProjectImportModal
        isOpen={true}
        onClose={mockOnClose}
        currentUser={adminUser}
        onProjectsImported={mockOnProjectsImported}
      />
    );

    await screen.findByText('Enterprise Single Sign-On Module');

    const cancelBtn = screen.getByRole('button', { name: /Cancel/i });
    fireEvent.click(cancelBtn);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
    expect(importSpy).not.toHaveBeenCalled();
    expect(mockOnProjectsImported).not.toHaveBeenCalled();
  });

  it('imports selected projects on Accept Projects click, calling onProjectsImported callback', async () => {
    vi.spyOn(crmService, 'importProjects').mockResolvedValueOnce({
      success: true,
      totalRequested: 1,
      importedCount: 1,
      failedCount: 0,
      importedProjects: [
        {
          id: 'proj-new-sso',
          workspaceId: 'ws-ojix-main',
          name: 'Enterprise Single Sign-On Module',
          objective: 'Scope',
          ownerId: adminUser.uid,
          status: 'active',
          startDate: '2026-10-22',
          dueDate: '2026-10-26',
          memberIds: [adminUser.uid],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      failedProjects: [],
    });

    render(
      <CrmProjectImportModal
        isOpen={true}
        onClose={mockOnClose}
        currentUser={adminUser}
        onProjectsImported={mockOnProjectsImported}
      />
    );

    await screen.findByText('Enterprise Single Sign-On Module');

    // Select the eligible project
    const checkbox = screen.getByLabelText('Select Enterprise Single Sign-On Module');
    fireEvent.click(checkbox);

    const acceptBtn = screen.getByRole('button', { name: /Accept Projects \(1\)/i });
    fireEvent.click(acceptBtn);

    await waitFor(() => {
      expect(crmService.importProjects).toHaveBeenCalledWith(
        [expect.objectContaining({ id: 'proj-d-4' })],
        adminUser
      );
      expect(mockOnProjectsImported).toHaveBeenCalledTimes(1);
    });
  });

  it('displays accurate report banner if partial import failures occur', async () => {
    vi.spyOn(crmService, 'importProjects').mockResolvedValueOnce({
      success: false,
      totalRequested: 2,
      importedCount: 1,
      failedCount: 1,
      importedProjects: [
        {
          id: 'proj-new-1',
          workspaceId: 'ws-ojix-main',
          name: 'Enterprise Single Sign-On Module',
          objective: 'Scope',
          ownerId: adminUser.uid,
          status: 'active',
          startDate: '2026-10-22',
          dueDate: '2026-10-26',
          memberIds: [adminUser.uid],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      failedProjects: [
        {
          id: 'proj-d-1',
          name: 'Autonomous Fleet Telemetry Suite',
          reason: 'Target completion date must be on or after start date.',
        },
      ],
    });

    render(
      <CrmProjectImportModal
        isOpen={true}
        onClose={mockOnClose}
        currentUser={adminUser}
        onProjectsImported={mockOnProjectsImported}
      />
    );

    await screen.findByText('Enterprise Single Sign-On Module');

    const checkbox = screen.getByLabelText('Select Enterprise Single Sign-On Module');
    fireEvent.click(checkbox);

    const acceptBtn = screen.getByRole('button', { name: /Accept Projects \(1\)/i });
    fireEvent.click(acceptBtn);

    // Verify report banner renders
    expect(await screen.findByText(/1 project imported successfully/i)).toBeDefined();
    expect(screen.getByText(/1 project failed to import/i)).toBeDefined();
    expect(screen.getByText(/Target completion date must be on or after start date/i)).toBeDefined();
  });

  it('displays empty state when CRM returns 0 projects', async () => {
    vi.spyOn(crmService, 'fetchAvailableProjects').mockResolvedValueOnce({
      success: true,
      totalCount: 0,
      projects: [],
    });

    render(
      <CrmProjectImportModal
        isOpen={true}
        onClose={mockOnClose}
        currentUser={adminUser}
        onProjectsImported={mockOnProjectsImported}
      />
    );

    expect(await screen.findByText('No Available Projects to Import')).toBeDefined();
    expect(
      screen.getByText(/There are currently no won deals ready for execution/i)
    ).toBeDefined();
  });

  it('displays fetch error alert with retry button when API fails', async () => {
    vi.spyOn(crmService, 'fetchAvailableProjects').mockResolvedValueOnce({
      success: false,
      totalCount: 0,
      projects: [],
      error: 'Network connection lost while reaching CRM API',
    });

    render(
      <CrmProjectImportModal
        isOpen={true}
        onClose={mockOnClose}
        currentUser={adminUser}
        onProjectsImported={mockOnProjectsImported}
      />
    );

    expect(await screen.findByText(/Network connection lost while reaching CRM API/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /Retry/i })).toBeDefined();
  });
});
