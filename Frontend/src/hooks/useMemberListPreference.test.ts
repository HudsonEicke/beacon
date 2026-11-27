import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useMemberListPreference } from './useMemberListPreference';

describe('useMemberListPreference', () =>
{
    it('starts open when nothing is saved', () =>
    {
        const { result } = renderHook(() => useMemberListPreference());

        expect(result.current.isOpen).toBe(true);
    });

    it('saves the choice and starts closed next time', () =>
    {
        const { result } = renderHook(() => useMemberListPreference());

        act(() => result.current.toggle());

        expect(result.current.isOpen).toBe(false);
        expect(renderHook(() => useMemberListPreference()).result.current.isOpen).toBe(false);
    });
});
