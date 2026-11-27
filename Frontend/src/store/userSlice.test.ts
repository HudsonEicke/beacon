import { describe, expect, it } from 'vitest';
import userReducer, { fetchMe, updateMyStatus, updateProfile } from './userSlice';
import { clearTokens } from './authSlice';
import { userStatusChanged, userUpdated } from './hubEvents';
import { makeDetailedUser, makeUser } from '@/test/factories';
import { ActivityStatus } from '@/types';

const initialState = userReducer(undefined, { type: 'init' });

const signedIn = () => userReducer(initialState, fetchMe.fulfilled(makeDetailedUser({ username: 'alice' }), 'request'));

describe('userSlice', () =>
{
    it('stores the signed-in user', () =>
    {
        expect(signedIn()).toMatchObject({ status: 'succeeded', user: { username: 'alice' } });
    });

    it('sets the picked status once the request succeeds', () =>
    {
        const state = userReducer(signedIn(), updateMyStatus.fulfilled(undefined, 'request', ActivityStatus.away));

        expect(state.user?.activityStatus).toBe(ActivityStatus.away);
    });

    it('takes the saved name and avatar from the profile response', () =>
    {
        const response = makeUser({ username: 'alice', displayName: 'Alicia', profileImageUrl: 'https://example.com/a.png' });

        const state = userReducer(signedIn(), updateProfile.fulfilled(response, 'request', { displayName: 'Alicia', profileImageUrl: 'https://example.com/a.png' }));

        expect(state.user).toMatchObject({ displayName: 'Alicia', profileImageUrl: 'https://example.com/a.png' });
    });

    it('follows hub updates about yourself and ignores everyone else', () =>
    {
        const afterOwn = userReducer(signedIn(), userStatusChanged({ username: 'alice', status: ActivityStatus.dnd }));
        const afterOther = userReducer(afterOwn, userUpdated({ username: 'bob', displayName: 'Bobby', profileImageUrl: '' }));

        expect(afterOther.user).toMatchObject({ activityStatus: ActivityStatus.dnd, displayName: 'Alice' });
    });

    it('resets on logout', () =>
    {
        expect(userReducer(signedIn(), clearTokens())).toEqual(initialState);
    });
});
