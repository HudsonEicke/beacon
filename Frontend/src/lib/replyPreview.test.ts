import { describe, expect, it } from 'vitest';
import { shortenReplyPreview } from './replyPreview';

describe('shortenReplyPreview', () =>
{
    it('keeps text of 100 characters or fewer', () =>
    {
        const text = 'a'.repeat(100);

        expect(shortenReplyPreview(text)).toBe(text);
    });

    it('cuts longer text to 100 characters and adds an ellipsis', () =>
    {
        expect(shortenReplyPreview('a'.repeat(101))).toBe(`${'a'.repeat(100)}…`);
    });

    it('trims trailing spaces before the ellipsis', () =>
    {
        const text = `${'a'.repeat(97)}   ${'b'.repeat(10)}`;

        expect(shortenReplyPreview(text)).toBe(`${'a'.repeat(97)}…`);
    });

    it('does not split an emoji in half at the cut', () =>
    {
        // the emoji is two UTF-16 code units, at positions 99 and 100
        const text = `${'a'.repeat(99)}😀${'b'.repeat(10)}`;

        expect(shortenReplyPreview(text)).toBe(`${'a'.repeat(99)}…`);
    });
});
