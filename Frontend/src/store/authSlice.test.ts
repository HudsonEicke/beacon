import { describe, expect, it } from 'vitest';
import authReducer, { clearTokens, login, register, setTokens } from './authSlice';

const initialState = authReducer(undefined, { type: 'init' });

const tokens = { accessToken: 'new-access', refreshToken: 'new-refresh' };

describe('authSlice', () =>
{
    it('starts logged out when nothing is stored', () =>
    {
        expect(initialState).toMatchObject({ accessToken: null, refreshToken: null, isAuthenticated: false });
    });

    it.each([
        ['login', login.fulfilled(tokens, 'request', { username: 'alice', password: 'password' })],
        ['register', register.fulfilled(tokens, 'request', { username: 'alice', email: 'alice@example.com', password: 'password' })],
        ['a token refresh', setTokens(tokens)]
    ])('stores and saves the tokens after %s', (_description, action) =>
    {
        const state = authReducer(initialState, action);

        expect(state).toMatchObject({ ...tokens, isAuthenticated: true });
        expect(localStorage.getItem('accessToken')).toBe('new-access');
        expect(localStorage.getItem('refreshToken')).toBe('new-refresh');
    });

    it('keeps the rejection message from a failed login', () =>
    {
        const state = authReducer(initialState, login.rejected(null, 'request', { username: 'alice', password: 'wrong' }, 'Invalid username or password'));

        expect(state).toMatchObject({ status: 'failed', error: 'Invalid username or password', isAuthenticated: false });
    });

    it('clears the tokens from the store and from storage on logout', () =>
    {
        const loggedIn = authReducer(initialState, setTokens(tokens));

        const state = authReducer(loggedIn, clearTokens());

        expect(state).toMatchObject({ accessToken: null, refreshToken: null, isAuthenticated: false });
        expect(localStorage.getItem('accessToken')).toBeNull();
        expect(localStorage.getItem('refreshToken')).toBeNull();
    });
});
