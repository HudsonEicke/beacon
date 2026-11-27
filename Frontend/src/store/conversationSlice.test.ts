import { describe, expect, it } from 'vitest';
import conversationReducer, { createConversation, fetchMessages, leaveConversation, markConversationRead, sendMessage } from './conversationSlice';
import { clearTokens } from './authSlice';
import { conversationCreated, conversationMemberAdded, conversationMessageReceived, conversationRemoved, userUpdated } from './hubEvents';
import { makeConversation, makeMessage, makeUser } from '@/test/factories';
import { ConversationType } from '@/types';

type ConversationState = ReturnType<typeof conversationReducer>;

const initialState = conversationReducer(undefined, { type: 'init' });

const stateWith = (overrides: Partial<ConversationState>): ConversationState => ({ ...initialState, ...overrides });

const conversationIds = (state: ConversationState) => state.conversations.map(conversation => conversation.id);

const received = (conversationID: number, messageID: number, isRead: boolean) =>
    conversationMessageReceived({ conversationID, message: makeMessage({ id: messageID }), isRead });

describe('conversationSlice', () =>
{
    describe('new messages', () =>
    {
        const twoConversations = () => stateWith({
            conversations: [makeConversation({ id: 1, lastMessageID: 20 }), makeConversation({ id: 2, lastMessageID: 10 })]
        });

        it('moves the conversation to the top and counts it unread', () =>
        {
            const state = conversationReducer(twoConversations(), received(2, 30, false));

            expect(conversationIds(state)).toEqual([2, 1]);
            expect(state.conversations[0]).toMatchObject({ lastMessageID: 30, unreadCount: 1 });
        });

        it('does not count a message that is being read', () =>
        {
            const state = conversationReducer(stateWith({ conversations: [makeConversation({ id: 1, unreadCount: 3 })] }), received(1, 30, true));

            expect(state.conversations[0].unreadCount).toBe(0);
        });

        it('counts your own message once when the response and the hub event both arrive', () =>
        {
            const message = makeMessage({ id: 30 });

            const afterResponse = conversationReducer(twoConversations(), sendMessage.fulfilled({ conversationID: 2, message }, 'request', { conversationID: 2, request: { messageText: 'hi' } }));
            const afterHub = conversationReducer(afterResponse, conversationMessageReceived({ conversationID: 2, message, isRead: false }));

            expect(afterHub.conversations[0]).toMatchObject({ id: 2, unreadCount: 0 });
        });

        it('adds the message only to a conversation that has been opened', () =>
        {
            const state = stateWith({ conversations: [makeConversation({ id: 1 }), makeConversation({ id: 2 })], messagesByConversation: { 1: [] } });

            const afterFirst = conversationReducer(state, received(1, 30, false));
            const afterSecond = conversationReducer(afterFirst, received(2, 31, false));

            expect(afterSecond.messagesByConversation[1].map(message => message.id)).toEqual([30]);
            expect(afterSecond.messagesByConversation[2]).toBeUndefined();
        });
    });

    describe('new conversations', () =>
    {
        it('inserts by most recent activity, then newest first among empty ones', () =>
        {
            const state = stateWith({
                conversations: [
                    makeConversation({ id: 1, lastMessageID: 50 }),
                    makeConversation({ id: 3, lastMessageID: null }),
                    makeConversation({ id: 2, lastMessageID: null })
                ]
            });

            const afterCreate = conversationReducer(state, conversationCreated({ conversation: makeConversation({ id: 4, lastMessageID: null }) }));

            expect(conversationIds(afterCreate)).toEqual([1, 4, 3, 2]);
        });

        it('does not add a conversation twice when the response and the hub event both arrive', () =>
        {
            const conversation = makeConversation({ id: 5, conversationType: ConversationType.group, conversationName: 'Group' });

            const afterResponse = conversationReducer(initialState, createConversation.fulfilled(conversation, 'request', { memberUsernames: ['bob'] }));
            const afterHub = conversationReducer(afterResponse, conversationCreated({ conversation }));

            expect(conversationIds(afterHub)).toEqual([5]);
        });
    });

    describe('message paging', () =>
    {
        it('replaces the list on a fresh load', () =>
        {
            const state = stateWith({ messagesByConversation: { 1: [makeMessage({ id: 1 })] } });

            const afterLoad = conversationReducer(state, fetchMessages.fulfilled({ conversationID: 1, messages: [makeMessage({ id: 5 })], hasMore: false }, 'request', { conversationID: 1 }));

            expect(afterLoad.messagesByConversation[1].map(message => message.id)).toEqual([5]);
            expect(afterLoad.hasMoreMessages[1]).toBe(false);
        });

        it('puts an older page in front', () =>
        {
            const state = stateWith({ messagesByConversation: { 1: [makeMessage({ id: 5 })] } });

            const afterLoad = conversationReducer(state, fetchMessages.fulfilled({ conversationID: 1, before: 5, messages: [makeMessage({ id: 3 }), makeMessage({ id: 4 })], hasMore: true }, 'request', { conversationID: 1, before: 5 }));

            expect(afterLoad.messagesByConversation[1].map(message => message.id)).toEqual([3, 4, 5]);
            expect(afterLoad.hasMoreMessages[1]).toBe(true);
        });
    });

    it('clears the unread count when marked read', () =>
    {
        const state = stateWith({ conversations: [makeConversation({ id: 1, unreadCount: 4 })] });

        const afterRead = conversationReducer(state, markConversationRead.fulfilled({ conversationID: 1, lastReadMessageID: 9 }, 'request', { conversationID: 1, lastReadMessageID: 9 }));

        expect(afterRead.conversations[0].unreadCount).toBe(0);
    });

    it('drops everything cached for a conversation you leave', () =>
    {
        const state = stateWith({
            conversations: [makeConversation({ id: 1 }), makeConversation({ id: 2 })],
            messagesByConversation: { 1: [makeMessage()] },
            membersByConversation: { 1: [makeUser()] },
            hasMoreMessages: { 1: true },
            messagesStatusByConversation: { 1: 'succeeded' }
        });

        const afterLeave = conversationReducer(state, leaveConversation.fulfilled(1, 'request', 1));

        expect(conversationIds(afterLeave)).toEqual([2]);
        expect(afterLeave).toMatchObject({ messagesByConversation: {}, membersByConversation: {}, hasMoreMessages: {}, messagesStatusByConversation: {} });
    });

    it('removes a conversation when the hub says you left it in another tab', () =>
    {
        const afterHub = conversationReducer(stateWith({ conversations: [makeConversation({ id: 1 })] }), conversationRemoved({ conversationID: 1 }));

        expect(afterHub.conversations).toEqual([]);
    });

    it('adds a member only to a member list that was loaded', () =>
    {
        const state = stateWith({ membersByConversation: { 1: [makeUser({ username: 'alice' })] } });
        const bob = makeUser({ username: 'bob' });

        const afterFirst = conversationReducer(state, conversationMemberAdded({ conversationID: 1, member: bob }));
        const afterSecond = conversationReducer(afterFirst, conversationMemberAdded({ conversationID: 1, member: bob }));
        const afterUnloaded = conversationReducer(afterSecond, conversationMemberAdded({ conversationID: 2, member: bob }));

        expect(afterUnloaded.membersByConversation[1].map(member => member.username)).toEqual(['alice', 'bob']);
        expect(afterUnloaded.membersByConversation[2]).toBeUndefined();
    });

    it('renames a DM and updates old messages when the other person changes their profile', () =>
    {
        const state = stateWith({
            conversations: [makeConversation({ id: 1, otherUsername: 'bob', conversationName: 'Bob' }), makeConversation({ id: 2, otherUsername: 'carol', conversationName: 'Carol' })],
            messagesByConversation: { 1: [makeMessage({ senderUsername: 'bob' })] }
        });

        const afterUpdate = conversationReducer(state, userUpdated({ username: 'bob', displayName: 'Bobby', profileImageUrl: 'https://example.com/bob.png' }));

        expect(afterUpdate.conversations.map(conversation => conversation.conversationName)).toEqual(['Bobby', 'Carol']);
        expect(afterUpdate.conversations[0].iconUrl).toBe('https://example.com/bob.png');
        expect(afterUpdate.messagesByConversation[1][0].senderDisplayName).toBe('Bobby');
    });

    it('resets on logout', () =>
    {
        const state = stateWith({ conversations: [makeConversation()], hasLoadedConversations: true });

        expect(conversationReducer(state, clearTokens())).toEqual(initialState);
    });
});
