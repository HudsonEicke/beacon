import { describe, expect, it } from 'vitest';
import friendReducer, { acceptFriendRequest, blockUser, sendFriendRequest, unblockUser } from './friendSlice';
import { clearTokens } from './authSlice';
import { friendAdded, friendRemoved, friendRequestReceived, userBlocked, userStatusChanged } from './hubEvents';
import { makeUser } from '@/test/factories';
import { ActivityStatus, FriendStatus } from '@/types';

type FriendState = ReturnType<typeof friendReducer>;

const initialState = friendReducer(undefined, { type: 'init' });

const stateWith = (overrides: Partial<FriendState>): FriendState => ({ ...initialState, ...overrides });

const usernames = (users: { username: string }[]) => users.map(user => user.username);

const bob = makeUser({ username: 'bob', displayName: 'Bob' });

describe('friendSlice', () =>
{
    it('adds an outgoing request', () =>
    {
        const state = friendReducer(initialState, sendFriendRequest.fulfilled({ status: FriendStatus.pending, user: bob }, 'request', 'bob'));

        expect(usernames(state.outgoingRequests)).toEqual(['bob']);
    });

    it('becomes friends straight away when they had already sent you a request', () =>
    {
        const state = friendReducer(stateWith({ incomingRequests: [bob] }), sendFriendRequest.fulfilled({ status: FriendStatus.friends, user: bob }, 'request', 'bob'));

        expect(usernames(state.friends)).toEqual(['bob']);
        expect(state.incomingRequests).toEqual([]);
        expect(state.outgoingRequests).toEqual([]);
    });

    it('moves an accepted request to friends only once when the hub event also arrives', () =>
    {
        const afterAccept = friendReducer(stateWith({ incomingRequests: [bob] }), acceptFriendRequest.fulfilled(bob, 'request', 'bob'));
        const afterHub = friendReducer(afterAccept, friendAdded({ user: bob }));

        expect(usernames(afterHub.friends)).toEqual(['bob']);
        expect(afterHub.incomingRequests).toEqual([]);
    });

    it('does not list the same incoming request twice', () =>
    {
        const state = friendReducer(friendReducer(initialState, friendRequestReceived({ user: bob })), friendRequestReceived({ user: bob }));

        expect(usernames(state.incomingRequests)).toEqual(['bob']);
    });

    it('clears a friendship and requests in both directions when removed', () =>
    {
        const state = stateWith({ friends: [bob], incomingRequests: [bob], outgoingRequests: [bob] });

        const afterRemove = friendReducer(state, friendRemoved({ username: 'bob' }));

        expect(afterRemove).toMatchObject({ friends: [], incomingRequests: [], outgoingRequests: [] });
    });

    it('blocking removes the friendship and uses the returned block list', () =>
    {
        const carol = makeUser({ username: 'carol' });
        const state = stateWith({ friends: [bob] });

        const afterBlock = friendReducer(state, blockUser.fulfilled({ username: 'bob', blockedUsers: [carol, bob] }, 'request', 'bob'));

        expect(afterBlock.friends).toEqual([]);
        expect(usernames(afterBlock.blockedUsers)).toEqual(['carol', 'bob']);
    });

    it('a block from another tab removes the friendship and lists the user once', () =>
    {
        const state = stateWith({ friends: [bob], blockedUsers: [bob] });

        const afterBlock = friendReducer(state, userBlocked({ user: bob }));

        expect(afterBlock.friends).toEqual([]);
        expect(usernames(afterBlock.blockedUsers)).toEqual(['bob']);
    });

    it('unblocking does not bring back the old friendship', () =>
    {
        const afterUnblock = friendReducer(stateWith({ blockedUsers: [bob] }), unblockUser.fulfilled('bob', 'request', 'bob'));

        expect(afterUnblock).toMatchObject({ blockedUsers: [], friends: [] });
    });

    it('updates a status in every list the user appears in', () =>
    {
        const state = stateWith({ friends: [bob], blockedUsers: [makeUser({ username: 'carol' })] });

        const afterChange = friendReducer(state, userStatusChanged({ username: 'bob', status: ActivityStatus.dnd }));

        expect(afterChange.friends[0].activityStatus).toBe(ActivityStatus.dnd);
        expect(afterChange.blockedUsers[0].activityStatus).toBe(ActivityStatus.online);
    });

    it('resets on logout', () =>
    {
        expect(friendReducer(stateWith({ friends: [bob], hasLoaded: true }), clearTokens())).toEqual(initialState);
    });
});
