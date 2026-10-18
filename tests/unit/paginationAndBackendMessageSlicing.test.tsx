import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Pagination } from '../../src/components/common/Pagination';
import { storageEngine } from '../../src/services/storageEngine';
import { UserProfile } from '../../src/types/auth';

describe('Pagination Component & Backend Message Slicing', () => {
  describe('Pagination Component', () => {
    it('renders accurate range and total item count for first page', () => {
      render(
        <Pagination
          currentPage={1}
          totalItems={45}
          pageSize={10}
          onPageChange={vi.fn()}
          itemLabel="members"
        />
      );

      expect(screen.getByText(/Showing/i)).toBeDefined();
      expect(screen.getByText('1–10')).toBeDefined();
      expect(screen.getByText('45')).toBeDefined();
      expect(screen.getByText(/members/i)).toBeDefined();
    });

    it('renders accurate range for subsequent page and clamps end item to total', () => {
      render(
        <Pagination
          currentPage={5}
          totalItems={45}
          pageSize={10}
          onPageChange={vi.fn()}
          itemLabel="notifications"
        />
      );

      // Page 5 with pageSize 10 on 45 items => 41–45 of 45
      expect(screen.getByText('41–45')).toBeDefined();
      expect(screen.getByText('45')).toBeDefined();
    });

    it('disables previous button on first page and enables on second page', () => {
      const handlePageChange = vi.fn();
      const { rerender } = render(
        <Pagination
          currentPage={1}
          totalItems={30}
          pageSize={10}
          onPageChange={handlePageChange}
        />
      );

      const prevBtn = screen.getByTitle('Previous page');
      expect((prevBtn as HTMLButtonElement).disabled).toBe(true);

      rerender(
        <Pagination
          currentPage={2}
          totalItems={30}
          pageSize={10}
          onPageChange={handlePageChange}
        />
      );

      expect((prevBtn as HTMLButtonElement).disabled).toBe(false);
      fireEvent.click(prevBtn);
      expect(handlePageChange).toHaveBeenCalledWith(1);
    });

    it('disables next button on last page', () => {
      const handlePageChange = vi.fn();
      render(
        <Pagination
          currentPage={3}
          totalItems={30}
          pageSize={10}
          onPageChange={handlePageChange}
        />
      );

      const nextBtn = screen.getByTitle('Next page');
      expect((nextBtn as HTMLButtonElement).disabled).toBe(true);
    });

    it('calls onPageSizeChange when per-page select is changed', () => {
      const handlePageSizeChange = vi.fn();
      render(
        <Pagination
          currentPage={1}
          totalItems={100}
          pageSize={10}
          onPageChange={vi.fn()}
          pageSizeOptions={[10, 20, 50]}
          onPageSizeChange={handlePageSizeChange}
          itemLabel="tasks"
        />
      );

      const select = screen.getByLabelText('Number of tasks per page');
      fireEvent.change(select, { target: { value: '20' } });
      expect(handlePageSizeChange).toHaveBeenCalledWith(20);
    });
  });

  describe('StorageEngine & Backend Paginated Message Fetching', () => {
    const mockUser: UserProfile = {
      uid: 'user-alice-123',
      displayName: 'Alice Developer',
      email: 'alice@ojix.local',
      role: 'member',
      status: 'active',
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    };

    const recipientUser: UserProfile = {
      uid: 'user-bob-456',
      displayName: 'Bob Manager',
      email: 'bob@ojix.local',
      role: 'project_lead',
      status: 'active',
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    };

    const convId = 'conv-alice-bob-test';

    beforeEach(() => {
      storageEngine.initialize(true);
      (storageEngine as any).directMessages = [];
      (storageEngine as any).notifications = [];

      const existingUsers = storageEngine.getUsers();
      if (!existingUsers.some(u => u.uid === mockUser.uid)) {
        (storageEngine as any).users.push(mockUser);
      }
      if (!existingUsers.some(u => u.uid === recipientUser.uid)) {
        (storageEngine as any).users.push(recipientUser);
      }

      // Create 25 sequential messages
      for (let i = 1; i <= 25; i++) {
        storageEngine.sendDirectMessage(
          {
            recipientId: recipientUser.uid,
            body: `Test message ${i}`,
          },
          mockUser
        );
      }
    });

    it('returns only the requested set/page of data from storageEngine.getDirectMessagesPaginated', () => {
      const page1 = storageEngine.getDirectMessagesPaginated(mockUser, undefined, 1, 10);
      expect(page1.messages.length).toBe(10);
      expect(page1.total).toBe(25);
      expect(page1.page).toBe(1);
      expect(page1.pageSize).toBe(10);
      expect(page1.totalPages).toBe(3);
      expect(page1.hasMore).toBe(true);
      expect(page1.messages[0].body).toBe('Test message 1');
      expect(page1.messages[9].body).toBe('Test message 10');

      const page2 = storageEngine.getDirectMessagesPaginated(mockUser, undefined, 2, 10);
      expect(page2.messages.length).toBe(10);
      expect(page2.page).toBe(2);
      expect(page2.hasMore).toBe(true);
      expect(page2.messages[0].body).toBe('Test message 11');
      expect(page2.messages[9].body).toBe('Test message 20');

      const page3 = storageEngine.getDirectMessagesPaginated(mockUser, undefined, 3, 10);
      expect(page3.messages.length).toBe(5);
      expect(page3.page).toBe(3);
      expect(page3.hasMore).toBe(false);
      expect(page3.messages[0].body).toBe('Test message 21');
      expect(page3.messages[4].body).toBe('Test message 25');
    });

    it('fetchConversationMessages queries backend with page and pageSize query parameters', async () => {
      // Mock global fetch to verify query parameters sent to backend
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          count: 5,
          total: 25,
          page: 2,
          pageSize: 5,
          totalPages: 5,
          hasMore: true,
          messages: [
            {
              id: 'msg-6',
              conversationId: convId,
              senderId: mockUser.uid,
              senderDisplayName: mockUser.displayName,
              recipientId: recipientUser.uid,
              recipientDisplayName: recipientUser.displayName,
              body: 'Test message 6',
              isRead: true,
              createdAt: '2026-10-18T10:00:00.000Z',
            },
          ],
        }),
      });

      const originalFetch = global.fetch;
      global.fetch = fetchMock;

      try {
        const result = await storageEngine.fetchConversationMessages(convId, mockUser, 2, 5);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const calledUrl = fetchMock.mock.calls[0][0] as string;
        expect(calledUrl).toContain('/api/messages?');
        expect(calledUrl).toContain('conversationId=' + encodeURIComponent(convId));
        expect(calledUrl).toContain('userId=' + encodeURIComponent(mockUser.uid));
        expect(calledUrl).toContain('page=2');
        expect(calledUrl).toContain('pageSize=5');

        expect(result.total).toBe(25);
        expect(result.page).toBe(2);
        expect(result.pageSize).toBe(5);
        expect(result.totalPages).toBe(5);
        expect(result.hasMore).toBe(true);
        expect(result.messages.length).toBe(1);
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('rejects message access if user status is blocked or terminated', async () => {
      const blockedUser: UserProfile = { ...mockUser, status: 'blocked' };
      await expect(
        storageEngine.fetchConversationMessages(convId, blockedUser, 1, 10)
      ).rejects.toThrow(/Permission denied/i);
    });
  });
});
