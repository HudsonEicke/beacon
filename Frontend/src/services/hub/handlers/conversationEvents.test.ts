import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { registerConversationEvents } from './conversationEvents';
import { createFakeHubConnection } from '@/test/fakeHubConnection';
import { emptyRootState, setupTestStore } from '@/test/renderWithProviders';
import { server, apiUrl } from '@/test/server';
import { makeConversation, makeDetailedUser, makeSentMessage, makeUser } from '@/test/factories';
import type { RootState } from '@/store/store';
import { ConversationType } from '@/types';

const emptyState = emptyRootState();

// signed in as alice, in group 1 with bob, whose members are loaded
const setup = (reading: Partial<RootState['reading']> = {}) =>
{
    const store = setupTestStore({
        user: { ...emptyState.user, user: makeDetailedUser({ username: 'alice' }) },
        conversation: {
            ...emptyState.conversation,
            conversations: [makeConversation({ id: 1, conversationType: ConversationType.group, conversationName: 'Group', lastMessageID: 4 })],
            membersByConversation: { 1: [makeUser({ username: 'alice' }), makeUser({ username: 'bob' })] }
        },
        reading: { ...emptyState.reading, ...reading }
    });
    const { connection, emit } = createFakeHubConnection();
    registerConversationEvents(connection, store);

    return { store, emit };
};

const sentMessage = makeSentMessage({ id: 5, senderUsername: 'bob' });

describe('conversation hub events', () =>
{
    it('counts a message from someone else as unread', () =>
    {
        const { store, emit } = setup();

        emit('ReceiveConversationMessage', 1, sentMessage);

        expect(store.getState().conversation.conversations[0]).toMatchObject({ lastMessageID: 5, unreadCount: 1 });
    });

    it('does not count your own message from another tab', () =>
    {
        const { store, emit } = setup();

        emit('ReceiveConversationMessage', 1, { ...sentMessage, senderUsername: 'alice' });

        expect(store.getState().conversation.conversations[0].unreadCount).toBe(0);
    });

    it('marks a message read straight away when it arrives in the conversation you are reading', async () =>
    {
        const { store, emit } = setup({ conversationID: 1 });
        const readStates: unknown[] = [];
        server.use(http.put(apiUrl('/conversations/1/read-state'), async ({ request }) =>
        {
            readStates.push(await request.json());

            return new HttpResponse(null, { status: 204 });
        }));

        emit('ReceiveConversationMessage', 1, sentMessage);

        expect(store.getState().conversation.conversations[0].unreadCount).toBe(0);
        await expect.poll(() => readStates).toEqual([{ lastReadMessageID: 5 }]);
    });

    it('removes the group when you left it in another tab', () =>
    {
        const { store, emit } = setup();

        emit('ConversationMemberLeft', 1, 'alice');

        expect(store.getState().conversation.conversations).toEqual([]);
    });

    it('removes only that member when someone else leaves', () =>
    {
        const { store, emit } = setup();

        emit('ConversationMemberLeft', 1, 'bob');

        expect(store.getState().conversation.conversations).toHaveLength(1);
        expect(store.getState().conversation.membersByConversation[1].map(member => member.username)).toEqual(['alice']);
    });
});
