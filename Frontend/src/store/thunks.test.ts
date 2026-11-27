import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { fetchMessages } from './channelSlice';
import { createServer, joinServer } from './serverSlice';
import { login } from './authSlice';
import { server, apiUrl } from '@/test/server';
import { setupTestStore } from '@/test/renderWithProviders';
import { makeMessage, makeServer } from '@/test/factories';

const page = (fromID: number, count: number) => Array.from({ length: count }, (_, index) => makeMessage({ id: fromID - index }));

describe('channel fetchMessages', () =>
{
    it('stores the newest-first page oldest first', async () =>
    {
        const store = setupTestStore();
        server.use(http.get(apiUrl('/channels/1/messages'), () => HttpResponse.json(page(3, 3))));

        await store.dispatch(fetchMessages({ channelID: 1 }));

        expect(store.getState().channel.messagesByChannel[1].map(message => message.id)).toEqual([1, 2, 3]);
        expect(store.getState().channel.hasMoreMessages[1]).toBe(false);
    });

    it('expects more when a full page of 50 comes back, and sends before for the next page', async () =>
    {
        const store = setupTestStore();
        const beforeParams: (string | null)[] = [];
        server.use(http.get(apiUrl('/channels/1/messages'), ({ request }) =>
        {
            const before = new URL(request.url).searchParams.get('before');
            beforeParams.push(before);

            return HttpResponse.json(before === null ? page(100, 50) : page(50, 10));
        }));

        await store.dispatch(fetchMessages({ channelID: 1 }));
        expect(store.getState().channel.hasMoreMessages[1]).toBe(true);

        await store.dispatch(fetchMessages({ channelID: 1, before: 51 }));

        expect(beforeParams).toEqual([null, '51']);
        expect(store.getState().channel.messagesByChannel[1]).toHaveLength(60);
        expect(store.getState().channel.hasMoreMessages[1]).toBe(false);
    });

    it('does not ask for the same channel again while it is loading', async () =>
    {
        const store = setupTestStore();
        let requestCount = 0;
        server.use(http.get(apiUrl('/channels/1/messages'), () =>
        {
            requestCount++;

            return HttpResponse.json([]);
        }));

        await Promise.all([store.dispatch(fetchMessages({ channelID: 1 })), store.dispatch(fetchMessages({ channelID: 1 }))]);

        expect(requestCount).toBe(1);
    });

    it('stores the API error message when loading fails', async () =>
    {
        const store = setupTestStore();
        server.use(http.get(apiUrl('/channels/1/messages'), () => HttpResponse.json({ message: 'You are not a member of this server' }, { status: 403 })));

        await store.dispatch(fetchMessages({ channelID: 1 }));

        expect(store.getState().channel.messagesStatusByChannel[1]).toBe('failed');
        expect(store.getState().channel.messagesErrorByChannel[1]).toEqual({ status: 403, message: 'You are not a member of this server' });
    });
});

describe('server thunks', () =>
{
    it('createServer fetches the new server to get its owner and icon', async () =>
    {
        const store = setupTestStore();
        const created = makeServer({ serverID: 7, serverName: 'New', ownerUsername: 'alice', iconUrl: 'https://example.com/icon.png' });
        server.use(
            http.post(apiUrl('/servers'), () => HttpResponse.json({ serverID: 7, serverName: 'New' })),
            http.get(apiUrl('/servers/7'), () => HttpResponse.json(created))
        );

        await store.dispatch(createServer({ serverName: 'New' }));

        expect(store.getState().server.servers).toEqual([created]);
    });

    it('joinServer keeps the error message for the dialog', async () =>
    {
        const store = setupTestStore();
        server.use(http.post(apiUrl('/invites/abc/join'), () => HttpResponse.text('This invite has expired', { status: 400 })));

        const result = await store.dispatch(joinServer('abc'));

        expect(result.payload).toEqual({ status: 400, message: 'This invite has expired' });
        expect(store.getState().server.servers).toEqual([]);
    });
});

describe('auth login', () =>
{
    it('stores the tokens from a successful login', async () =>
    {
        const store = setupTestStore();
        server.use(http.post(apiUrl('/auth/login'), () => HttpResponse.json({ success: true, message: '', accessToken: 'access', refreshToken: 'refresh' })));

        await store.dispatch(login({ username: 'alice', password: 'password' }));

        expect(store.getState().auth).toMatchObject({ accessToken: 'access', refreshToken: 'refresh', isAuthenticated: true, status: 'succeeded' });
    });

    it('falls back to a generic message when the API gives none', async () =>
    {
        const store = setupTestStore();
        server.use(http.post(apiUrl('/auth/login'), () => new HttpResponse(null, { status: 401 })));

        await store.dispatch(login({ username: 'alice', password: 'wrong' }));

        expect(store.getState().auth).toMatchObject({ status: 'failed', error: 'Invalid username or password', isAuthenticated: false });
    });
});
