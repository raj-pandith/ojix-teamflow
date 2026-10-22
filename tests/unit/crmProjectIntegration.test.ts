import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { handleApiRequest, getSharedSyncData, initializeSyncData } from '../../server/apiRouter';
import { authBackend } from '../../server/authBackend';
import { crmService } from '../../src/services/crmService';
import { storageEngine } from '../../src/services/storageEngine';
import { UserProfile } from '../../src/types/auth';
import { CrmRawProject } from '../../src/types/project';

interface MockResponseResult {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  json: () => any;
}

function dispatchMockRequest(options: {
  method?: string;
  url: string;
  headers?: Record<string, string>;
  body?: any;
}): Promise<MockResponseResult> {
  return new Promise((resolve) => {
    const req = new EventEmitter() as any;
    req.method = options.method || 'GET';
    req.url = options.url;
    const reqHeaders: Record<string, string> = {};
    if (options.headers) {
      for (const [k, v] of Object.entries(options.headers)) {
        reqHeaders[k.toLowerCase()] = v;
      }
    }
    req.headers = reqHeaders;
    req.socket = { remoteAddress: '127.0.0.1' };

    const resHeaders: Record<string, string> = {};
    let statusCode = 200;
    let resBody = '';

    const res = new EventEmitter() as any;
    res.statusCode = 200;
    res.setHeader = (name: string, value: string) => {
      resHeaders[name.toLowerCase()] = value;
    };
    res.getHeader = (name: string) => resHeaders[name.toLowerCase()];
    res.writeHead = (code: number, headers?: Record<string, string>) => {
      statusCode = code;
      if (headers) {
        for (const [k, v] of Object.entries(headers)) {
          resHeaders[k.toLowerCase()] = v;
        }
      }
    };
    res.write = (chunk: string | Buffer) => {
      resBody += chunk.toString();
    };
    res.end = (chunk?: string | Buffer) => {
      if (chunk) {
        resBody += chunk.toString();
      }
      resolve({
        statusCode: res.statusCode || statusCode,
        headers: resHeaders,
        body: resBody,
        json: () => {
          try {
            return JSON.parse(resBody);
          } catch {
            return null;
          }
        },
      });
    };

    handleApiRequest(req, res).then(handled => {
      if (!handled) {
        resolve({
          statusCode: 404,
          headers: {},
          body: 'Not Handled',
          json: () => null,
        });
      }
    });

    if (options.body) {
      req.emit('data', JSON.stringify(options.body));
    }
    req.emit('end');
  });
}

