import { describe, expect, it } from 'vitest';
import { getBlockedRuns } from './blockedRuns';
import { makeMessage } from '@/test/factories';

const blocked = new Set(['mallory']);

describe('getBlockedRuns', () =>
{
    it('groups back-to-back blocked messages under the first one', () =>
    {
        const messages = [
            makeMessage({ id: 1, senderUsername: 'bob' }),
            makeMessage({ id: 2, senderUsername: 'mallory' }),
            makeMessage({ id: 3, senderUsername: 'mallory' }),
            makeMessage({ id: 4, senderUsername: 'bob' })
        ];

        const { runStartById, runIdsByStart } = getBlockedRuns(messages, blocked);

        expect(runIdsByStart).toEqual(new Map([[2, [2, 3]]]));
        expect(runStartById).toEqual(new Map([[2, 2], [3, 2]]));
    });

    it('starts a new run after a message from someone not blocked', () =>
    {
        const messages = [
            makeMessage({ id: 1, senderUsername: 'mallory' }),
            makeMessage({ id: 2, senderUsername: 'bob' }),
            makeMessage({ id: 3, senderUsername: 'mallory' })
        ];

        const { runIdsByStart } = getBlockedRuns(messages, blocked);

        expect(runIdsByStart).toEqual(new Map([[1, [1]], [3, [3]]]));
    });

    it('starts a new run on a new day so the day divider still shows', () =>
    {
        const messages = [
            makeMessage({ id: 1, senderUsername: 'mallory', timeSent: '2026-11-20T23:59:00Z' }),
            makeMessage({ id: 2, senderUsername: 'mallory', timeSent: '2026-11-21T00:01:00Z' })
        ];

        const { runIdsByStart } = getBlockedRuns(messages, blocked);

        expect(runIdsByStart).toEqual(new Map([[1, [1]], [2, [2]]]));
    });

    it('returns empty maps when nobody is blocked', () =>
    {
        const { runStartById, runIdsByStart } = getBlockedRuns([makeMessage({ id: 1 })], new Set());

        expect(runStartById.size).toBe(0);
        expect(runIdsByStart.size).toBe(0);
    });
});
