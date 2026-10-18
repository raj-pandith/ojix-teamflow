import { describe, it, expect, beforeEach } from 'vitest';
import { storageEngine } from '../../src/services/storageEngine';
import { authService } from '../../src/services/authService';
import { projectService } from '../../src/services/projectService';
import { UserProfile } from '../../src/types/auth';
import { Project } from '../../src/types/project';

describe('Permitted Projects in User Persona Lifecycle', () => {
  const now = new Date().toISOString();

  const adminAlex: UserProfile = {
    uid: 'u-admin-alex-test',
    email: 'admin.alex@ojix.local',
    displayName: 'Alex Admin',
    role: 'workspace_admin',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  const leadSarah: UserProfile = {
    uid: 'u-lead-sarah-test',
    email: 'lead.sarah@ojix.local',
    displayName: 'Sarah Lead',
    role: 'project_lead',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  beforeEach(() => {
    storageEngine.initialize(true);
    (storageEngine as any).users = [adminAlex, leadSarah];
    (storageEngine as any).personas = [];
    (storageEngine as any).projects = [];
  });

  it('1. Newly invited member initially has no permitted projects if not yet invited to any project', () => {
    const member = storageEngine.addUser(
      {
        uid: 'u-member-bob',
        displayName: 'Bob Builder',
        email: 'bob@ojix.local',
        role: 'member',
      },
      adminAlex
    );

    const persona = authService.getPersona(member.uid);
    expect(persona).toBeDefined();
    expect(persona?.permittedProjects).toBeDefined();
    expect(persona?.permittedProjects?.length).toBe(0);
  });

  it('2. Automatically adds project to user persona permitted projects when Project Lead invites member via project creation', async () => {
    const member = storageEngine.addUser(
      {
        uid: 'u-member-carol',
        displayName: 'Carol Danvers',
        email: 'carol@ojix.local',
        role: 'member',
      },
      adminAlex
    );

    // Project Lead Sarah creates a new project and invites Carol
    const newProject = await projectService.createProject(
      {
        name: 'Avenger Protocol Rollout',
        objective: 'Deploy unified task telemetry across operational pods',
        status: 'active',
        startDate: '2026-10-18',
        dueDate: '2026-11-30',
        memberIds: [member.uid],
      },
      leadSarah
    );

    // Inspect Carol's persona
    const persona = authService.getPersona(member.uid);
    expect(persona?.permittedProjects).toContain('Avenger Protocol Rollout');
    expect(persona?.permittedProjectIds).toContain(newProject.id);

    // Verify storageEngine also reflects permitted projects
    const allPersonas = storageEngine.getPersonas();
    const carolPersona = allPersonas.find(p => p.uid === member.uid);
    expect(carolPersona?.permittedProjects).toContain('Avenger Protocol Rollout');
  });

  it('3. Automatically adds project to user persona permitted projects when invited by Project Lead or Admin to an existing project', () => {
    // 1. Project Lead creates project without member initially
    const project: Project = {
      id: 'proj-gamma-ops',
      workspaceId: 'ws-ojix-main',
      name: 'Gamma Incident Platform',
      objective: 'Real-time telemetry and incident triage',
      status: 'active',
      ownerId: leadSarah.uid,
      memberIds: [adminAlex.uid, leadSarah.uid],
      startDate: '2026-10-18',
      dueDate: '2026-11-20',
      createdAt: now,
      updatedAt: now,
    };
    storageEngine.saveProject(project, leadSarah);

    // 2. Add member Bruce
    const bruce = storageEngine.addUser(
      {
        uid: 'u-member-bruce',
        displayName: 'Bruce Banner',
        email: 'bruce@ojix.local',
        role: 'member',
      },
      adminAlex
    );

    // Bruce does not have Gamma Incident Platform yet
    let brucePersona = authService.getPersona(bruce.uid);
    expect(brucePersona?.permittedProjects).not.toContain('Gamma Incident Platform');

    // 3. Project Lead Sarah invites Bruce to contribute
    storageEngine.addTeamMember('proj-gamma-ops', bruce.uid, leadSarah);

    // 4. Bruce's persona now includes Gamma Incident Platform in permitted projects
    brucePersona = authService.getPersona(bruce.uid);
    expect(brucePersona?.permittedProjects).toContain('Gamma Incident Platform');
    expect(brucePersona?.permittedProjectIds).toContain('proj-gamma-ops');
  });

  it('4. Automatically updates user persona permitted projects when Admin adds member to an existing project', () => {
    const project: Project = {
      id: 'proj-omega-ops',
      workspaceId: 'ws-ojix-main',
      name: 'Omega Telemetry Stack',
      objective: 'Core telemetry engine',
      status: 'active',
      ownerId: leadSarah.uid,
      memberIds: [adminAlex.uid, leadSarah.uid],
      startDate: '2026-10-18',
      dueDate: '2026-11-20',
      createdAt: now,
      updatedAt: now,
    };
    storageEngine.saveProject(project, leadSarah);

    const viewer = storageEngine.addUser(
      {
        uid: 'u-viewer-peter',
        displayName: 'Peter Parker',
        email: 'peter@ojix.local',
        role: 'viewer',
      },
      adminAlex
    );

    // Admin Alex adds Peter to the project team
    storageEngine.addTeamMember('proj-omega-ops', viewer.uid, adminAlex);

    const peterPersona = authService.getPersona(viewer.uid);
    expect(peterPersona?.permittedProjects).toContain('Omega Telemetry Stack');
    expect(peterPersona?.permittedProjectIds).toContain('proj-omega-ops');
  });

  it('5. Workspace Admins are permitted across all workspace projects by governance policy', () => {
    const projectA: Project = {
      id: 'proj-a',
      workspaceId: 'ws-ojix-main',
      name: 'Project Alpha',
      objective: 'Alpha deliverables',
      status: 'active',
      ownerId: leadSarah.uid,
      memberIds: [leadSarah.uid],
      startDate: '2026-10-18',
      dueDate: '2026-11-20',
      createdAt: now,
      updatedAt: now,
    };
    const projectB: Project = {
      id: 'proj-b',
      workspaceId: 'ws-ojix-main',
      name: 'Project Beta',
      objective: 'Beta deliverables',
      status: 'active',
      ownerId: leadSarah.uid,
      memberIds: [leadSarah.uid],
      startDate: '2026-10-18',
      dueDate: '2026-11-20',
      createdAt: now,
      updatedAt: now,
    };
    storageEngine.saveProject(projectA, adminAlex);
    storageEngine.saveProject(projectB, adminAlex);

    const adminPersona = authService.getPersona(adminAlex.uid);
    expect(adminPersona?.permittedProjects).toContain('Project Alpha');
    expect(adminPersona?.permittedProjects).toContain('Project Beta');
  });

  it('6. Removes project from persona permitted projects when member is removed from project team', () => {
    const member = storageEngine.addUser(
      {
        uid: 'u-member-sam',
        displayName: 'Sam Wilson',
        email: 'sam@ojix.local',
        role: 'member',
      },
      adminAlex
    );

    const project: Project = {
      id: 'proj-flight-ops',
      workspaceId: 'ws-ojix-main',
      name: 'Flight Guidance Platform',
      objective: 'Aviation systems',
      status: 'active',
      ownerId: leadSarah.uid,
      memberIds: [adminAlex.uid, leadSarah.uid, member.uid],
      startDate: '2026-10-18',
      dueDate: '2026-11-20',
      createdAt: now,
      updatedAt: now,
    };
    storageEngine.saveProject(project, leadSarah);

    expect(authService.getPersona(member.uid)?.permittedProjects).toContain('Flight Guidance Platform');

    // Remove Sam from the project team
    storageEngine.removeTeamMember('proj-flight-ops', member.uid, leadSarah);

    // Sam no longer has Flight Guidance Platform in permitted projects
    expect(authService.getPersona(member.uid)?.permittedProjects).not.toContain('Flight Guidance Platform');
  });
});
