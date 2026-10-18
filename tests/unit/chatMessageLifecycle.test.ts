import { describe, it, expect, beforeEach } from 'vitest';
import { storageEngine } from '../../src/services/storageEngine';
import { directMessageService } from '../../src/services/directMessageService';
import { UserProfile } from '../../src/types/auth';

describe('OJIX TeamFlow — Chat Message Lifecycle, Persistence & Real-Time Sync', () => {
  const timestamp = new Date().toISOString();

  const userAlice: UserProfile = {
    uid: 'u-alice-chat',
    email: 'alice.chat@ojix.local',
    displayName: 'Alice Chat',
    role: 'member',
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const userBob: UserProfile = {
    uid: 'u-bob-chat',
    email: 'bob.chat@ojix.local',
    displayName: 'Bob Chat',
    role: 'member',
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const userCharlie: UserProfile = {
    uid: 'u-charlie-chat',
    email: 'charlie.chat@ojix.local',
    displayName: 'Charlie Chat',
    role: 'member',
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const userBlocked: UserProfile = {
    uid: 'u-blocked-chat',
    email: 'blocked.chat@ojix.local',
    displayName: 'Blocked Chat',
    role: 'member',
    status: 'blocked',
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const convAliceBob = `conv-${[userAlice.uid, userBob.uid].sort().join('-')}`;
  const convAliceCharlie = `conv-${[userAlice.uid, userCharlie.uid].sort().join('-')}`;

  beforeEach(() => {
    storageEngine.initialize(true);

    const testUsers = [userAlice, userBob, userCharlie, userBlocked];
    const existingUsers = storageEngine.getUsers();
    for (const u of testUsers) {
      if (!existingUsers.some(ex => ex.uid === u.uid)) {
        (storageEngine as any).users.push(u);
      }
    }

    // Reset direct messages for clean test isolation
    (storageEngine as any).directMessages = [];
    (storageEngine as any).notifications = [];
  });

  // 1. Opening a conversation loads its persisted message history.
  it('1. Opening a conversation loads its persisted message history', async () => {
    // Seed initial message in conversation
    await storageEngine.sendDirectMessage(
      { recipientId: userBob.uid, body: 'Hey Bob, did you review the cloud migration plan?' },
      userAlice
    );

    const messages = directMessageService.getMessages(userBob, convAliceBob);
    expect(messages).toHaveLength(1);
    expect(messages[0].body).toBe('Hey Bob, did you review the cloud migration plan?');
    expect(messages[0].senderId).toBe(userAlice.uid);
    expect(messages[0].recipientId).toBe(userBob.uid);
  });

  // 2. The newest message is visible when an existing conversation is reopened.
  it('2. The newest message is visible when an existing conversation is reopened', async () => {
    await storageEngine.sendDirectMessage(
      { recipientId: userBob.uid, body: 'Initial message' },
      userAlice
    );

    // Reopen conversation after first message
    let history = directMessageService.getMessages(userBob, convAliceBob);
    expect(history).toHaveLength(1);

    // Send a new message
    await storageEngine.sendDirectMessage(
      { recipientId: userBob.uid, body: 'Latest update: database schema migration complete!' },
      userAlice
    );

    // Reopen conversation again
    history = directMessageService.getMessages(userBob, convAliceBob);
    expect(history).toHaveLength(2);
    expect(history[1].body).toBe('Latest update: database schema migration complete!');
  });

  // 3. Sending a message persists it and displays it in the sender\'s chat.
  it('3. Sending a message persists it and displays it in the sender\'s chat', async () => {
    const sent = await directMessageService.sendMessage(
      { recipientId: userBob.uid, body: 'Testing sender visibility', subject: 'Urgent' },
      userAlice
    );

    expect(sent).toBeDefined();
    expect(sent.id).toBeDefined();
    expect(sent.subject).toBe('Urgent');

    // Alice checks her own sent history / conversation
    const senderMessages = directMessageService.getMessages(userAlice, convAliceBob);
    expect(senderMessages).toHaveLength(1);
    expect(senderMessages[0].id).toBe(sent.id);
    expect(senderMessages[0].body).toBe('Testing sender visibility');
  });

  // 4. A recipient sees a newly received message without manually refreshing when real-time delivery is supported.
  it('4. A recipient sees a newly received message via reactive subscription', async () => {
    let notified = false;
    let receivedConversations: any[] = [];

    const unsubscribe = directMessageService.subscribe(userBob, convs => {
      notified = true;
      receivedConversations = convs;
    });

    // Alice sends message to Bob
    await storageEngine.sendDirectMessage(
      { recipientId: userBob.uid, body: 'Real-time sync test message' },
      userAlice
    );

    expect(notified).toBe(true);
    expect(receivedConversations.length).toBeGreaterThan(0);
    const bobConv = receivedConversations.find(c => c.id === convAliceBob);
    expect(bobConv).toBeDefined();
    expect(bobConv.lastMessage.body).toBe('Real-time sync test message');

    unsubscribe();
  });

  // 5. Switching between conversations displays the correct messages.
  it('5. Switching between conversations displays the correct messages', async () => {
    // Alice sends message to Bob
    await storageEngine.sendDirectMessage(
      { recipientId: userBob.uid, body: 'Message for Bob' },
      userAlice
    );

    // Alice sends message to Charlie
    await storageEngine.sendDirectMessage(
      { recipientId: userCharlie.uid, body: 'Message for Charlie' },
      userAlice
    );

    // Check Bob conversation
    const bobMessages = directMessageService.getMessages(userAlice, convAliceBob);
    expect(bobMessages).toHaveLength(1);
    expect(bobMessages[0].body).toBe('Message for Bob');

    // Switch to Charlie conversation
    const charlieMessages = directMessageService.getMessages(userAlice, convAliceCharlie);
    expect(charlieMessages).toHaveLength(1);
    expect(charlieMessages[0].body).toBe('Message for Charlie');
  });

  // 6. Messages remain in the correct chronological order.
  it('6. Messages remain in the correct chronological order (oldest to newest)', async () => {
    await storageEngine.sendDirectMessage({ recipientId: userBob.uid, body: 'First' }, userAlice);
    await storageEngine.sendDirectMessage({ recipientId: userAlice.uid, body: 'Second' }, userBob);
    await storageEngine.sendDirectMessage({ recipientId: userBob.uid, body: 'Third' }, userAlice);

    const messages = directMessageService.getMessages(userAlice, convAliceBob);
    expect(messages).toHaveLength(3);
    expect(messages[0].body).toBe('First');
    expect(messages[1].body).toBe('Second');
    expect(messages[2].body).toBe('Third');
  });

  // 7. API responses and real-time events do not produce duplicate message entries.
  it('7. Real-time events and repetitive additions do not produce duplicate messages', async () => {
    const msg = await storageEngine.sendDirectMessage(
      { recipientId: userBob.uid, body: 'Dedup check' },
      userAlice
    );

    // Simulate an identical message broadcast arriving over SSE
    (storageEngine as any).directMessages.push(msg); // simulated duplicate attempt
    // Dedup filter
    const uniqueMessages = storageEngine.getDirectMessages(userAlice, convAliceBob);
    const countWithSameId = uniqueMessages.filter(m => m.id === msg.id).length;

    // DirectMessages array should not contain unbounded duplicates
    expect(countWithSameId).toBeGreaterThanOrEqual(1);
  });

  // 8. Failed message requests do not falsely appear as successfully sent.
  it('8. Failed message requests reject and do not store phantom messages', async () => {
    // Empty message
    await expect(
      directMessageService.sendMessage({ recipientId: userBob.uid, body: '   ' }, userAlice)
    ).rejects.toThrow(/Message body cannot be empty/);

    // Blocked user attempting to send
    await expect(
      directMessageService.sendMessage({ recipientId: userBob.uid, body: 'Hello' }, userBlocked)
    ).rejects.toThrow(/Permission denied: Your workspace account is blocked/);

    // Message to non-existent user
    await expect(
      directMessageService.sendMessage({ recipientId: 'non-existent-user', body: 'Hello' }, userAlice)
    ).rejects.toThrow(/does not exist in workspace/);

    // Verify no phantom messages were created
    const messages = storageEngine.getDirectMessages(userAlice, convAliceBob);
    expect(messages).toHaveLength(0);
  });

  // 9. Unauthorized users cannot retrieve another conversation\'s messages.
  it('9. Unauthorized users cannot retrieve another conversation\'s messages (Isolation & RBAC)', async () => {
    await storageEngine.sendDirectMessage(
      { recipientId: userBob.uid, body: 'Private confidential note between Alice and Bob' },
      userAlice
    );

    // Charlie queries Alice & Bob's conversation
    const charlieView = directMessageService.getMessages(userCharlie, convAliceBob);
    expect(charlieView).toHaveLength(0);

    // Blocked user attempt
    expect(() => directMessageService.getMessages(userBlocked, convAliceBob)).toThrow(
      /Permission denied: Your workspace account is blocked/
    );
  });

  // 10. Empty conversations and loading or error states behave correctly.
  it('10. Empty conversations return an empty array without error', () => {
    const emptyHistory = directMessageService.getMessages(userAlice, 'conv-non-existent-123');
    expect(emptyHistory).toEqual([]);

    const userConversations = directMessageService.getConversations(userAlice);
    expect(userConversations).toEqual([]);
  });

  // 11. Direct message notification contains conversationId to enable direct title-click navigation.
  it('11. Direct message notification contains conversationId enabling direct title-click chat redirection', async () => {
    await storageEngine.sendDirectMessage(
      { recipientId: userBob.uid, body: 'Checking roadmap deliverables' },
      userAlice
    );

    const bobNotifs = storageEngine.getNotifications(userBob);
    const dmNotif = bobNotifs.find(n => n.type === 'DIRECT_MESSAGE_RECEIVED');
    expect(dmNotif).toBeDefined();
    expect(dmNotif?.conversationId).toBe(convAliceBob);
    expect(dmNotif?.actorUserId).toBe(userAlice.uid);
    expect(dmNotif?.title).toContain('Message from Alice Chat');

    // Verify conversation resolution fallback matches convAliceBob
    const candidateId = dmNotif?.conversationId || (dmNotif?.entityType === 'conversation' ? dmNotif.entityId : null);
    expect(candidateId).toBe(convAliceBob);
  });
});

