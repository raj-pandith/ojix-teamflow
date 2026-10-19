import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  isValidUrl,
  normalizeUrl,
  getDomainFromUrl,
  formatUrlTitle,
  extractUrls,
  tokenizeTextWithUrlsAndMentions,
} from '../../src/domain/linkUtils';
import { LinkifiedText } from '../../src/components/common/LinkifiedText';
import { taskService } from '../../src/services/taskService';
import { storageEngine } from '../../src/services/storageEngine';
import { auditService } from '../../src/services/auditService';
import { UserProfile } from '../../src/types/auth';

describe('Link Detection, Validation & Clickable Visiting', () => {
  describe('1. linkUtils domain functions', () => {
    it('validates http, https, and www URLs while rejecting invalid strings', () => {
      expect(isValidUrl('https://github.com/facebook/react')).toBe(true);
      expect(isValidUrl('http://localhost:3000')).toBe(true);
      expect(isValidUrl('www.google.com')).toBe(true);
      expect(isValidUrl('https://docs.google.com/document/d/123/edit#heading=h.abc')).toBe(true);

      // Invalid / non-web URLs
      expect(isValidUrl('')).toBe(false);
      expect(isValidUrl('just some regular notes')).toBe(false);
      expect(isValidUrl('hello world')).toBe(false);
    });

    it('rejects dangerous injection schemes like javascript: and data:', () => {
      expect(isValidUrl('javascript:alert(document.cookie)')).toBe(false);
      expect(isValidUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
      expect(isValidUrl('vbscript:msgbox(1)')).toBe(false);
    });

    it('normalizes URLs so they always have https:// or http:// scheme for safe <a> href', () => {
      expect(normalizeUrl('https://github.com')).toBe('https://github.com');
      expect(normalizeUrl('http://mytest.org')).toBe('http://mytest.org');
      expect(normalizeUrl('www.figma.com/file/123')).toBe('https://www.figma.com/file/123');
      expect(normalizeUrl('  https://apple.com  ')).toBe('https://apple.com');
    });

    it('extracts clean domain names for badge display', () => {
      expect(getDomainFromUrl('https://www.github.com/facebook/react')).toBe('github.com');
      expect(getDomainFromUrl('https://figma.com/design/abc')).toBe('figma.com');
      expect(getDomainFromUrl('www.notion.so/workspace/page')).toBe('notion.so');
    });

    it('formats URL titles when custom title is omitted', () => {
      expect(formatUrlTitle('https://github.com/facebook/react')).toBe('github.com / react');
      expect(formatUrlTitle('https://docs.google.com', 'PRD Document')).toBe('PRD Document');
      expect(formatUrlTitle('www.google.com')).toBe('google.com');
    });

    it('extracts multiple distinct URLs from multiline pasted text and strips trailing punctuation', () => {
      const text = `
        Here is the design file: https://figma.com/file/xyz.
        Also check the pull request at https://github.com/org/repo/pull/42,
        and live demo at www.ojix.dev!
      `;
      const urls = extractUrls(text);
      expect(urls).toEqual([
        'https://figma.com/file/xyz',
        'https://github.com/org/repo/pull/42',
        'www.ojix.dev',
      ]);
    });

    it('tokenizes text into text, URLs, newlines, and @mentions', () => {
      const users = [
        { uid: 'u1', displayName: 'Sarah Chen', email: 'sarah@example.com' },
        { uid: 'u2', displayName: 'Alex Rivera', email: 'alex@example.com' },
      ];
      const text = 'Hello @Sarah Chen check https://github.com/ojix/teamflow for updates.\nThanks!';
      const tokens = tokenizeTextWithUrlsAndMentions(text, users);

      expect(tokens).toEqual([
        { type: 'text', value: 'Hello ' },
        {
          type: 'mention',
          value: '@Sarah Chen',
          displayName: 'Sarah Chen',
          user: users[0],
        },
        { type: 'text', value: ' check ' },
        {
          type: 'url',
          value: 'https://github.com/ojix/teamflow',
          href: 'https://github.com/ojix/teamflow',
          domain: 'github.com',
        },
        { type: 'text', value: ' for updates.' },
        { type: 'newline' },
        { type: 'text', value: 'Thanks!' },
      ]);
    });
  });

  describe('2. LinkifiedText Component Rendering', () => {
    it('renders pasted link as a clickable anchor with target="_blank" and rel="noopener noreferrer"', () => {
      const { container } = render(
        <LinkifiedText text="Please review https://github.com/facebook/react before deploy." />
      );

      const link = screen.getByRole('link', { name: /https:\/\/github.com\/facebook\/react/i });
      expect(link).toBeDefined();
      expect(link.getAttribute('href')).toBe('https://github.com/facebook/react');
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
      expect(link.className).toContain('clickable-web-link');

      // The text before and after should be preserved
      expect(container.textContent).toContain('Please review');
      expect(container.textContent).toContain('before deploy.');
    });

    it('prepends https:// when user pastes a www URL so it visits external site properly', () => {
      render(<LinkifiedText text="Visit www.ojix-app.com for documentation." />);

      const link = screen.getByRole('link', { name: /www.ojix-app.com/i });
      expect(link).toBeDefined();
      expect(link.getAttribute('href')).toBe('https://www.ojix-app.com');
      expect(link.getAttribute('target')).toBe('_blank');
    });

    it('renders both @mentions and clickable links together in comments or messages', () => {
      const users = [{ uid: 'u1', displayName: 'Sarah Chen', email: 'sarah@example.com' }];
      render(
        <LinkifiedText
          text="Hey @Sarah Chen here is the prototype: https://figma.com/@design/app"
          users={users}
        />
      );

      // Verify mention pill is rendered
      expect(screen.getByText('Sarah Chen')).toBeDefined();

      // Verify clickable link is rendered
      const link = screen.getByRole('link', { name: /https:\/\/figma.com\/@design\/app/i });
      expect(link).toBeDefined();
      expect(link.getAttribute('href')).toBe('https://figma.com/@design/app');
      expect(link.getAttribute('target')).toBe('_blank');
    });

    it('applies link-inverted styling when isCurrentSender is true for chat bubbles', () => {
      render(
        <LinkifiedText
          text="Check https://example.com"
          isCurrentSender={true}
        />
      );

      const link = screen.getByRole('link');
      expect(link.className).toContain('link-inverted');
    });
  });

  describe('3. Task Service Link Attachment and Management', () => {
    let adminUser: UserProfile;
    let viewerUser: UserProfile;
    let memberUser: UserProfile;
    let taskId: string;

    beforeEach(() => {
      adminUser = {
        uid: 'user-admin-1',
        email: 'admin@ojix.local',
        displayName: 'Admin User',
        role: 'workspace_admin',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      memberUser = {
        uid: 'user-member-1',
        email: 'member@ojix.local',
        displayName: 'Dev Member',
        role: 'member',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      viewerUser = {
        uid: 'user-viewer-1',
        email: 'viewer@ojix.local',
        displayName: 'ReadOnly Viewer',
        role: 'viewer',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Get existing task or create one
      const accessibleTasks = storageEngine.getAllAccessibleTasks(adminUser);
      if (accessibleTasks.length > 0) {
        taskId = accessibleTasks[0].id;
      }
    });

    it('allows attaching links to tasks with domain, URL, and audit trail', async () => {
      if (!taskId) return;

      const url = 'https://github.com/facebook/react/pull/999';
      const updated = await taskService.addTaskLink(
        taskId,
        url,
        'Frontend PR',
        adminUser
      );

      expect(updated.links).toBeDefined();
      const attached = updated.links?.find(l => l.url === url);
      expect(attached).toBeDefined();
      expect(attached?.title).toBe('Frontend PR');
      expect(attached?.addedByName).toBe(adminUser.displayName);

      // Verify persisted in storage
      const fetched = taskService.getTaskById(taskId, adminUser);
      expect(fetched?.links?.some(l => l.url === url)).toBe(true);

      // Verify audit activity logged
      const logs = auditService.getLogs(taskId, adminUser);
      expect(logs.some(l => l.commentText?.includes('attached link: "Frontend PR"'))).toBe(true);
    });

    it('allows removing attached links from a task and logs audit entry', async () => {
      if (!taskId) return;

      const url = 'https://docs.google.com/document/d/xyz';
      const taskWithLink = await taskService.addTaskLink(
        taskId,
        url,
        'Spec Document',
        adminUser
      );

      const added = taskWithLink.links?.find(l => l.url === url);
      expect(added).toBeDefined();

      if (added) {
        const afterRemove = await taskService.removeTaskLink(taskId, added.id, adminUser);
        expect(afterRemove.links?.some(l => l.id === added.id)).toBe(false);

        // Verify audit log
        const logs = auditService.getLogs(taskId, adminUser);
        expect(logs.some(l => l.commentText?.includes('removed attached link "Spec Document"'))).toBe(true);
      }
    });

    it('prevents viewers and blocked accounts from attaching links', async () => {
      if (!taskId) return;

      await expect(
        taskService.addTaskLink(taskId, 'https://example.com', 'Test', viewerUser)
      ).rejects.toThrow(/Permission denied: Viewers have read-only access/i);

      const blockedUser: UserProfile = {
        ...memberUser,
        status: 'blocked',
      };

      await expect(
        taskService.addTaskLink(taskId, 'https://example.com', 'Test', blockedUser)
      ).rejects.toThrow(/Permission denied: Your workspace account is blocked/i);
    });
  });
});
