import { describe, expect, it } from 'vitest';
import { isWebUrl } from './url';

describe('isWebUrl', () =>
{
    it.each(['https://example.com/a.png', 'http://example.com'])('accepts %s', (value) =>
    {
        expect(isWebUrl(value)).toBe(true);
    });

    it.each([
        'javascript:alert(1)',
        'data:image/png;base64,AAAA',
        'ftp://example.com/file',
        'example.com/a.png',
        ''
    ])('rejects %s', (value) =>
    {
        expect(isWebUrl(value)).toBe(false);
    });
});
