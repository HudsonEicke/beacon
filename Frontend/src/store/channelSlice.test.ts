import { describe, expect, it } from 'vitest';
import channelReducer, { deleteChannel, editMessage, fetchMessages } from './channelSlice';
import { clearTokens } from './authSlice';
import { channelDeleted, channelMessageDeleted, channelMessageReceived } from './hubEvents';
import { makeMessage, makeReplyPreview } from '@/test/factories';

type ChannelState = ReturnType<typeof channelReducer>;

const initialState = channelReducer(undefined, { type: 'init' });

const stateWith = (overrides: Partial<ChannelState>): ChannelState => ({ ...initialState, ...overrides });

const messageIds = (state: ChannelState, channelID: number) => state.messagesByChannel[channelID]?.map(message => message.id);

describe('channelSlice', () =>
{
    it('replaces the list on a fresh load and prepends an older page', () =>
    {
        const fresh = channelReducer(initialState, fetchMessages.fulfilled({ channelID: 1, messages: [makeMessage({ id: 5 }), makeMessage({ id: 6 })], hasMore: true }, 'request', { channelID: 1 }));
        const older = channelReducer(fresh, fetchMessages.fulfilled({ channelID: 1, before: 5, messages: [makeMessage({ id: 4 })], hasMore: false }, 'request', { channelID: 1, before: 5 }));

        expect(messageIds(older, 1)).toEqual([4, 5, 6]);
        expect(older.hasMoreMessages[1]).toBe(false);
        expect(older.messagesStatusByChannel[1]).toBe('succeeded');
    });

    it('tracks loading per channel', () =>
    {
        const state = channelReducer(
            channelReducer(initialState, fetchMessages.pending('request', { channelID: 1 })),
            fetchMessages.rejected(null, 'request', { channelID: 2 }, { message: 'Nope' })
        );

        expect(state.messagesStatusByChannel).toEqual({ 1: 'loading', 2: 'failed' });
        expect(state.messagesErrorByChannel[2]).toEqual({ message: 'Nope' });
    });

    it('ignores messages for a channel that was never opened', () =>
    {
        const state = channelReducer(initialState, channelMessageReceived({ serverID: 1, channelID: 1, message: makeMessage(), isRead: false }));

        expect(state.messagesByChannel[1]).toBeUndefined();
    });

    it('adds a live message to an opened channel', () =>
    {
        const state = channelReducer(stateWith({ messagesByChannel: { 1: [makeMessage({ id: 1 })] } }), channelMessageReceived({ serverID: 1, channelID: 1, message: makeMessage({ id: 2 }), isRead: false }));

        expect(messageIds(state, 1)).toEqual([1, 2]);
    });

    it('applies an edit and a delete', () =>
    {
        const state = stateWith({
            messagesByChannel: {
                1: [makeMessage({ id: 1 }), makeMessage({ id: 2, isReply: true, replyToID: 1, replyTo: makeReplyPreview({ id: 1 }) })]
            }
        });

        const afterEdit = channelReducer(state, editMessage.fulfilled({ channelID: 1, messageID: 2, messageText: 'edited' }, 'request', { channelID: 1, messageID: 2, messageText: 'edited' }));
        const afterDelete = channelReducer(afterEdit, channelMessageDeleted({ channelID: 1, messageID: 1 }));

        expect(afterDelete.messagesByChannel[1]).toEqual([
            expect.objectContaining({ id: 2, messageText: 'edited', edited: true, isReply: true, replyTo: null })
        ]);
    });

    it.each([
        ['the delete response', deleteChannel.fulfilled({ serverID: 1, channelID: 1 }, 'request', { serverID: 1, channelID: 1 })],
        ['the hub event', channelDeleted({ channelID: 1 })]
    ])('drops a deleted channel\'s cache on %s', (_description, action) =>
    {
        const state = stateWith({
            messagesByChannel: { 1: [makeMessage()], 2: [makeMessage()] },
            hasMoreMessages: { 1: true },
            messagesStatusByChannel: { 1: 'succeeded' },
            messagesErrorByChannel: { 1: null }
        });

        const afterDelete = channelReducer(state, action);

        expect(Object.keys(afterDelete.messagesByChannel)).toEqual(['2']);
        expect(afterDelete).toMatchObject({ hasMoreMessages: {}, messagesStatusByChannel: {}, messagesErrorByChannel: {} });
    });

    it('resets on logout', () =>
    {
        expect(channelReducer(stateWith({ messagesByChannel: { 1: [makeMessage()] } }), clearTokens())).toEqual(initialState);
    });
});
