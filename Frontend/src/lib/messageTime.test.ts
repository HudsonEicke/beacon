import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatMessageTime, formatMessageTimestamp, isSameDay, isWithinGroupWindow } from './messageTime';

// the formatters use the machine's locale, so expected times come from formatMessageTime instead of hardcoded strings
describe('formatMessageTimestamp', () =>
{
    beforeEach(() =>
    {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-11-20T15:00:00Z'));
    });

    afterEach(() =>
    {
        vi.useRealTimers();
    });

    it('says Today for a message from today', () =>
    {
        const date = new Date('2026-11-20T09:30:00Z');

        expect(formatMessageTimestamp(date)).toBe(`Today at ${formatMessageTime(date)}`);
    });

    it('says Yesterday for a message from yesterday', () =>
    {
        const date = new Date('2026-11-19T23:59:00Z');

        expect(formatMessageTimestamp(date)).toBe(`Yesterday at ${formatMessageTime(date)}`);
    });

    it('shows the date for older messages', () =>
    {
        const date = new Date('2026-11-18T09:30:00Z');
        const result = formatMessageTimestamp(date);

        expect(result).not.toMatch(/^(Today|Yesterday)/);
        expect(result.endsWith(`, ${formatMessageTime(date)}`)).toBe(true);
    });
});

describe('isSameDay', () =>
{
    it('is true for two times on the same day', () =>
    {
        expect(isSameDay(new Date('2026-11-20T00:00:00Z'), new Date('2026-11-20T23:59:59Z'))).toBe(true);
    });

    it('is false across midnight', () =>
    {
        expect(isSameDay(new Date('2026-11-20T23:59:59Z'), new Date('2026-11-21T00:00:00Z'))).toBe(false);
    });

    it('is false for the same day in different months', () =>
    {
        expect(isSameDay(new Date('2026-10-20T12:00:00Z'), new Date('2026-11-20T12:00:00Z'))).toBe(false);
    });
});

describe('isWithinGroupWindow', () =>
{
    const earlier = new Date('2026-11-20T12:00:00Z');

    it('is true just under 5 minutes apart', () =>
    {
        expect(isWithinGroupWindow(earlier, new Date('2026-11-20T12:04:59Z'))).toBe(true);
    });

    it('is false at exactly 5 minutes apart', () =>
    {
        expect(isWithinGroupWindow(earlier, new Date('2026-11-20T12:05:00Z'))).toBe(false);
    });
});
