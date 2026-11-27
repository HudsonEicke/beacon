import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import api, { getFreshAccessToken } from './api';
import { server, apiUrl } from '@/test/server';
import { setupTestStore } from '@/test/renderWithProviders';
import { makeAuthState, makeJwt } from '@/test/factories';

const loggedInStore = (accessToken = 'old-access') => setupTestStore({ auth: makeAuthState({ accessToken, refreshToken: 'old-refresh' }) });

// /users/me answers 401 unless the request carries the token the test says is valid
const protectedEndpoint = (validToken: string) =>
    http.get(apiUrl('/users/me'), ({ request }) =>
        request.headers.get('Authorization') === `Bearer ${validToken}`
            ? HttpResponse.json({ username: 'alice' })
            : new HttpResponse(null, { status: 401 }));

const refreshEndpoint = (onRefresh: (body: unknown) => void = () => undefined) =>
    http.post(apiUrl('/auth/refresh'), async ({ request }) =>
    {
        onRefresh(await request.json());

        return HttpResponse.json({ success: true, message: '', accessToken: 'new-access', refreshToken: 'new-refresh' });
    });

describe('api client', () =>
{
    it('sends the access token as a Bearer header', async () =>
    {
        loggedInStore();
        server.use(protectedEndpoint('old-access'));

        const { data } = await api.get('/users/me');

        expect(data).toEqual({ username: 'alice' });
    });

    it('refreshes the token on a 401, saves it and retries the request', async () =>
    {
        const store = loggedInStore();
        const refreshBodies: unknown[] = [];
        server.use(protectedEndpoint('new-access'), refreshEndpoint(body => refreshBodies.push(body)));

        const { data } = await api.get('/users/me');

        expect(data).toEqual({ username: 'alice' });
        expect(refreshBodies).toEqual([{ refreshToken: 'old-refresh', accessToken: 'old-access' }]);
        expect(store.getState().auth).toMatchObject({ accessToken: 'new-access', refreshToken: 'new-refresh' });
        expect(localStorage.getItem('accessToken')).toBe('new-access');
    });

    it('refreshes only once when several requests get a 401 together', async () =>
    {
        loggedInStore();
        let refreshCount = 0;
        server.use(protectedEndpoint('new-access'), refreshEndpoint(() => refreshCount++));

        const responses = await Promise.all([api.get('/users/me'), api.get('/users/me'), api.get('/users/me')]);

        expect(responses.map(response => response.status)).toEqual([200, 200, 200]);
        expect(refreshCount).toBe(1);
    });

    it('retries with the current token without refreshing when another request already refreshed it', async () =>
    {
        const store = loggedInStore('new-access');
        let refreshCount = 0;
        server.use(protectedEndpoint('new-access'), refreshEndpoint(() => refreshCount++));

        // sent with a token that has since been replaced, as if it started before another request's refresh
        const { status } = await api.get('/users/me', { headers: { Authorization: 'Bearer old-access' } });

        expect(status).toBe(200);
        expect(refreshCount).toBe(0);
        expect(store.getState().auth.accessToken).toBe('new-access');
    });

    it('logs out when the refresh is refused', async () =>
    {
        const store = loggedInStore();
        server.use(protectedEndpoint('new-access'), http.post(apiUrl('/auth/refresh'), () => new HttpResponse(null, { status: 401 })));

        await expect(api.get('/users/me')).rejects.toMatchObject({ response: { status: 401 } });

        expect(store.getState().auth).toMatchObject({ accessToken: null, refreshToken: null, isAuthenticated: false });
    });

    it('only retries a request once', async () =>
    {
        const store = loggedInStore();
        let refreshCount = 0;
        server.use(http.get(apiUrl('/users/me'), () => new HttpResponse(null, { status: 401 })), refreshEndpoint(() => refreshCount++));

        await expect(api.get('/users/me')).rejects.toMatchObject({ response: { status: 401 } });

        expect(refreshCount).toBe(1);
        expect(store.getState().auth.accessToken).toBe('new-access');
    });

    it.each(['/auth/login', '/auth/register'])('does not refresh when %s returns a 401', async (path) =>
    {
        const store = loggedInStore();
        let refreshCount = 0;
        server.use(http.post(apiUrl(path), () => new HttpResponse(null, { status: 401 })), refreshEndpoint(() => refreshCount++));

        await expect(api.post(path, {})).rejects.toMatchObject({ response: { status: 401 } });

        expect(refreshCount).toBe(0);
        expect(store.getState().auth.isAuthenticated).toBe(true);
    });
});

describe('getFreshAccessToken', () =>
{
    const inOneHour = () => new Date(Date.now() + 60 * 60 * 1000);
    const inTenSeconds = () => new Date(Date.now() + 10 * 1000);

    it('returns the current token when it is not about to expire', async () =>
    {
        const token = makeJwt(inOneHour());
        loggedInStore(token);

        await expect(getFreshAccessToken()).resolves.toBe(token);
    });

    it('refreshes a token that expires within 30 seconds', async () =>
    {
        loggedInStore(makeJwt(inTenSeconds()));
        server.use(refreshEndpoint());

        await expect(getFreshAccessToken()).resolves.toBe('new-access');
    });

    it('logs out when the refresh is refused', async () =>
    {
        const store = loggedInStore(makeJwt(inTenSeconds()));
        server.use(http.post(apiUrl('/auth/refresh'), () => new HttpResponse(null, { status: 401 })));

        await expect(getFreshAccessToken()).rejects.toBeDefined();

        expect(store.getState().auth.isAuthenticated).toBe(false);
    });

    it('stays logged in after a network error so the hub can retry', async () =>
    {
        const store = loggedInStore(makeJwt(inTenSeconds()));
        server.use(http.post(apiUrl('/auth/refresh'), () => HttpResponse.error()));

        await expect(getFreshAccessToken()).rejects.toBeDefined();

        expect(store.getState().auth.isAuthenticated).toBe(true);
    });
});
