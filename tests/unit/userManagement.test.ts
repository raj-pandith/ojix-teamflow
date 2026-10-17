import { describe, it, expect, beforeEach } from 'vitest';
import { storageEngine } from '../../src/services/storageEngine';
import { taskService } from '../../src/services/taskService';
import { authService } from '../../src/services/authService';
import { auditService } from '../../src/services/auditService';
import { UserProfile } from '../../src/types/auth';

describe('User Management, Team Membership & Assignment Validation', () => {
  let adminUser: UserProfile;
  let leadUser: UserProfile;
  let otherLeadUser: UserProfile;
  let memberUser: UserProfile;
  let viewerUser: UserProfile;

  beforeEach(() => {
    storageEngine.initialize(true);
    adminUser = storageEngine.getUser('user-admin-alex')!;
    leadUser = storageEngine.getUser('user-lead-sarah')!;
    memberUser = storageEngine.getUser('user-member-marcus')!;
    viewerUser = storageEngine.getUser('user-viewer-elena')!;

    // Add a second project lead who is initially NOT in proj-infra-01's team
    otherLeadUser = storageEngine.addUser(
      {
        displayName: 'David Chen',
        email: 'david.chen@ojix-corp.internal',
        role: 'project_lead',
        phone: '+1 (555) 333-4444',
      },
      adminUser
    );
  });

  // ==========================================
  // 1. WORKSPACE ADMIN — USER MANAGEMENT
  // ==========================================
  describe('Workspace Admin — User Management', () => {
    it('Admin can successfully create a new workspace user with valid details', () => {
      const newUser = storageEngine.addUser(
        {
          displayName: 'Priya Sharma',
          email: 'priya.sharma@ojix-corp.internal',
          role: 'member',
          phone: '+1-555-898-1122',
        },
        adminUser
      );

      expect(newUser.uid).toBeDefined();
      expect(newUser.displayName).toBe('Priya Sharma');
      expect(newUser.email).toBe('priya.sharma@ojix-corp.internal');
      expect(newUser.role).toBe('member');
      expect(newUser.status).toBe('active');
      expect(newUser.phone).toBe('+1-555-898-1122');

      const fetched = storageEngine.getUser(newUser.uid);
      expect(fetched).toBeDefined();
      expect(fetched?.displayName).toBe('Priya Sharma');
    });

    it('Rejects user creation if email already exists (duplicate prevention)', () => {
      expect(() => {
        storageEngine.addUser(
          {
            displayName: 'Duplicate Elena',
            email: 'viewer@ojix.local', // Elena's email
            role: 'viewer',
          },
          adminUser
        );
      }).toThrow(/already exists/i);
    });

    it('Rejects user creation if required fields are missing or invalid', () => {
      expect(() => {
        storageEngine.addUser(
          {
            displayName: '   ',
            email: 'valid@ojix.com',
            role: 'member',
          },
          adminUser
        );
      }).toThrow(/full name must be at least 2 characters/i);

      expect(() => {
        storageEngine.addUser(
          {
            displayName: 'Valid Name',
            email: 'invalid-email-address',
            role: 'member',
          },
          adminUser
        );
      }).toThrow(/valid email address/i);
    });

    it('Non-admin users cannot create workspace users', () => {
      expect(() => {
        storageEngine.addUser(
          {
            displayName: 'Sneaky User',
            email: 'sneaky@ojix.com',
            role: 'member',
          },
          leadUser
        );
      }).toThrow(/Permission denied: Only Workspace Admins/i);

      expect(() => {
        storageEngine.addUser(
          {
            displayName: 'Sneaky Member',
            email: 'member@ojix.com',
            role: 'member',
          },
          memberUser
        );
      }).toThrow(/Permission denied: Only Workspace Admins/i);
    });

    it('Admin can update user name, email, phone, and role', () => {
      const updated = storageEngine.updateUser(
        memberUser.uid,
        {
          displayName: 'Marcus Vance Senior',
          phone: '+1-555-999-0000',
          role: 'project_lead',
        },
        adminUser
      );

      expect(updated.displayName).toBe('Marcus Vance Senior');
      expect(updated.phone).toBe('+1-555-999-0000');
      expect(updated.role).toBe('project_lead');
    });

    it('Admin can block and unblock user accounts', () => {
      // Block Marcus
      const blocked = storageEngine.setUserStatus(memberUser.uid, 'blocked', adminUser);
      expect(blocked.status).toBe('blocked');

      // Unblock Marcus
      const unblocked = storageEngine.setUserStatus(memberUser.uid, 'active', adminUser);
      expect(unblocked.status).toBe('active');
    });

    it('Admin cannot block or terminate their own account', () => {
      expect(() => {
        storageEngine.setUserStatus(adminUser.uid, 'blocked', adminUser);
      }).toThrow(/cannot block or terminate/i);
    });

    it('Admin can terminate a user account, revoking access while preserving record', () => {
      const terminated = storageEngine.terminateUser(viewerUser.uid, adminUser);
      expect(terminated.status).toBe('terminated');

      // User record still exists in system for auditing
      const fetched = storageEngine.getUser(viewerUser.uid);
      expect(fetched).toBeDefined();
      expect(fetched?.status).toBe('terminated');
    });

    it('Logs sensitive user management actions to the audit log', () => {
      storageEngine.setUserStatus(memberUser.uid, 'blocked', adminUser);

      const logs = storageEngine.getUserManagementLogs();
      const blockLog = logs.find(l => l.action === 'user_blocked' && l.commentText?.includes('Marcus Vance'));
      expect(blockLog).toBeDefined();
      expect(blockLog?.userId).toBe(adminUser.uid);
    });
  });

  // ==========================================
  // 2. ACCOUNT ACCESS REVOCATION
  // ==========================================
  describe('Account Access Revocation', () => {
    it('Blocked or terminated user cannot authenticate or switch persona', () => {
      storageEngine.setUserStatus(memberUser.uid, 'blocked', adminUser);

      expect(() => authService.switchPersona(memberUser.uid)).toThrow(/blocked by Workspace Admin/i);

      storageEngine.terminateUser(memberUser.uid, adminUser);
      expect(() => authService.switchPersona(memberUser.uid)).toThrow(/permanently terminated/i);
    });

    it('Blocked or terminated user cannot perform task mutations', async () => {
      storageEngine.setUserStatus(memberUser.uid, 'blocked', adminUser);
      const updatedMarcus = storageEngine.getUser(memberUser.uid)!;

      await expect(
        taskService.createTask(
          'proj-infra-01',
          {
            title: 'Blocked User Action',
            description: 'Testing blocked user rejection',
            priority: 'medium',
            status: 'todo',
            assigneeId: null,
            dueDate: '2026-10-30',
          },
          updatedMarcus
        )
      ).rejects.toThrow(/Permission denied: Your workspace account is blocked/i);
    });
  });

  // ==========================================
  // 3. PROJECT LEAD — CREATE TEAM / MANAGE TEAM
  // ==========================================
  describe('Project Lead — Create Team / Manage Team', () => {
    it('Project Lead can add an eligible active workspace user to their project team', () => {
      // proj-infra-01 is owned by Sarah (user-lead-sarah)
      // David Chen (otherLeadUser) is currently NOT in proj-infra-01
      const initialProject = storageEngine.getProjectById('proj-infra-01', leadUser)!;
      expect(initialProject.memberIds).not.toContain(otherLeadUser.uid);

      const updatedProject = storageEngine.addTeamMember('proj-infra-01', otherLeadUser.uid, leadUser);
      expect(updatedProject.memberIds).toContain(otherLeadUser.uid);
    });

    it('Cannot add blocked or terminated users to a project team', () => {
      storageEngine.setUserStatus(viewerUser.uid, 'blocked', adminUser);

      expect(() => {
        storageEngine.addTeamMember('proj-infra-01', viewerUser.uid, leadUser);
      }).toThrow(/Cannot add user.*Account is blocked/i);
    });

    it('Cannot add duplicate members to a project team', () => {
      // Marcus is already in proj-infra-01
      expect(() => {
        storageEngine.addTeamMember('proj-infra-01', memberUser.uid, leadUser);
      }).toThrow(/already a member of this project team/i);
    });

    it('Project Lead cannot manage team for a project they do not own or manage', () => {
      // proj-infra-01 is owned by Sarah. David Chen is NOT owner and not in memberIds.
      expect(() => {
        storageEngine.addTeamMember('proj-infra-01', viewerUser.uid, otherLeadUser);
      }).toThrow(/Permission denied/i);
    });

    it('Project Lead can remove a member from their project team', () => {
      // Remove Marcus from proj-infra-01
      const updatedProject = storageEngine.removeTeamMember('proj-infra-01', memberUser.uid, leadUser);
      expect(updatedProject.memberIds).not.toContain(memberUser.uid);

      // Marcus still exists in workspace
      expect(storageEngine.getUser(memberUser.uid)).toBeDefined();
    });

    it('Cannot remove project owner from their own project team', () => {
      expect(() => {
        storageEngine.removeTeamMember('proj-infra-01', leadUser.uid, leadUser);
      }).toThrow(/Project owner cannot remove themselves/i);
    });

    it('Project Lead cannot remove a Workspace Admin from their project team', () => {
      expect(() => {
        storageEngine.removeTeamMember('proj-infra-01', adminUser.uid, leadUser);
      }).toThrow(/Project Leads cannot remove a Workspace Admin/i);
    });

    it('Workspace Admin cannot remove themselves from the project team', () => {
      expect(() => {
        storageEngine.removeTeamMember('proj-infra-01', adminUser.uid, adminUser);
      }).toThrow(/Workspace Admins cannot remove themselves/i);
    });
  });

  // ==========================================
  // 4. MANDATORY TEAM MEMBERSHIP FOR TASK ASSIGNMENT
  // ==========================================
  describe('Mandatory Team Membership for Task Assignment', () => {
    it('Task creation rejects assignment to a workspace user who is NOT in the project team', async () => {
      // David Chen (otherLeadUser) is NOT a member of proj-infra-01
      const project = storageEngine.getProjectById('proj-infra-01', leadUser)!;
      expect(project.memberIds).not.toContain(otherLeadUser.uid);

      await expect(
        taskService.createTask(
          'proj-infra-01',
          {
            title: 'Task Assigned to Non-Member',
            description: 'Should be strictly rejected',
            priority: 'high',
            status: 'todo',
            assigneeId: otherLeadUser.uid,
            dueDate: '2026-10-30',
          },
          leadUser
        )
      ).rejects.toThrow(/is not an active member of this project team/i);
    });

    it('Task update/reassignment rejects assignment to a user who is NOT in the project team', async () => {
      // task-101 is in proj-infra-01
      await expect(
        taskService.updateTask(
          'task-101',
          {
            assigneeId: otherLeadUser.uid,
          },
          leadUser
        )
      ).rejects.toThrow(/is not an active member of this project team/i);
    });

    it('Direct database/storage saveTask rejects assignment to non-team members', () => {
      const task = storageEngine.getTaskById('task-101', leadUser)!;
      const illegalTask = {
        ...task,
        id: 'new-direct-task-test',
        assigneeId: otherLeadUser.uid,
      };

      expect(() => {
        storageEngine.saveTask(illegalTask, leadUser);
      }).toThrow(/is not an active member of this project team/i);
    });

    it('Task assignment succeeds once the Project Lead adds the user to the project team', async () => {
      // 1. Add David Chen to the project team
      storageEngine.addTeamMember('proj-infra-01', otherLeadUser.uid, leadUser);

      // 2. Now assigning a task to David Chen succeeds!
      const createdTask = await taskService.createTask(
        'proj-infra-01',
        {
          title: 'Task for newly onboarded team member',
          description: 'Valid now that user is in team',
          priority: 'medium',
          status: 'todo',
          assigneeId: otherLeadUser.uid,
          dueDate: '2026-10-30',
        },
        leadUser
      );

      expect(createdTask.assigneeId).toBe(otherLeadUser.uid);

      // 3. Reassigning another task to David Chen also succeeds
      const updated = await taskService.updateTask(
        'task-101',
        {
          assigneeId: otherLeadUser.uid,
        },
        leadUser
      );
      expect(updated.assigneeId).toBe(otherLeadUser.uid);
    });

    it('Removing a team member preserves their existing task assignments and task history', async () => {
      // Ensure task-104 has comments/logs
      await auditService.addComment('task-104', 'proj-infra-01', 'Contribution note before team change', memberUser);

      const initialTask = storageEngine.getTaskById('task-104', leadUser)!;
      expect(initialTask.assigneeId).toBe(memberUser.uid);

      // Remove Marcus from proj-infra-01
      storageEngine.removeTeamMember('proj-infra-01', memberUser.uid, leadUser);

      // Verify the project team no longer contains Marcus
      const project = storageEngine.getProjectById('proj-infra-01', leadUser)!;
      expect(project.memberIds).not.toContain(memberUser.uid);

      // Verify Marcus's existing task still retains his ID and historical records intact
      const preservedTask = storageEngine.getTaskById('task-104', leadUser)!;
      expect(preservedTask.assigneeId).toBe(memberUser.uid);

      // Verify historical activity logs are preserved
      const logs = storageEngine.getTaskLogs('task-104', leadUser);
      expect(logs.length).toBeGreaterThan(0);

      // But trying to assign NEW tasks to Marcus in this project is now rejected:
      await expect(
        taskService.createTask(
          'proj-infra-01',
          {
            title: 'New Task for Ex-Member',
            description: 'Testing ex-member assignment rejection',
            priority: 'medium',
            status: 'todo',
            assigneeId: memberUser.uid,
            dueDate: '2026-10-30',
          },
          leadUser
        )
      ).rejects.toThrow(/is not an active member of this project team/i);

      // Reassigning an existing task to an active project team member (e.g. Sarah) succeeds:
      const reassigned = await taskService.updateTask(
        'task-104',
        {
          assigneeId: leadUser.uid,
        },
        leadUser
      );
      expect(reassigned.assigneeId).toBe(leadUser.uid);
    });

    it('Cannot assign task to a blocked or terminated user even if they were in the team', async () => {
      // Marcus is in proj-infra-01, but Admin blocks his account
      storageEngine.setUserStatus(memberUser.uid, 'blocked', adminUser);

      await expect(
        taskService.createTask(
          'proj-infra-01',
          {
            title: 'Task for blocked member',
            description: 'Testing blocked member assignment rejection',
            priority: 'low',
            status: 'todo',
            assigneeId: memberUser.uid,
            dueDate: '2026-10-30',
          },
          leadUser
        )
      ).rejects.toThrow(/User account is blocked/i);
    });
  });
});
