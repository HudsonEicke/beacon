import { describe, expect, it } from 'vitest';
import { joinServerSchema } from './JoinServerForm.schema';

const CODE = '3f2b8c1e-4a5d-4e6f-8a9b-0c1d2e3f4a5b';

describe('joinServerSchema', () =>
{
    it.each([
        ['a bare code', CODE],
        ['a code with spaces around it', `  ${CODE}  `],
        ['an uppercase code', CODE.toUpperCase()],
        ['a pasted invite link', `https://beaconchat.org/invite/${CODE}`],
        ['a sentence containing a code', `join us! ${CODE} see you there`]
    ])('pulls the lowercase code out of %s', (_description, value) =>
    {
        expect(joinServerSchema.parse({ inviteCode: value })).toEqual({ inviteCode: CODE });
    });

    it('requires a code', () =>
    {
        const result = joinServerSchema.safeParse({ inviteCode: '   ' });

        expect(result.error?.issues[0].message).toBe('Invite code is required');
    });

    it('rejects text with no code in it', () =>
    {
        const result = joinServerSchema.safeParse({ inviteCode: 'not-a-code' });

        expect(result.error?.issues[0].message).toBe('Enter a valid invite code');
    });
});
