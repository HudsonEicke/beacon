import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { registerChannelEvents } from './channelEvents';
import { createFakeHubConnection } from '@/test/fakeHubConnection';
import { emptyRootState, setupTestStore } from '@/test/renderWithProviders';
import { server, apiUrl } from '@/test/server';
import { makeChannel, makeDetailedUser, makeSentMessage, makeServer } from '@/test/factories';
import type { RootState } from '@/store/store';

const emptyState = emptyRootState();

// signed in as alice, with server 1's channel 10 loaded and opened
const setup = (reading: Partial<RootState['reading']> = {}) =>
{
    const store = setupTestStore({
        user: { ...emptyState.user, user: makeDetailedUser({ username: 'alice' }) },
        server: { ...emptyState.server, servers: [makeServer({ serverID: 1 })], channelsByServer: { 1: [makeChannel({ channelID: 10 })] } },
        channel: { ...emptyState.channel, messagesByChannel: { 10: [] } },
        reading: { ...emptyState.reading, ...reading }
    });
    const { connection, emit } = createFakeHubConnection();
    registerChannelEvents(connection, store);

    return { store, emit };
};

const sentMessage = makeSentMessage({ id: 5, senderUsername: 'bob' });

describe('channel hub events', () =>
{
    it('adds a message from someone else and shows the unread dots', () =>
    {
        const { store, emit } = setup();

        emit('ReceiveChannelMessage', 1, 10, sentMessage);

        expect(store.getState().channel.messagesByChannel[10]).toEqual([{ ...sentMessage, edited: false }]);
        expect(store.getState().server.channelsByServer[1][0].hasUnread).toBe(true);
        expect(store.getState().server.servers[0].hasUnread).toBe(true);
    });

    it('never shows your own message as unread', () =>
    {
        const { store, emit } = setup();

        emit('ReceiveChannelMessage', 1, 10, { ...sentMessage, senderUsername: 'alice' });

        expect(store.getState().server.servers[0].hasUnread).toBe(false);
    });

    it('marks a message read straight away when it arrives in the channel you are reading', async () =>
    {
        const { store, emit } = setup({ channelID: 10 });
        const readStates: unknown[] = [];
        server.use(http.put(apiUrl('/channels/10/read-state'), async ({ request }) =>
        {
            readStates.push(await request.json());

            return new HttpResponse(null, { status: 204 });
        }));

        emit('ReceiveChannelMessage', 1, 10, sentMessage);

        expect(store.getState().server.servers[0].hasUnread).toBe(false);
        await expect.poll(() => readStates).toEqual([{ lastReadMessageID: 5 }]);
    });

    it('removes a deleted channel from its server', () =>
    {
        const { store, emit } = setup();

        emit('ChannelDeleted', 10);

        expect(store.getState().server.channelsByServer[1]).toEqual([]);
        expect(store.getState().channel.messagesByChannel[10]).toBeUndefined();
    });

    it('adds a new channel as read', () =>
    {
        const { store, emit } = setup();

        emit('ChannelCreated', 1, { channelID: 11, channelName: 'random', channelOrder: 1 });

        expect(store.getState().server.channelsByServer[1][1]).toEqual({ channelID: 11, channelName: 'random', channelOrder: 1, hasUnread: false });
    });
});
