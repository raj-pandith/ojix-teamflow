import { describe, it, expect, beforeEach } from 'vitest';
import { storageEngine } from '../../src/services/storageEngine';
import { projectService } from '../../src/services/projectService';
import { notificationService } from '../../src/services/notificationService';
import { UserProfile } from '../../src/types/auth';

describe('Admin Default Project Membership Policy', () => {
  const now = new Date().toISOString();

  const adminAlex: UserProfile = {
    uid: 'u-admin-alex-test',
    email: 'alex.admin@ojix.local',
    displayName: 'Alex Admin',
    role: 'workspace_admin',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  const leadSarah: UserProfile = {
    uid: 'u-lead-sarah-test',
    email: 'sarah.lead@ojix.local',
    displayName: 'Sarah Lead',
    role: 'project_lead',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  const memberMarcus: UserProfile = {
    uid: 'u-member-marcus-test',
    email: 'marcus.dev@ojix.local',
    displayName: 'Marcus Dev',
    role: 'member',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  beforeEach(() => {
    storageEngine.initialize(true);
    (storageEngine as any).users = [adminAlex, leadSarah, memberMarcus];
    (storageEngine as any).projects = [];
    (storageEngine as any).tasks = [];
    (storageEngine as any).notifications = [];
  });

  it('automatically adds workspace admin by default when a Project Lead creates a project', async () => {
    const project = await projectService.createProject(
      {
        name: 'Lead Created Initiative',
        objective: 'Verifying admin is always added by default',
        status: 'active',
        startDate: '2026-10-01',
        dueDate: '2026-11-01',
        memberIds: [memberMarcus.uid], // Lead only specified Marcus
      },
      leadSarah
    );

    expect(project.memberIds).toContain(adminAlex.uid);
    expect(project.memberIds).toContain(leadSarah.uid);
    expect(project.memberIds).toContain(memberMarcus.uid);

    // Admin should receive a PROJECT_MEMBER_ADDED notification from Lead
    const adminNotifs = notificationService.getNotifications(adminAlex);
    const welcomeNotif = adminNotifs.find(n => n.projectId === project.id && n.type === 'PROJECT_MEMBER_ADDED');
    expect(welcomeNotif).toBeDefined();
    expect(welcomeNotif?.recipientUserId).toBe(adminAlex.uid);
    expect(welcomeNotif?.actorUserId).toBe(leadSarah.uid);
  });

  it('automatically adds workspace admin even if memberIds array is empty or unspecified', async () => {
    const project = await projectService.createProject(
      {
        name: 'Empty Member List Project',
        objective: 'Project with no initial members selected',
        status: 'planning',
        startDate: '2026-10-01',
        dueDate: '2026-11-01',
        memberIds: [],
      },
      leadSarah
    );

    expect(project.memberIds).toContain(adminAlex.uid);
    expect(project.memberIds).toContain(leadSarah.uid);
  });

  it('ensures admin is included when admin creates a project', async () => {
    const project = await projectService.createProject(
      {
        name: 'Admin Created Project',
        objective: 'Testing admin owner project creation',
        status: 'active',
        startDate: '2026-10-01',
        dueDate: '2026-11-01',
        memberIds: [memberMarcus.uid],
      },
      adminAlex
    );

    expect(project.memberIds).toContain(adminAlex.uid);
    expect(project.ownerId).toBe(adminAlex.uid);
  });
});
