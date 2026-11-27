import { describe, expect, it } from 'vitest';
import serverReducer, { createChannel, deleteInvite, fetchChannels, fetchServers, joinServer, leaveServer, reorderChannels, setLastChannel } from './serverSlice';
import { deleteChannel, markChannelRead, sendMessage } from './channelSlice';
import { clearTokens } from './authSlice';
import { channelCreated, channelDeleted, channelMessageReceived, channelReadStateUpdated, channelsReordered, serverJoined, serverMemberJoined, serverRemoved, userUpdated } from './hubEvents';
import { makeChannel, makeInvite, makeMessage, makeServer, makeUser } from '@/test/factories';

type ServerState = ReturnType<typeof serverReducer>;

const initialState = serverReducer(undefined, { type: 'init' });

const stateWith = (overrides: Partial<ServerState>): ServerState => ({ ...initialState, ...overrides });

// one server with two read channels, the shape most tests start from
const loadedState = () => stateWith({
    servers: [makeServer({ serverID: 1 })],
    channelsByServer: {
        1: [
            makeChannel({ channelID: 10, channelName: 'general', channelOrder: 0 }),
            makeChannel({ channelID: 11, channelName: 'random', channelOrder: 1 })
        ]
    }
});

describe('serverSlice', () =>
{
    describe('fetching', () =>
    {
        it('stores servers and marks them loaded', () =>
        {
            const servers = [makeServer({ serverID: 1 }), makeServer({ serverID: 2 })];

            const state = serverReducer(initialState, fetchServers.fulfilled(servers, 'request'));

            expect(state).toMatchObject({ servers, hasLoadedServers: true, serversStatus: 'succeeded' });
        });

        it('keeps hasLoadedServers through a refetch so the list does not flash', () =>
        {
            const state = serverReducer(stateWith({ hasLoadedServers: true }), fetchServers.pending('request'));

            expect(state).toMatchObject({ hasLoadedServers: true, serversStatus: 'loading' });
        });

        it('tracks channel loading per server', () =>
        {
            const loading = serverReducer(initialState, fetchChannels.pending('request', 1));
            const failed = serverReducer(loading, fetchChannels.rejected(null, 'request', 2, { message: 'Nope' }));

            expect(failed.channelsStatusByServer).toEqual({ 1: 'loading', 2: 'failed' });
            expect(failed.channelsErrorByServer[2]).toEqual({ message: 'Nope' });
        });
    });

    describe('adding servers and channels', () =>
    {
        it('does not add a server twice when the response and the hub event both arrive', () =>
        {
            const server = makeServer({ serverID: 2 });

            const afterResponse = serverReducer(loadedState(), joinServer.fulfilled(server, 'request', 'code'));
            const afterHub = serverReducer(afterResponse, serverJoined({ server }));

            expect(afterHub.servers.map(listedServer => listedServer.serverID)).toEqual([1, 2]);
        });

        it('does not add a channel twice when the response and the hub event both arrive', () =>
        {
            const channel = makeChannel({ channelID: 12, channelOrder: 2 });

            const afterResponse = serverReducer(loadedState(), createChannel.fulfilled({ serverID: 1, channel }, 'request', { serverID: 1, request: { channelName: 'new' } }));
            const afterHub = serverReducer(afterResponse, channelCreated({ serverID: 1, channel }));

            expect(afterHub.channelsByServer[1].map(listedChannel => listedChannel.channelID)).toEqual([10, 11, 12]);
        });

        it('ignores a new member when the member list was never loaded', () =>
        {
            const state = serverReducer(loadedState(), serverMemberJoined({ serverID: 1, member: makeUser() }));

            expect(state.membersByServer[1]).toBeUndefined();
        });
    });

    describe('removing a server', () =>
    {
        it('drops everything cached for that server', () =>
        {
            const state = stateWith({
                ...loadedState(),
                membersByServer: { 1: [makeUser()] },
                invitesByServer: { 1: [makeInvite()] },
                channelsStatusByServer: { 1: 'succeeded' },
                lastChannelByServer: { 1: 10 }
            });

            const afterLeave = serverReducer(state, leaveServer.fulfilled(1, 'request', 1));

            expect(afterLeave).toMatchObject({
                servers: [],
                channelsByServer: {},
                membersByServer: {},
                invitesByServer: {},
                channelsStatusByServer: {},
                lastChannelByServer: {}
            });
        });

        it('does the same when the hub says the server is gone', () =>
        {
            const afterHub = serverReducer(loadedState(), serverRemoved({ serverID: 1 }));

            expect(afterHub.servers).toEqual([]);
            expect(afterHub.channelsByServer[1]).toBeUndefined();
        });
    });

    describe('unread dots', () =>
    {
        it('marks the channel and server unread when a message arrives that is not being read', () =>
        {
            const state = serverReducer(loadedState(), channelMessageReceived({ serverID: 1, channelID: 11, message: makeMessage(), isRead: false }));

            expect(state.channelsByServer[1][1].hasUnread).toBe(true);
            expect(state.servers[0].hasUnread).toBe(true);
        });

        it('marks the server unread even when its channels are not loaded', () =>
        {
            const state = serverReducer(stateWith({ servers: [makeServer({ serverID: 1 })] }), channelMessageReceived({ serverID: 1, channelID: 11, message: makeMessage(), isRead: false }));

            expect(state.servers[0].hasUnread).toBe(true);
        });

        it('keeps the server dot while another channel is still unread', () =>
        {
            const state = stateWith({
                servers: [makeServer({ serverID: 1, hasUnread: true })],
                channelsByServer: { 1: [makeChannel({ channelID: 10, hasUnread: true }), makeChannel({ channelID: 11, hasUnread: true })] }
            });

            const afterRead = serverReducer(state, markChannelRead.fulfilled({ channelID: 10, lastReadMessageID: 5 }, 'request', { channelID: 10, lastReadMessageID: 5 }));

            expect(afterRead.channelsByServer[1][0].hasUnread).toBe(false);
            expect(afterRead.servers[0].hasUnread).toBe(true);
        });

        it('clears the server dot once its last unread channel is read', () =>
        {
            const state = stateWith({
                servers: [makeServer({ serverID: 1, hasUnread: true })],
                channelsByServer: { 1: [makeChannel({ channelID: 10, hasUnread: true }), makeChannel({ channelID: 11 })] }
            });

            const afterSend = serverReducer(state, sendMessage.fulfilled({ channelID: 10, message: makeMessage() }, 'request', { channelID: 10, request: { messageText: 'hi' } }));

            expect(afterSend.servers[0].hasUnread).toBe(false);
        });

        it('takes both flags from ChannelReadStateUpdated as sent', () =>
        {
            const state = stateWith({
                servers: [makeServer({ serverID: 1, hasUnread: true })],
                channelsByServer: { 1: [makeChannel({ channelID: 10, hasUnread: true })] }
            });

            const afterUpdate = serverReducer(state, channelReadStateUpdated({ serverID: 1, channelID: 10, channelHasUnread: false, serverHasUnread: true }));

            expect(afterUpdate.channelsByServer[1][0].hasUnread).toBe(false);
            expect(afterUpdate.servers[0].hasUnread).toBe(true);
        });
    });

    describe('channel order', () =>
    {
        it('reorders straight away while the request runs', () =>
        {
            const state = serverReducer(loadedState(), reorderChannels.pending('request', { serverID: 1, channelIDs: [11, 10] }));

            expect(state.channelsByServer[1].map(channel => [channel.channelID, channel.channelOrder])).toEqual([[11, 0], [10, 1]]);
        });

        it('applies an order from the hub', () =>
        {
            const state = serverReducer(loadedState(), channelsReordered({ serverID: 1, channelIDs: [11, 10] }));

            expect(state.channelsByServer[1].map(channel => channel.channelID)).toEqual([11, 10]);
        });
    });

    describe('deleting a channel', () =>
    {
        it('renumbers the remaining channels', () =>
        {
            const state = stateWith({
                servers: [makeServer({ serverID: 1 })],
                channelsByServer: { 1: [makeChannel({ channelID: 10, channelOrder: 0 }), makeChannel({ channelID: 11, channelOrder: 1 }), makeChannel({ channelID: 12, channelOrder: 2 })] }
            });

            const afterDelete = serverReducer(state, deleteChannel.fulfilled({ serverID: 1, channelID: 10 }, 'request', { serverID: 1, channelID: 10 }));

            expect(afterDelete.channelsByServer[1].map(channel => [channel.channelID, channel.channelOrder])).toEqual([[11, 0], [12, 1]]);
        });

        it('clears the server dot when the only unread channel is deleted', () =>
        {
            const state = stateWith({
                servers: [makeServer({ serverID: 1, hasUnread: true })],
                channelsByServer: { 1: [makeChannel({ channelID: 10, hasUnread: true }), makeChannel({ channelID: 11 })] }
            });

            const afterDelete = serverReducer(state, channelDeleted({ channelID: 10 }));

            expect(afterDelete.servers[0].hasUnread).toBe(false);
        });

        it('forgets it as the last channel even when the server has no channels loaded', () =>
        {
            const state = stateWith({ lastChannelByServer: { 1: 10, 2: 20 } });

            const afterDelete = serverReducer(state, channelDeleted({ channelID: 10 }));

            expect(afterDelete.lastChannelByServer).toEqual({ 2: 20 });
        });
    });

    it('updates a member profile in every server member list', () =>
    {
        const state = stateWith({ membersByServer: { 1: [makeUser({ username: 'bob' })], 2: [makeUser({ username: 'bob' }), makeUser({ username: 'carol', displayName: 'Carol' })] } });

        const afterUpdate = serverReducer(state, userUpdated({ username: 'bob', displayName: 'Bobby', profileImageUrl: 'https://example.com/bob.png' }));

        expect(afterUpdate.membersByServer[1][0].displayName).toBe('Bobby');
        expect(afterUpdate.membersByServer[2].map(member => member.displayName)).toEqual(['Bobby', 'Carol']);
    });

    it('removes a deleted invite from the list', () =>
    {
        const keptInvite = makeInvite({ inviteCode: 'kept' });
        const state = stateWith({ invitesByServer: { 1: [makeInvite({ inviteCode: 'gone' }), keptInvite] } });

        const afterDelete = serverReducer(state, deleteInvite.fulfilled({ serverID: 1, code: 'gone' }, 'request', { serverID: 1, code: 'gone' }));

        expect(afterDelete.invitesByServer[1]).toEqual([keptInvite]);
    });

    it('resets everything on logout, including the last channel map loaded at startup', () =>
    {
        const state = serverReducer(stateWith({ ...loadedState(), lastChannelByServer: { 1: 10 } }), setLastChannel({ serverID: 2, channelID: 20 }));

        expect(serverReducer(state, clearTokens())).toEqual({ ...initialState, lastChannelByServer: {} });
    });
});
