import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import MemberList from './MemberList';
import type { UserResponse } from '@/types';
import type { RootState } from '@/store/store';
import { emptyRootState, renderWithProviders } from '@/test/renderWithProviders';
import { makeDetailedUser, makeUser } from '@/test/factories';
import { server, apiUrl } from '@/test/server';

const alice = makeUser();
const bob = makeUser({ username: 'bob', displayName: 'Bob' });

const renderMemberList = (blockedUsers: UserResponse[] = []) =>
{
    const rootState = emptyRootState();
    const preloadedState: Partial<RootState> = {
        user: { ...rootState.user, user: makeDetailedUser() },
        friend: { ...rootState.friend, blockedUsers, hasLoaded: true }
    };

    return renderWithProviders(
        <MemberList members={[alice, bob]} ownerUsername="alice" loadError={null} onRetry={() => undefined} />,
        { preloadedState }
    );
};

const openMenuFor = async (user: ReturnType<typeof renderMemberList>['user'], displayName: string) =>
{
    await user.pointer({ keys: '[MouseRight]', target: screen.getByText(displayName) });
};

describe('MemberList', () =>
{
    it('has no Block option on your own row', async () =>
    {
        const { user } = renderMemberList();

        await openMenuFor(user, 'Alice');

        expect(await screen.findByRole('menuitem', { name: 'Copy username' })).toBeInTheDocument();
        expect(screen.queryByRole('menuitem', { name: 'Block' })).not.toBeInTheDocument();
    });

    it('blocks a member after confirming', async () =>
    {
        const blockedUsernames: string[] = [];
        server.use(
            http.put(apiUrl('/friends/blocked/:username'), ({ params }) =>
            {
                blockedUsernames.push(String(params.username));

                return new HttpResponse(null, { status: 204 });
            }),
            http.get(apiUrl('/friends/blocked'), () => HttpResponse.json([bob]))
        );
        const { user, store } = renderMemberList();

        await openMenuFor(user, 'Bob');
        await user.click(await screen.findByRole('menuitem', { name: 'Block' }));
        await user.click(await screen.findByRole('button', { name: 'Block' }));

        await expect.poll(() => store.getState().friend.blockedUsers).toEqual([bob]);
        expect(blockedUsernames).toEqual(['bob']);
        await expect.poll(() => screen.queryByRole('alertdialog')).toBeNull();
    });

    it('unblocks a blocked member', async () =>
    {
        const unblockedUsernames: string[] = [];
        server.use(http.delete(apiUrl('/friends/blocked/:username'), ({ params }) =>
        {
            unblockedUsernames.push(String(params.username));

            return new HttpResponse(null, { status: 204 });
        }));
        const { user, store } = renderMemberList([bob]);

        await openMenuFor(user, 'Bob');
        await user.click(await screen.findByRole('menuitem', { name: 'Unblock' }));

        await expect.poll(() => store.getState().friend.blockedUsers).toEqual([]);
        expect(unblockedUsernames).toEqual(['bob']);
    });
});
