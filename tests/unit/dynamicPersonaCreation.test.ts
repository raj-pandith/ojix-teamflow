import { describe, it, expect, beforeEach } from 'vitest';
import { storageEngine } from '../../src/services/storageEngine';
import { authService } from '../../src/services/authService';
import { UserProfile } from '../../src/types/auth';

describe('Dynamic Persona Creation on User Invitation/Creation', () => {
  const now = new Date().toISOString();

  const adminAlex: UserProfile = {
    uid: 'u-admin-persona-test',
    email: 'admin.persona@ojix.local',
    displayName: 'Alex Admin',
    role: 'workspace_admin',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  beforeEach(() => {
    storageEngine.initialize(true);
    (storageEngine as any).users = [adminAlex];
    (storageEngine as any).personas = [];
  });

  it('dynamically creates a new user persona when a new Member is invited/created', () => {
    const newUser = storageEngine.addUser(
      {
        uid: 'u-persona-member-1',
        displayName: 'Natasha Romanoff',
        email: 'natasha@ojix.local',
        role: 'member',
        phone: '+1 (555) 019-2834',
      },
      adminAlex
    );

    // Verify persona exists in storageEngine and authService
    const personas = authService.getPersonas();
    const createdPersona = personas.find(p => p.uid === newUser.uid);

    expect(createdPersona).toBeDefined();
    expect(createdPersona?.displayName).toBe('Natasha Romanoff');
    expect(createdPersona?.email).toBe('natasha@ojix.local');
    expect(createdPersona?.role).toBe('member');
    expect(createdPersona?.roleLabel).toBe('Member');
    expect(createdPersona?.description).toContain('Executes assigned tasks');
    expect(createdPersona?.phone).toBe('+1 (555) 019-2834');
    expect(createdPersona?.status).toBe('active');

    // Immediately switch to the new persona without application reload
    const switched = authService.switchPersona(newUser.uid);
    expect(switched.uid).toBe(newUser.uid);
    expect(switched.displayName).toBe('Natasha Romanoff');
    expect(authService.getCurrentUser()?.uid).toBe(newUser.uid);
  });

  it('dynamically creates a new Project Lead persona with designated roleLabel and description', () => {
    const newLead = storageEngine.addUser(
      {
        uid: 'u-persona-lead-1',
        displayName: 'Steve Rogers',
        email: 'steve@ojix.local',
        role: 'project_lead',
      },
      adminAlex
    );

    const persona = authService.getPersona(newLead.uid);
    expect(persona).toBeDefined();
    expect(persona?.roleLabel).toBe('Project Lead');
    expect(persona?.description).toContain('Creates projects, assigns work');

    // Switch to Project Lead persona
    authService.switchPersona(newLead.uid);
    expect(authService.getCurrentUser()?.role).toBe('project_lead');
  });

  it('dynamically creates a Viewer persona with read-only badge indicator', () => {
    const newViewer = storageEngine.addUser(
      {
        uid: 'u-persona-viewer-1',
        displayName: 'Clint Barton',
        email: 'clint@ojix.local',
        role: 'viewer',
      },
      adminAlex
    );

    const persona = authService.getPersona(newViewer.uid);
    expect(persona).toBeDefined();
    expect(persona?.roleLabel).toBe('Viewer (Read-Only)');
    expect(persona?.description).toContain('Observes permitted boards');

    // User can authenticate using their new email
    const loggedIn = authService.loginWithEmail('clint@ojix.local');
    expect(loggedIn.uid).toBe(newViewer.uid);
  });

  it('dynamically synchronizes persona when user details or role are updated', () => {
    const user = storageEngine.addUser(
      {
        uid: 'u-persona-update-1',
        displayName: 'Wanda Maximoff',
        email: 'wanda@ojix.local',
        role: 'member',
      },
      adminAlex
    );

    expect(authService.getPersona(user.uid)?.roleLabel).toBe('Member');

    // Promote Wanda to Project Lead
    storageEngine.updateUser(
      user.uid,
      {
        displayName: 'Wanda Maximoff (Lead)',
        role: 'project_lead',
        phone: '+1 (555) 999-8888',
      },
      adminAlex
    );

    const updatedPersona = authService.getPersona(user.uid);
    expect(updatedPersona?.displayName).toBe('Wanda Maximoff (Lead)');
    expect(updatedPersona?.role).toBe('project_lead');
    expect(updatedPersona?.roleLabel).toBe('Project Lead');
    expect(updatedPersona?.phone).toBe('+1 (555) 999-8888');
  });

  it('updates persona status when account is blocked and prevents persona switching', () => {
    const user = storageEngine.addUser(
      {
        uid: 'u-persona-block-1',
        displayName: 'Loki Laufeyson',
        email: 'loki@ojix.local',
        role: 'member',
      },
      adminAlex
    );

    // Block the user
    storageEngine.setUserStatus(user.uid, 'blocked', adminAlex);

    const persona = authService.getPersona(user.uid);
    expect(persona?.status).toBe('blocked');

    // Attempting to switch to blocked persona throws suspension error
    expect(() => authService.switchPersona(user.uid)).toThrow(/blocked by Workspace Admin/i);
  });
});
