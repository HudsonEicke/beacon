import { describe, expect, it } from 'vitest';
import { registerServerEvents } from './serverEvents';
import { createFakeHubConnection } from '@/test/fakeHubConnection';
import { emptyRootState, setupTestStore } from '@/test/renderWithProviders';
import { makeDetailedUser, makeServer, makeUser } from '@/test/factories';

const emptyState = emptyRootState();

// signed in as alice, in server 1 with bob, whose members are loaded
const setup = () =>
{
    const store = setupTestStore({
        user: { ...emptyState.user, user: makeDetailedUser({ username: 'alice' }) },
        server: {
            ...emptyState.server,
            servers: [makeServer({ serverID: 1 })],
            membersByServer: { 1: [makeUser({ username: 'alice' }), makeUser({ username: 'bob' })] }
        }
    });
    const { connection, emit } = createFakeHubConnection();
    registerServerEvents(connection, store);

    return { store, emit };
};

describe('server hub events', () =>
{
    it.each(['MemberLeft', 'MemberKicked'] as const)('removes the server when %s is about you', (eventName) =>
    {
        const { store, emit } = setup();

        emit(eventName, 1, 'alice');

        expect(store.getState().server.servers).toEqual([]);
    });

    it.each(['MemberLeft', 'MemberKicked'] as const)('removes only that member when %s is about someone else', (eventName) =>
    {
        const { store, emit } = setup();

        emit(eventName, 1, 'bob');

        expect(store.getState().server.servers).toHaveLength(1);
        expect(store.getState().server.membersByServer[1].map(member => member.username)).toEqual(['alice']);
    });

    it('removes a deleted server', () =>
    {
        const { store, emit } = setup();

        emit('ServerDeleted', 1);

        expect(store.getState().server.servers).toEqual([]);
    });
});
