import { describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useActiveIds } from './useActiveIds';

const renderAt = (path: string, url: string) =>
{
    const wrapper = ({ children }: { children: ReactNode }) => (
        <MemoryRouter initialEntries={[url]}>
            <Routes>
                <Route path={path} element={children} />
            </Routes>
        </MemoryRouter>
    );

    return renderHook(() => useActiveIds(), { wrapper }).result.current;
};

describe('useActiveIds', () =>
{
    it('reads the server and channel ids from a channel URL', () =>
    {
        expect(renderAt('/channels/:serverId/:channelId', '/channels/4/12')).toEqual({ serverId: 4, channelId: 12, conversationId: null });
    });

    it('reads the conversation id from a DM URL', () =>
    {
        expect(renderAt('/channels/@me/:conversationId', '/channels/@me/7')).toEqual({ serverId: null, channelId: null, conversationId: 7 });
    });

    it.each(['abc', '0', '-3', '1.5'])('treats "%s" as no id', (value) =>
    {
        expect(renderAt('/channels/:serverId', `/channels/${value}`).serverId).toBeNull();
    });
});
