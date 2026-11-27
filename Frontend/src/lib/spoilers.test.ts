import { describe, expect, it } from 'vitest';
import { hideSpoilers } from './spoilers';

describe('hideSpoilers', () =>
{
    it('replaces each spoiler with the word Spoiler', () =>
    {
        expect(hideSpoilers('the ending: ||he dies|| and ||she wins||')).toBe('the ending: Spoiler and Spoiler');
    });

    it('leaves text without spoilers alone', () =>
    {
        expect(hideSpoilers('a | b || c')).toBe('a | b || c');
    });

    it('does not match a spoiler split across lines', () =>
    {
        expect(hideSpoilers('||first\nsecond||')).toBe('||first\nsecond||');
    });
});
