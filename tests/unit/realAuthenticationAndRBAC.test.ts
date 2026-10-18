import { describe, it, expect, beforeEach } from 'vitest';
import { authBackend } from '../../server/authBackend';
import { storageEngine } from '../../src/services/storageEngine';
import { taskService } from '../../src/services/taskService';
import { UserProfile } from '../../src/types/auth';

describe('Real Authentication, Admin User Management & Server-Enforced RBAC', () => {
  let adminUser: UserProfile;
  let leadUser: UserProfile;
  let memberUser: UserProfile;
  let viewerUser: UserProfile;

  beforeEach(() => {
    storageEngine.initialize(true);
    adminUser = storageEngine.getUser('user-admin-alex')!;
    leadUser = storageEngine.getUser('user-lead-sarah')!;
    memberUser = storageEngine.getUser('user-member-marcus')!;
    viewerUser = storageEngine.getUser('user-viewer-elena')!;
  });

  // =========================================================================
  // 1. Initial Admin & Seed Users Provisioning
  // =========================================================================
  describe('1. Initial Admin & Seed Accounts Provisioning', () => {
    it('provisions the initial Workspace Admin with hashed password and active status', () => {
      const accounts = authBackend.getAccounts();
      const admin = accounts.find(a => a.email === 'admin@ojix.local');

      expect(admin).toBeDefined();
      expect(admin?.displayName).toBe('Alex Morgan');
      expect(admin?.role).toBe('workspace_admin');
      expect(admin?.status).toBe('active');
    });

    it('provisions all seed roles with proper role-based categorization', () => {
      const accounts = authBackend.getAccounts();
      const roles = accounts.map(a => a.role);

      expect(roles).toContain('workspace_admin');
      expect(roles).toContain('project_lead');
      expect(roles).toContain('member');
      expect(roles).toContain('viewer');
    });
  });

  // =========================================================================
  // 2. Authentication, Login, Password Verification & Rate Limiting
  // =========================================================================
  describe('2. Authentication & Session Management', () => {
    it('authenticates valid credentials and issues a secure session token', async () => {
      const { session, cookieHeader } = await authBackend.login('admin@ojix.local', 'Password123!');

      expect(session.token).toBeDefined();
      expect(session.token.length).toBeGreaterThanOrEqual(32);
      expect(session.user.email).toBe('admin@ojix.local');
      expect(session.user.role).toBe('workspace_admin');
      expect(cookieHeader).toContain('ojix_session=');
      expect(cookieHeader).toContain('HttpOnly');

      // Verify token resolves to user profile
      const user = authBackend.getSessionUser(session.token);
      expect(user).toBeDefined();
      expect(user?.uid).toBe(adminUser.uid);
    });

    it('rejects invalid password with generic error message', async () => {
      await expect(
        authBackend.login('admin@ojix.local', 'WrongPassword123!')
      ).rejects.toThrow('Invalid email or password.');
    });

    it('rejects non-existent email with generic error message to prevent enumeration', async () => {
      await expect(
        authBackend.login('ghost@nowhere.local', 'AnyPassword123!')
      ).rejects.toThrow('Invalid email or password.');
    });

    it('enforces brute-force rate limiting after repeated failed login attempts', async () => {
      const testIp = `rate-limit-test-${Date.now()}`;
      const targetEmail = 'admin@ojix.local';

      // 5 failed attempts
      for (let i = 0; i < 5; i++) {
        await expect(authBackend.login(targetEmail, 'BadPassword', testIp)).rejects.toThrow();
      }

      // 6th attempt should be blocked by rate limiter
      await expect(
        authBackend.login(targetEmail, 'Password123!', testIp)
      ).rejects.toThrow(/Too many failed login attempts/i);
    });

    it('invalidates access token and clears cookie upon logout', async () => {
      const { session } = await authBackend.login('lead@ojix.local', 'Password123!');
      const beforeLogout = authBackend.getSessionUser(session.token);
      expect(beforeLogout).toBeDefined();

      const clearCookie = authBackend.logout(session.token);
      expect(clearCookie).toContain('Max-Age=0');

      const afterLogout = authBackend.getSessionUser(session.token);
      expect(afterLogout).toBeNull();
    });
  });

  // =========================================================================
  // 3. Admin-Managed Invitations & Secure Account Activation
  // =========================================================================
  describe('3. Admin Invitation Flow & Password Setup', () => {
    it('Workspace Admin can generate a secure single-use activation invitation', async () => {
      const inviteEmail = `newdev-${Date.now()}@ojix-corp.com`;
      const result = await authBackend.inviteUser(
        {
          displayName: 'Jordan Miller',
          email: inviteEmail,
          role: 'member',
          phone: '+1 555 444 3322',
        },
        adminUser
      );

      expect(result.invitation).toBeDefined();
      expect(result.invitation.token).toBeDefined();
      expect(result.activationUrl).toContain('token=');
      expect(result.activationUrl).toContain(encodeURIComponent(inviteEmail));
      expect(result.user.status).toBe('pending_activation');
    });

    it('rejects invitation creation if caller is not a Workspace Admin', async () => {
      await expect(
        authBackend.inviteUser(
          {
            displayName: 'Unauthorized Invite',
            email: 'unauth@test.com',
            role: 'member',
          },
          leadUser
        )
      ).rejects.toThrow(/Only Workspace Admins can invite users/i);
    });

    it('rejects duplicate email invitations', async () => {
      await expect(
        authBackend.inviteUser(
          {
            displayName: 'Duplicate Admin',
            email: 'admin@ojix.local',
            role: 'member',
          },
          adminUser
        )
      ).rejects.toThrow(/already exists/i);
    });

    it('invited user can activate their account and set their password', async () => {
      const inviteEmail = `activate-${Date.now()}@ojix-corp.com`;
      const { invitation } = await authBackend.inviteUser(
        {
          displayName: 'Clara Oswald',
          email: inviteEmail,
          role: 'member',
        },
        adminUser
      );

      // Attempt login before activation should fail
      await expect(
        authBackend.login(inviteEmail, 'Password123!')
      ).rejects.toThrow(/Account pending activation/i);

      // Activate with strong password
      const activation = await authBackend.activateAccount({
        token: invitation.token,
        email: inviteEmail,
        password: 'SecureNewPassword2026!',
        confirmPassword: 'SecureNewPassword2026!',
      });

      expect(activation.success).toBe(true);
      expect(activation.user.status).toBe('active');

      // Now user can log in with new password
      const loginRes = await authBackend.login(inviteEmail, 'SecureNewPassword2026!');
      expect(loginRes.session.user.email).toBe(inviteEmail);
      expect(loginRes.session.user.status).toBe('active');
    });

    it('rejects activation when passwords do not match or are too weak', async () => {
      const inviteEmail = `weakpass-${Date.now()}@ojix-corp.com`;
      const { invitation } = await authBackend.inviteUser(
        {
          displayName: 'Weak Password User',
          email: inviteEmail,
          role: 'member',
        },
        adminUser
      );

      // Passwords do not match
      await expect(
        authBackend.activateAccount({
          token: invitation.token,
          password: 'Password123!',
          confirmPassword: 'MismatchPassword123!',
        })
      ).rejects.toThrow(/Passwords do not match/i);

      // Password too short (< 8 chars)
      await expect(
        authBackend.activateAccount({
          token: invitation.token,
          password: 'Pass1!',
          confirmPassword: 'Pass1!',
        })
      ).rejects.toThrow(/at least 8 characters/i);
    });

    it('prevents single-use token reuse', async () => {
      const inviteEmail = `singleuse-${Date.now()}@ojix-corp.com`;
      const { invitation } = await authBackend.inviteUser(
        {
          displayName: 'Single Use User',
          email: inviteEmail,
          role: 'member',
        },
        adminUser
      );

      // First activation succeeds
      await authBackend.activateAccount({
        token: invitation.token,
        password: 'ValidPassword123!',
        confirmPassword: 'ValidPassword123!',
      });

      // Second activation with same token must fail
      await expect(
        authBackend.activateAccount({
          token: invitation.token,
          password: 'AnotherPassword123!',
          confirmPassword: 'AnotherPassword123!',
        })
      ).rejects.toThrow(/already been used/i);
    });

    it('admin can resend invitation to generate a new active link', async () => {
      const inviteEmail = `resend-${Date.now()}@ojix-corp.com`;
      const { invitation: firstInvite } = await authBackend.inviteUser(
        {
          displayName: 'Resend Candidate',
          email: inviteEmail,
          role: 'viewer',
        },
        adminUser
      );

      const resent = await authBackend.resendInvitation(inviteEmail, adminUser);
      expect(resent.invitation.token).toBeDefined();
      expect(resent.invitation.token).not.toBe(firstInvite.token);

      // New token works for activation
      const act = await authBackend.activateAccount({
        token: resent.invitation.token,
        password: 'ValidPassword123!',
        confirmPassword: 'ValidPassword123!',
      });
      expect(act.success).toBe(true);
    });
  });

  // =========================================================================
  // 4. Role-Specific Authorization & Security Enforcement
  // =========================================================================
  describe('4. Role-Specific Access Control & Data Isolation', () => {
    it('Workspace Admin can update member roles', async () => {
      const updated = authBackend.updateUserRole(memberUser.uid, 'project_lead', adminUser);
      expect(updated.role).toBe('project_lead');
    });

    it('Non-admins cannot change roles or promote themselves', () => {
      expect(() => {
        authBackend.updateUserRole(memberUser.uid, 'workspace_admin', memberUser);
      }).toThrow(/Only Workspace Admins can modify member roles/i);
    });

    it('Admins cannot demote their own account (safety policy)', () => {
      expect(() => {
        authBackend.updateUserRole(adminUser.uid, 'member', adminUser);
      }).toThrow(/Workspace Admins cannot demote their own account/i);
    });

    it('Blocked users immediately lose session and cannot log in', async () => {
      // Login first
      const { session } = await authBackend.login('viewer@ojix.local', 'Password123!');
      expect(authBackend.getSessionUser(session.token)).toBeDefined();

      // Admin blocks user
      authBackend.updateUserStatus(viewerUser.uid, 'blocked', adminUser);

      // Existing session invalidated
      expect(authBackend.getSessionUser(session.token)).toBeNull();

      // Subsequent login rejected
      await expect(
        authBackend.login('viewer@ojix.local', 'Password123!')
      ).rejects.toThrow(/Account Suspended/i);

      // Restore active status
      authBackend.updateUserStatus(viewerUser.uid, 'active', adminUser);
    });

    it('Viewer role is strictly read-only: cannot create tasks', async () => {
      await expect(
        taskService.createTask(
          'proj-infra-01',
          {
            title: 'Viewer unauthorized task creation attempt',
            description: 'Should be rejected by RBAC',
            priority: 'medium',
            status: 'todo',
            assigneeId: null,
            dueDate: '2026-10-30',
          },
          viewerUser
        )
      ).rejects.toThrow(/Viewers cannot create tasks/i);
    });

    it('Member role cannot perform administrative operations', () => {
      expect(() => {
        storageEngine.addUser(
          {
            displayName: 'Illegal User Creation',
            email: 'illegal@ojix.com',
            role: 'member',
          },
          memberUser
        );
      }).toThrow(/Only Workspace Admins can add or invite new members/i);
    });

    it('Data Isolation: non-members cannot read unshared project data', () => {
      expect(() => {
        storageEngine.getProjectById('proj-secret-02', memberUser);
      }).toThrow(/Permission denied/i);

      // Admin has authorized oversight
      const adminProject = storageEngine.getProjectById('proj-secret-02', adminUser);
      expect(adminProject).toBeDefined();
    });

    it('Account Activation Status Sync: changes user from pending_activation to active in storageEngine', () => {
      const pendingUserUid = 'user-pending-test-123';
      const pendingEmail = 'pending-sync@ojix.local';

      // 1. Initially added as pending_activation
      storageEngine.addUser(
        {
          uid: pendingUserUid,
          displayName: 'Pending Test User',
          email: pendingEmail,
          role: 'member',
          status: 'pending_activation',
        },
        adminUser
      );

      const beforeSync = storageEngine.getUser(pendingUserUid);
      expect(beforeSync?.status).toBe('pending_activation');

      // 2. Server marks user as active upon activation/login
      storageEngine.syncAccountsWithServer([
        {
          uid: pendingUserUid,
          displayName: 'Pending Test User',
          email: pendingEmail,
          role: 'member',
          status: 'active',
          createdAt: beforeSync?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]);

      const afterSync = storageEngine.getUser(pendingUserUid);
      expect(afterSync?.status).toBe('active');

      // Also verify persona status is active
      const persona = storageEngine.getPersonas().find(p => p.uid === pendingUserUid);
      expect(persona?.status).toBe('active');
    });
  });
});

