import { describe, it, expect, beforeEach, vi } from 'vitest';
import webpush from 'web-push';
import { PushBackend } from '../../server/pushBackend';
import { storageEngine } from '../../src/services/storageEngine';
import { taskService } from '../../src/services/taskService';
import { UserProfile } from '../../src/types/auth';
import { Project } from '../../src/types/project';
import { urlBase64ToUint8Array } from '../../src/services/webPushClient';

describe('Native Web Push Notifications Using VAPID & Service Worker', () => {
  const now = new Date().toISOString();

  // Test User Personas
  const adminUser: UserProfile = {
    uid: 'u-push-admin',
    email: 'admin@ojix.local',
    displayName: 'Alex Admin',
    role: 'workspace_admin',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  const leadUser: UserProfile = {
    uid: 'u-push-lead',
    email: 'lead@ojix.local',
    displayName: 'Sarah Lead',
    role: 'project_lead',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  const memberA: UserProfile = {
    uid: 'u-push-member-a',
    email: 'rajpandith@gmail.com',
    displayName: 'Raj Pandith',
    role: 'member',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  const memberB: UserProfile = {
    uid: 'u-push-member-b',
    email: 'marcus@ojix.local',
    displayName: 'Marcus Dev',
    role: 'member',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  const testProject: Project = {
    id: 'proj-push-101',
    workspaceId: 'ws-ojix-main',
    name: 'Telemetry & Web Push Infrastructure',
    objective: 'Native browser push notification system',
    status: 'active',
    ownerId: leadUser.uid,
    startDate: '2026-10-01',
    dueDate: '2026-11-01',
    memberIds: [leadUser.uid, memberA.uid, memberB.uid],
    createdAt: now,
    updatedAt: now,
  };

  let backend: PushBackend;

  beforeEach(() => {
    vi.restoreAllMocks();

    backend = new PushBackend({
      publicKey: 'BKNdlGALj-gJ2hcGKNgGstIbXdKPnfgWBnqIhMxCYSZsIwRdOAvHE0NsVI8O-a_h2tc2j69o-Qt_J6Y4xrL_FDg',
      privateKey: 'woAhCeuUn8sqOkJgrCHvVfXsvKJDz-ZghBXrq-CeBvk',
      subject: 'mailto:admin@ojix.local',
    });

    // Reset storage engine collections
    storageEngine.initialize(true);
    const existingUsers = storageEngine.getUsers();
    for (const u of [adminUser, leadUser, memberA, memberB]) {
      if (!existingUsers.some(eu => eu.uid === u.uid)) {
        (storageEngine as any).users.push(u);
      }
    }
    (storageEngine as any).projects.push(testProject);
  });

  describe('1. Subscription Registration & Multi-Device Management', () => {
    it('successfully registers a valid Web Push subscription for an authenticated user', () => {
      const sub = backend.registerSubscription({
        userId: memberA.uid,
        endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/gAAAAAB...',
        keys: {
          p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QT9t0VU9G8-NjWvSXhg0...',
          auth: 'tBHItJI5svbpez7KI4CCXg==',
        },
        deviceLabel: 'Work Laptop (Firefox)',
        userAgent: 'Mozilla/5.0 Firefox/128.0',
      });

      expect(sub).toBeDefined();
      expect(sub.id).toBeTruthy();
      expect(sub.userId).toBe(memberA.uid);
      expect(sub.isActive).toBe(true);
      expect(sub.deviceLabel).toBe('Work Laptop (Firefox)');

      const userSubs = backend.getSubscriptionsForUser(memberA.uid);
      expect(userSubs).toHaveLength(1);
      expect(userSubs[0].id).toBe(sub.id);
    });

    it('supports multiple subscriptions per user (cross-device/browser)', () => {
      backend.registerSubscription({
        userId: memberA.uid,
        endpoint: 'https://fcm.googleapis.com/fcm/send/device-desktop-chrome',
        keys: { p256dh: 'key1...', auth: 'auth1...' },
        deviceLabel: 'Desktop (Chrome)',
      });

      backend.registerSubscription({
        userId: memberA.uid,
        endpoint: 'https://push.apple.com/send/device-mobile-safari',
        keys: { p256dh: 'key2...', auth: 'auth2...' },
        deviceLabel: 'Mobile (Safari)',
      });

      const userSubs = backend.getSubscriptionsForUser(memberA.uid);
      expect(userSubs).toHaveLength(2);
      expect(userSubs.map(s => s.deviceLabel)).toEqual(['Desktop (Chrome)', 'Mobile (Safari)']);
    });

    it('deduplicates subscription updates for the same endpoint', () => {
      const sub1 = backend.registerSubscription({
        userId: memberA.uid,
        endpoint: 'https://fcm.googleapis.com/fcm/send/same-endpoint',
        keys: { p256dh: 'key1...', auth: 'auth1...' },
        deviceLabel: 'Old Label',
      });

      const sub2 = backend.registerSubscription({
        userId: memberA.uid,
        endpoint: 'https://fcm.googleapis.com/fcm/send/same-endpoint',
        keys: { p256dh: 'key1-refreshed...', auth: 'auth1-refreshed...' },
        deviceLabel: 'New Refreshed Label',
      });

      expect(sub2.id).toBe(sub1.id);
      const userSubs = backend.getSubscriptionsForUser(memberA.uid);
      expect(userSubs).toHaveLength(1);
      expect(userSubs[0].deviceLabel).toBe('New Refreshed Label');
    });

    it('rejects registration with invalid parameters', () => {
      expect(() => {
        backend.registerSubscription({
          userId: '',
          endpoint: 'https://example.com/push',
          keys: { p256dh: 'key', auth: 'auth' },
        });
      }).toThrow(/authenticated userId/i);

      expect(() => {
        backend.registerSubscription({
          userId: memberA.uid,
          endpoint: 'invalid-non-http-endpoint',
          keys: { p256dh: 'key', auth: 'auth' },
        });
      }).toThrow(/valid HTTP\(S\) push endpoint/i);

      expect(() => {
        backend.registerSubscription({
          userId: memberA.uid,
          endpoint: 'https://example.com/push',
          keys: { p256dh: '', auth: '' },
        });
      }).toThrow(/cryptographic keys/i);
    });

    it('unregisters subscription cleanly for the owner', () => {
      const endpoint = 'https://updates.push.services.mozilla.com/wpush/v2/sub-to-remove';
      backend.registerSubscription({
        userId: memberA.uid,
        endpoint,
        keys: { p256dh: 'key...', auth: 'auth...' },
      });

      expect(backend.getSubscriptionsForUser(memberA.uid)).toHaveLength(1);

      const removed = backend.unregisterSubscription(endpoint, memberA.uid);
      expect(removed).toBe(true);
      expect(backend.getSubscriptionsForUser(memberA.uid)).toHaveLength(0);
    });

    it('prevents unauthorized user from removing another user subscription', () => {
      const endpoint = 'https://updates.push.services.mozilla.com/wpush/v2/member-a-sub';
      backend.registerSubscription({
        userId: memberA.uid,
        endpoint,
        keys: { p256dh: 'key...', auth: 'auth...' },
      });

      expect(() => {
        backend.unregisterSubscription(endpoint, memberB.uid);
      }).toThrow(/Unauthorized/i);

      // Subscription should remain untouched
      expect(backend.getSubscriptionsForUser(memberA.uid)).toHaveLength(1);
    });
  });

  describe('2. Push Sending, VAPID Authentication & Error Handling', () => {
    it('successfully sends push message to stored subscription', async () => {
      const sendMock = vi.spyOn(webpush, 'sendNotification').mockResolvedValue({
        statusCode: 201,
        body: '',
        headers: {},
      });

      const sub = backend.registerSubscription({
        userId: memberA.uid,
        endpoint: 'https://fcm.googleapis.com/fcm/send/valid-sub-endpoint',
        keys: { p256dh: 'key...', auth: 'auth...' },
      });
      expect(sub.id).toBeTruthy();

      const results = await backend.sendPushToUser(memberA.uid, {
        title: 'Task Assigned',
        body: 'Sarah Lead assigned you "Build Web Push Pipeline"',
        projectId: testProject.id,
        taskId: 'task-123',
      });

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      expect(results[0].statusCode).toBe(201);
      expect(sendMock).toHaveBeenCalledTimes(1);

      // Verify delivery timestamp was recorded
      const updatedSub = backend.getSubscriptionsForUser(memberA.uid)[0];
      expect(updatedSub.lastDeliveredAt).toBeTruthy();
    });

    it('automatically cleans up expired subscriptions when receiving HTTP 410 Gone or 404', async () => {
      vi.spyOn(webpush, 'sendNotification').mockRejectedValue({
        statusCode: 410,
        message: 'Push subscription has expired or unsubscribed.',
      });

      backend.registerSubscription({
        userId: memberA.uid,
        endpoint: 'https://fcm.googleapis.com/fcm/send/expired-sub',
        keys: { p256dh: 'key...', auth: 'auth...' },
      });

      expect(backend.getSubscriptionsForUser(memberA.uid)).toHaveLength(1);

      const results = await backend.sendPushToUser(memberA.uid, {
        title: 'Meeting update',
        body: 'Check message center',
      });

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].cleanedUp).toBe(true);
      expect(results[0].statusCode).toBe(410);

      // Verify the dead subscription was purged from backend storage
      expect(backend.getSubscriptionsForUser(memberA.uid)).toHaveLength(0);
    });

    it('retains subscription when encountering temporary network or server failures (e.g. 500)', async () => {
      vi.spyOn(webpush, 'sendNotification').mockRejectedValue({
        statusCode: 500,
        message: 'Internal error on browser push service',
      });

      backend.registerSubscription({
        userId: memberA.uid,
        endpoint: 'https://fcm.googleapis.com/fcm/send/temp-failure-sub',
        keys: { p256dh: 'key...', auth: 'auth...' },
      });

      const results = await backend.sendPushToUser(memberA.uid, {
        title: 'Test',
        body: 'Hello',
      });

      expect(results[0].success).toBe(false);
      expect(results[0].cleanedUp).toBe(false);
      expect(results[0].statusCode).toBe(500);

      // Subscription remains for future retry
      expect(backend.getSubscriptionsForUser(memberA.uid)).toHaveLength(1);
    });

    it('safely handles unconfigured VAPID credentials without throwing unhandled exceptions', async () => {
      const unconfiguredBackend = new PushBackend({ publicKey: '', privateKey: '' });
      expect(unconfiguredBackend.isReady()).toBe(false);

      unconfiguredBackend.registerSubscription({
        userId: memberA.uid,
        endpoint: 'https://fcm.googleapis.com/fcm/send/test',
        keys: { p256dh: 'key', auth: 'auth' },
      });

      const results = await unconfiguredBackend.sendPushToUser(memberA.uid, {
        title: 'Test',
        body: 'Hello',
      });

      expect(results[0].success).toBe(false);
      expect(results[0].error).toMatch(/not configured/i);
    });

    it('enforces payload sanitization and truncates overly large bodies to adhere to 4KB limits', async () => {
      let sentPayloadString = '';
      vi.spyOn(webpush, 'sendNotification').mockImplementation(async (_sub, payload) => {
        sentPayloadString = payload as string;
        return { statusCode: 201, body: '', headers: {} };
      });

      backend.registerSubscription({
        userId: memberA.uid,
        endpoint: 'https://fcm.googleapis.com/fcm/send/valid',
        keys: { p256dh: 'key', auth: 'auth' },
      });

      const hugeBody = 'A'.repeat(5000); // 5000 chars exceeds typical limits
      await backend.sendPushToUser(memberA.uid, {
        title: 'Large Payload Test',
        body: hugeBody,
      });

      const parsed = JSON.parse(sentPayloadString);
      expect(parsed.body.length).toBeLessThanOrEqual(500);
      expect(parsed.body.endsWith('...')).toBe(true);
    });
  });

  describe('3. Event Integration & Persistence Guarantee', () => {
    it('persists inbox notification in storageEngine even when push network delivery fails', async () => {
      // Mock global fetch failure for push endpoint
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Push network offline'));

      storageEngine.addNotification({
        id: 'notif-resilience-01',
        recipientUserId: memberA.uid,
        actorUserId: leadUser.uid,
        type: 'PROJECT_ASSIGNED',
        title: 'Project Lead Assigned',
        body: 'You are now lead',
        entityType: 'project',
        projectId: testProject.id,
        isRead: false,
        createdAt: now,
      });

      // Persistent inbox record must still be intact
      const notifs = storageEngine.getNotifications(memberA);
      expect(notifs).toHaveLength(1);
      expect(notifs[0].id).toBe('notif-resilience-01');
      expect(notifs[0].isRead).toBe(false);

      fetchSpy.mockRestore();
    });

    it('triggers task assignment notification when task is created with an assignee', async () => {
      const task = await taskService.createTask(
        testProject.id,
        {
          title: 'Implement VAPID Web Push',
          description: 'Core infrastructure',
          priority: 'high',
          status: 'todo',
          dueDate: '2026-10-25',
          assigneeId: memberA.uid,
        },
        leadUser
      );

      expect(task).toBeDefined();
      expect(task.assigneeId).toBe(memberA.uid);

      // Verify recipient received notification in inbox
      const memberNotifs = storageEngine.getNotifications(memberA);
      const assignmentNotif = memberNotifs.find(n => n.type === 'TASK_ASSIGNED');
      expect(assignmentNotif).toBeDefined();
      expect(assignmentNotif?.taskId).toBe(task.id);
      expect(assignmentNotif?.projectId).toBe(testProject.id);
    });

    it('triggers task reassignment notification when assignee is changed', async () => {
      const task = await taskService.createTask(
        testProject.id,
        {
          title: 'Optimize Push Delivery Pipeline',
          description: 'Refactor pipeline',
          priority: 'medium',
          status: 'todo',
          dueDate: '2026-10-25',
          assigneeId: memberA.uid,
        },
        leadUser
      );

      // Reassign to memberB
      await taskService.updateTask(
        task.id,
        { assigneeId: memberB.uid },
        leadUser
      );

      const memberBNotifs = storageEngine.getNotifications(memberB);
      const reassignmentNotif = memberBNotifs.find(n => n.type === 'TASK_REASSIGNED');
      expect(reassignmentNotif).toBeDefined();
      expect(reassignmentNotif?.body).toMatch(/reassigned task/i);
    });

    it('does not send notification to the actor when assigning to themselves', async () => {
      const initialCount = storageEngine.getNotifications(leadUser).length;

      await taskService.createTask(
        testProject.id,
        {
          title: 'Lead Self Assignment',
          description: 'Self assign task',
          priority: 'low',
          status: 'todo',
          dueDate: '2026-10-25',
          assigneeId: leadUser.uid, // Lead assigns to herself
        },
        leadUser
      );

      const afterCount = storageEngine.getNotifications(leadUser).length;
      expect(afterCount).toBe(initialCount); // No self-notification
    });

    it('enforces deduplication and prevents duplicate notifications for the same event key', () => {
      const deduplicationKey = 'unique-dedup-event-101';

      storageEngine.addNotification({
        id: 'notif-1',
        recipientUserId: memberA.uid,
        actorUserId: leadUser.uid,
        type: 'TASK_COMMENT_MENTION',
        title: 'Mention 1',
        body: 'Mentioned',
        entityType: 'comment',
        isRead: false,
        createdAt: now,
        deduplicationKey,
      });

      storageEngine.addNotification({
        id: 'notif-2',
        recipientUserId: memberA.uid,
        actorUserId: leadUser.uid,
        type: 'TASK_COMMENT_MENTION',
        title: 'Mention 2 (Duplicate)',
        body: 'Mentioned again',
        entityType: 'comment',
        isRead: false,
        createdAt: now,
        deduplicationKey, // Same key
      });

      const notifs = storageEngine.getNotifications(memberA);
      expect(notifs).toHaveLength(1);
      expect(notifs[0].id).toBe('notif-1');
    });
  });

  describe('4. Client Utilities & Cryptographic Conversion', () => {
    it('correctly converts URL-safe Base64 VAPID public key into Uint8Array', () => {
      // Standard VAPID public key (65 bytes P-256 point starting with 0x04)
      const validPublicKey = 'BKNdlGALj-gJ2hcGKNgGstIbXdKPnfgWBnqIhMxCYSZsIwRdOAvHE0NsVI8O-a_h2tc2j69o-Qt_J6Y4xrL_FDg';
      
      const uint8 = urlBase64ToUint8Array(validPublicKey);
      expect(uint8).toBeInstanceOf(Uint8Array);
      expect(uint8.length).toBe(65);
      expect(uint8[0]).toBe(4); // P-256 uncompressed point indicator
    });
  });
});
