import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isTokenExpiring } from './jwt';
import { makeJwt } from '@/test/factories';

const NOW = new Date('2026-11-20T12:00:00Z');

describe('isTokenExpiring', () =>
{
    beforeEach(() =>
    {
        vi.useFakeTimers();
        vi.setSystemTime(NOW);
    });

    afterEach(() =>
    {
        vi.useRealTimers();
    });

    it('is false for a token that expires after the margin', () =>
    {
        const token = makeJwt(new Date(NOW.getTime() + 60_000));

        expect(isTokenExpiring(token, 30_000)).toBe(false);
    });

    it('is true for a token that expires within the margin', () =>
    {
        const token = makeJwt(new Date(NOW.getTime() + 10_000));

        expect(isTokenExpiring(token, 30_000)).toBe(true);
    });

    it('is true for a token that has already expired', () =>
    {
        const token = makeJwt(new Date(NOW.getTime() - 1_000));

        expect(isTokenExpiring(token, 0)).toBe(true);
    });

    it.each([
        ['no payload', 'just-a-header'],
        ['a payload that is not base64 JSON', 'header.%%%.signature'],
        ['a payload with no exp claim', `header.${btoa(JSON.stringify({ sub: 'alice' }))}.signature`]
    ])('treats a token with %s as expiring', (_description, token) =>
    {
        expect(isTokenExpiring(token, 0)).toBe(true);
    });
});