describe('OJIX ClientFlow CRM Gateway & Project Import Integration', () => {
  let adminToken: string;
  let memberToken: string;
  let adminUser: UserProfile;
  let memberUser: UserProfile;

  const mockCrmApiResponse = {
    success: true,
    message: 'Projects successfully fetched from OJIX ClientFlow CRM backend',
    sourceApp: 'OJIX ClientFlow (CRM)',
    targetApp: 'OJIX TeamFlow (Project OS)',
    apiKeyAuthenticated: true,
    totalCount: 2,
    filter: { stage: 'WON', workspaceId: 'all' },
    projects: [
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
        dueDate: '2026-10-19', // Intentionally invalid: due date before start date
        workspaceId: 'ws-primary-1',
        workspaceName: 'Acme Primary Workspace',
        createdAt: '2026-10-22T06:37:32.267Z',
        lastActivityAt: '2026-10-22T12:54:01.608Z',
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
        workspaceId: 'ws-primary-1',
        workspaceName: 'Acme Primary Workspace',
        createdAt: '2026-10-22T06:37:33.838Z',
        lastActivityAt: '2026-10-21T06:37:32.250Z',
      },
    ],
  };

  beforeEach(async () => {
    storageEngine.initialize(true);
    authBackend.reset();
    await initializeSyncData();
    const syncData = getSharedSyncData();
    syncData.projects = [];
    syncData.tasks = [];

    // Login admin
    const adminLogin = await authBackend.login('admin@ojix.local', 'Password123!', '127.0.0.1');
    adminToken = adminLogin.session.token;
    adminUser = storageEngine.getUser('user-admin-alex')!;

    // Login member
    const memberLogin = await authBackend.login('member@ojix.local', 'Password123!', '127.0.0.1');
    memberToken = memberLogin.session.token;
    memberUser = storageEngine.getUser('user-member-marcus')!;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Security, Authorization & API Gateway (/api/crm/projects)', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await dispatchMockRequest({
        method: 'GET',
        url: '/api/crm/projects',
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toMatch(/Authentication required/i);
    });

    it('rejects unauthorized users (members / viewers) with 403', async () => {
      const res = await dispatchMockRequest({
        method: 'GET',
        url: '/api/crm/projects',
        headers: { Authorization: `Bearer ${memberToken}` },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error).toMatch(/Only Workspace Admins are authorized/i);
    });

    it('allows Workspace Admin to fetch projects, securely attaching server API key', async () => {
      // Mock external fetch to CRM endpoint
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockCrmApiResponse,
      } as any);

      const res = await dispatchMockRequest({
        method: 'GET',
        url: '/api/crm/projects',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.success).toBe(true);
      expect(data.totalCount).toBe(2);
      expect(data.projects.length).toBe(2);

      // Verify the external fetch URL contained the CRM API key query parameter
      expect(fetchSpy).toHaveBeenCalled();
      const calledUrl = fetchSpy.mock.calls[0][0].toString();
      expect(calledUrl).toContain('stage=WON');
      expect(calledUrl).toContain('api_key=');

      // Verify the API key is NEVER leaked in the client response
      expect(JSON.stringify(data)).not.toContain('ojix-teamflow-clientflow-2026');
    });

    it('gracefully handles CRM external network failures and invalid JSON', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('CRM service unavailable: connection timed out'));

      const res = await dispatchMockRequest({
        method: 'GET',
        url: '/api/crm/projects',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(502);
      expect(res.json().error).toContain('CRM service unavailable');
    });

    it('handles non-200 responses from CRM API gracefully', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Invalid CRM API key' }),
      } as any);

      const res = await dispatchMockRequest({
        method: 'GET',
        url: '/api/crm/projects',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().error).toContain('HTTP status 401');
    });
  });

  describe('2. Date Validation & Duplicate Detection Annotations', () => {
    it('detects and flags invalid date ranges where dueDate is earlier than startDate', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockCrmApiResponse,
      } as any);

      const res = await dispatchMockRequest({
        method: 'GET',
        url: '/api/crm/projects',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const projects = res.json().projects;

      const projInvalid = projects.find((p: any) => p.id === 'proj-d-1');
      expect(projInvalid.isValidDateRange).toBe(false);
      expect(projInvalid.validationError).toContain('must be on or after start date');

      const projValid = projects.find((p: any) => p.id === 'proj-d-4');
      expect(projValid.isValidDateRange).toBe(true);
      expect(projValid.validationError).toBeUndefined();
    });

    it('detects previously imported projects and marks isAlreadyImported', async () => {
      // First, simulate proj-d-4 already existing in TeamFlow
      const syncData = getSharedSyncData();
      syncData.projects.push({
        id: 'proj-internal-existing',
        workspaceId: 'ws-ojix-main',
        name: 'Enterprise Single Sign-On Module',
        objective: 'Execute deliverables',
        ownerId: adminUser.uid,
        status: 'active',
        startDate: '2026-10-22',
        dueDate: '2026-10-26',
        memberIds: [adminUser.uid],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        crmMetadata: {
          source: 'clientflow_crm',
          externalId: 'proj-d-4',
          dealId: 'd-4',
          importedAt: new Date().toISOString(),
          importedByUid: adminUser.uid,
        },
      });

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockCrmApiResponse,
      } as any);

      const res = await dispatchMockRequest({
        method: 'GET',
        url: '/api/crm/projects',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const projects = res.json().projects;

      const projAlready = projects.find((p: any) => p.id === 'proj-d-4');
      expect(projAlready.isAlreadyImported).toBe(true);

      const projNew = projects.find((p: any) => p.id === 'proj-d-1');
      expect(projNew.isAlreadyImported).toBe(false);
    });
  });

  describe('3. Automated Project Creation & Import API (/api/crm/import)', () => {
    it('rejects import from non-admin users with 403', async () => {
      const res = await dispatchMockRequest({
        method: 'POST',
        url: '/api/crm/import',
        headers: { Authorization: `Bearer ${memberToken}` },
        body: { projects: [mockCrmApiResponse.projects[1]] },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error).toMatch(/Only Workspace Admins can import projects/i);
    });

    it('rejects import when body has no projects', async () => {
      const res = await dispatchMockRequest({
        method: 'POST',
        url: '/api/crm/import',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { projects: [] },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatch(/No projects provided/i);
    });

    it('imports valid projects, converts schema, and rejects invalid date range projects with detailed report', async () => {
      // Import both proj-d-1 (invalid dates) and proj-d-4 (valid)
      const res = await dispatchMockRequest({
        method: 'POST',
        url: '/api/crm/import',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { projects: mockCrmApiResponse.projects },
      });

      expect(res.statusCode).toBe(200);
      const report = res.json();
      expect(report.totalRequested).toBe(2);
      expect(report.importedCount).toBe(1);
      expect(report.failedCount).toBe(1);

      // Verify succeeded project details
      const imported = report.importedProjects[0];
      expect(imported.name).toBe('Enterprise Single Sign-On Module');
      expect(imported.crmMetadata.externalId).toBe('proj-d-4');
      expect(imported.crmMetadata.dealValue).toBe(35000);
      expect(imported.crmMetadata.clientName).toBe('Sophia Sterling');
      expect(imported.workspaceId).toBe('ws-ojix-main');
      expect(imported.id).toMatch(/^proj-/);

      // Verify failed project details
      const failed = report.failedProjects[0];
      expect(failed.id).toBe('proj-d-1');
      expect(failed.name).toBe('Autonomous Fleet Telemetry Suite');
      expect(failed.reason).toContain('Target completion date (2026-10-19) must be on or after start date (2026-10-22)');
    });

    it('prevents duplicate imports if the same project is submitted again', async () => {
      // First import
      await dispatchMockRequest({
        method: 'POST',
        url: '/api/crm/import',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { projects: [mockCrmApiResponse.projects[1]] },
      });

      // Second import of the identical project
      const res2 = await dispatchMockRequest({
        method: 'POST',
        url: '/api/crm/import',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { projects: [mockCrmApiResponse.projects[1]] },
      });

      expect(res2.statusCode).toBe(200);
      const report2 = res2.json();
      expect(report2.importedCount).toBe(0);
      expect(report2.failedCount).toBe(1);
      expect(report2.failedProjects[0].reason).toMatch(/already been imported/i);
    });
  });

  describe('4. Client-Side CRM Service & Storage Synchronization', () => {
    it('service fetchAvailableProjects enriches CRM data with local storage status', async () => {
      // Mock backend returning raw projects
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          projects: mockCrmApiResponse.projects,
        }),
      } as any);

      const result = await crmService.fetchAvailableProjects(adminUser);
      expect(result.success).toBe(true);
      expect(result.projects.length).toBe(2);

      const invalidProj = result.projects.find(p => p.id === 'proj-d-1')!;
      expect(invalidProj.isValidDateRange).toBe(false);

      const validProj = result.projects.find(p => p.id === 'proj-d-4')!;
      expect(validProj.isValidDateRange).toBe(true);
    });

    it('rejects fetch from non-admin user in client service', async () => {
      const result = await crmService.fetchAvailableProjects(memberUser);
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Only Workspace Admins can fetch projects/i);
    });

    it('service importProjects updates reactive storageEngine and notifies listeners', async () => {
      const validCrmProject: CrmRawProject = mockCrmApiResponse.projects[1];

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          totalRequested: 1,
          importedCount: 1,
          failedCount: 0,
          importedProjects: [
            {
              id: 'proj-new-sso',
              workspaceId: 'ws-ojix-main',
              name: validCrmProject.name,
              objective: validCrmProject.objective,
              ownerId: adminUser.uid,
              status: 'active',
              startDate: validCrmProject.startDate,
              dueDate: validCrmProject.dueDate,
              memberIds: [adminUser.uid],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              crmMetadata: {
                source: 'clientflow_crm',
                externalId: validCrmProject.id,
                dealId: validCrmProject.dealId,
                importedAt: new Date().toISOString(),
                importedByUid: adminUser.uid,
              },
            },
          ],
          failedProjects: [],
        }),
      } as any);

      let notifiedCount = 0;
      const unsubscribe = storageEngine.subscribe(() => {
        notifiedCount++;
      });

      const report = await crmService.importProjects([validCrmProject], adminUser);
      expect(report.importedCount).toBe(1);
      expect(report.failedCount).toBe(0);

      // Verify project is now queryable in storageEngine
      const imported = storageEngine.getProjects(adminUser).find(
        p => p.crmMetadata?.externalId === 'proj-d-4'
      );
      expect(imported).toBeDefined();
      expect(imported?.name).toBe('Enterprise Single Sign-On Module');
      expect(notifiedCount).toBeGreaterThan(0);

      unsubscribe();
    });

    it('falls back to direct ClientFlow CRM endpoint when backend gateway returns 404', async () => {
      let callCount = 0;
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
        callCount++;
        const urlStr = typeof input === 'string' ? input : input.url;
        if (urlStr.includes('/api/crm/projects')) {
          // Simulate 404 or failure on backend gateway
          return {
            ok: false,
            status: 404,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ error: 'Endpoint not found' }),
          } as any;
        }
        if (urlStr.includes('client-flow-5xb8.vercel.app')) {
          // Direct fallback to ClientFlow CRM endpoint succeeds
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => mockCrmApiResponse,
          } as any;
        }
        throw new Error('Unexpected URL: ' + urlStr);
      });

      const result = await crmService.fetchAvailableProjects(adminUser);
      expect(result.success).toBe(true);
      expect(result.projects.length).toBe(2);
      expect(result.projects[0].id).toBe('proj-d-1');
      expect(result.projects[1].id).toBe('proj-d-4');
      expect(callCount).toBe(2); // First backend, then direct CRM fallback
    });

    it('falls back to direct ClientFlow CRM endpoint when backend gateway throws network error', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
        const urlStr = typeof input === 'string' ? input : input.url;
        if (urlStr.includes('/api/crm/projects')) {
          throw new TypeError('Failed to fetch');
        }
        if (urlStr.includes('client-flow-5xb8.vercel.app')) {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => mockCrmApiResponse,
          } as any;
        }
        throw new Error('Unexpected URL: ' + urlStr);
      });

      const result = await crmService.fetchAvailableProjects(adminUser);
      expect(result.success).toBe(true);
      expect(result.projects.length).toBe(2);
      expect(result.projects[1].name).toBe('Enterprise Single Sign-On Module');
    });
  });
});

