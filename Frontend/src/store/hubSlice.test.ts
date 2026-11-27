import { describe, expect, it } from 'vitest';
import hubReducer, { hubConnected, hubReconnected, hubReconnecting } from './hubSlice';
import { clearTokens } from './authSlice';

const initialState = hubReducer(undefined, { type: 'init' });

describe('hubSlice', () =>
{
    it('counts reconnects so components know to refetch', () =>
    {
        const state = [hubConnected(), hubReconnecting(), hubReconnected(), hubReconnecting(), hubReconnected()].reduce(hubReducer, initialState);

        expect(state).toEqual({ status: 'connected', reconnectCount: 2 });
    });

    it('resets on logout', () =>
    {
        expect(hubReducer(hubReducer(initialState, hubReconnected()), clearTokens())).toEqual(initialState);
    });
});
