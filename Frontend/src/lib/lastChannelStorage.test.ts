import { describe, expect, it } from 'vitest';
import { clearLastChannels, loadLastChannels, saveLastChannels } from './lastChannelStorage';

const KEY = 'lastChannelByServer';

describe('lastChannelStorage', () =>
{
    it('loads what was saved', () =>
    {
        saveLastChannels({ 1: 10, 2: 20 });

        expect(loadLastChannels()).toEqual({ 1: 10, 2: 20 });
    });

    it('returns an empty map when nothing is stored', () =>
    {
        expect(loadLastChannels()).toEqual({});
    });

    it('returns an empty map for invalid JSON', () =>
    {
        localStorage.setItem(KEY, '{not json');

        expect(loadLastChannels()).toEqual({});
    });

    it.each([
        ['an array', '[1, 2]'],
        ['null', 'null'],
        ['a number', '5']
    ])('returns an empty map when the stored value is %s', (_description, stored) =>
    {
        localStorage.setItem(KEY, stored);

        expect(loadLastChannels()).toEqual({});
    });

    it('drops pairs that are not positive whole-number ids', () =>
    {
        localStorage.setItem(KEY, JSON.stringify({ 1: 10, abc: 20, 2: 'x', 3: -1, 4: 1.5, 0: 7, 5: 50 }));

        expect(loadLastChannels()).toEqual({ 1: 10, 5: 50 });
    });

    it('clears the stored map', () =>
    {
        saveLastChannels({ 1: 10 });

        clearLastChannels();

        expect(localStorage.getItem(KEY)).toBeNull();
    });
});
