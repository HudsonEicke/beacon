import { describe, expect, it } from 'vitest';
import { setupStore } from './store';
import { setLastChannel } from './serverSlice';
import { clearTokens } from './authSlice';
import { channelDeleted } from './hubEvents';

const storedLastChannels = () => JSON.parse(localStorage.getItem('lastChannelByServer') ?? 'null');

describe('listenerMiddleware', () =>
{
    it('saves the last channel for each server', () =>
    {
        const store = setupStore();

        store.dispatch(setLastChannel({ serverID: 1, channelID: 10 }));
        store.dispatch(setLastChannel({ serverID: 2, channelID: 20 }));

        expect(storedLastChannels()).toEqual({ 1: 10, 2: 20 });
    });

    it('saves again when a remembered channel is deleted', () =>
    {
        const store = setupStore();
        store.dispatch(setLastChannel({ serverID: 1, channelID: 10 }));
        store.dispatch(setLastChannel({ serverID: 2, channelID: 20 }));

        store.dispatch(channelDeleted({ channelID: 10 }));

        expect(storedLastChannels()).toEqual({ 2: 20 });
    });

    it('clears the saved channels on logout so the next user does not get them', () =>
    {
        const store = setupStore();
        store.dispatch(setLastChannel({ serverID: 1, channelID: 10 }));

        store.dispatch(clearTokens());

        expect(localStorage.getItem('lastChannelByServer')).toBeNull();
    });
});
