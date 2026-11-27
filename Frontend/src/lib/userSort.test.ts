import { describe, expect, it } from 'vitest';
import { byDisplayName } from './userSort';
import { makeUser } from '@/test/factories';

describe('byDisplayName', () =>
{
    it('sorts by display name, ignoring case and accents', () =>
    {
        const users = [
            makeUser({ username: 'c', displayName: 'charlie' }),
            makeUser({ username: 'e', displayName: 'Émile' }),
            makeUser({ username: 'a', displayName: 'Alice' }),
            makeUser({ username: 'b', displayName: 'bob' })
        ];

        expect(users.sort(byDisplayName).map(user => user.displayName)).toEqual(['Alice', 'bob', 'charlie', 'Émile']);
    });

    it('treats names that differ only in case as equal', () =>
    {
        expect(byDisplayName(makeUser({ displayName: 'alice' }), makeUser({ displayName: 'ALICE' }))).toBe(0);
    });
});
