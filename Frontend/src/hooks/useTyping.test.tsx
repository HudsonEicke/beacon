import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';
import { useTyping } from './useTyping';
import { sendHubMessage } from '@/services/hub/connection';
import { emptyRootState, setupTestStore } from '@/test/renderWithProviders';
import { makeDetailedUser, makeSentMessage } from '@/test/factories';

type HubHandler = (...args: unknown[]) => void;

const hubHandlers = vi.hoisted(() => new Map<string, Set<HubHandler>>());

vi.mock('@/services/hub/connection', () => ({
    subscribeHubEvent: (eventName: string, handler: HubHandler) =>
    {
        const handlers = hubHandlers.get(eventName) ?? new Set<HubHandler>();
        handlers.add(handler);
        hubHandlers.set(eventName, handlers);

        return () => handlers.delete(handler);
    },
    sendHubMessage: vi.fn()
}));

const emit = (eventName: string, ...args: unknown[]) =>
{
    act(() => hubHandlers.get(eventName)?.forEach(handler => handler(...args)));
};

// signed in as alice
const renderTyping = (kind: 'channel' | 'conversation', targetId: number) =>
{
    const store = setupTestStore({ user: { ...emptyRootState().user, user: makeDetailedUser({ username: 'alice' }) } });
    const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;

    return renderHook(() => useTyping(kind, targetId), { wrapper });
};

describe('useTyping', () =>
{
    beforeEach(() =>
    {
        vi.useFakeTimers();
        hubHandlers.clear();
    });

    afterEach(() =>
    {
        vi.useRealTimers();
    });

    it('shows someone typing in this channel and ignores other channels', () =>
    {
        const { result } = renderTyping('channel', 10);

        emit('ChannelTyping', 10, 'bob', 'Bob');
        emit('ChannelTyping', 11, 'carol', 'Carol');

        expect(result.current.typingUsers).toEqual([{ username: 'bob', displayName: 'Bob' }]);
    });

    it('does not show you typing in another tab', () =>
    {
        const { result } = renderTyping('channel', 10);

        emit('ChannelTyping', 10, 'alice', 'Alice');

        expect(result.current.typingUsers).toEqual([]);
    });

    it('stops showing someone 8 seconds after their last ping', () =>
    {
        const { result } = renderTyping('channel', 10);
        emit('ChannelTyping', 10, 'bob', 'Bob');

        act(() => vi.advanceTimersByTime(7_000));
        expect(result.current.typingUsers).toHaveLength(1);

        act(() => vi.advanceTimersByTime(1_000));
        expect(result.current.typingUsers).toEqual([]);
    });

    it('keeps showing someone whose pings keep coming', () =>
    {
        const { result } = renderTyping('channel', 10);

        emit('ChannelTyping', 10, 'bob', 'Bob');
        act(() => vi.advanceTimersByTime(5_000));
        emit('ChannelTyping', 10, 'bob', 'Bob');
        act(() => vi.advanceTimersByTime(5_000));

        expect(result.current.typingUsers).toEqual([{ username: 'bob', displayName: 'Bob' }]);
    });

    it('stops showing someone as soon as their message arrives', () =>
    {
        const { result } = renderTyping('conversation', 3);
        emit('ConversationTyping', 3, 'bob', 'Bob');

        emit('ReceiveConversationMessage', 3, makeSentMessage({ senderUsername: 'bob' }));

        expect(result.current.typingUsers).toEqual([]);
    });

    it('sends at most one typing ping every 5 seconds', () =>
    {
        const { result } = renderTyping('channel', 10);

        act(() => result.current.notifyTyping());
        act(() => vi.advanceTimersByTime(4_000));
        act(() => result.current.notifyTyping());
        act(() => vi.advanceTimersByTime(1_000));
        act(() => result.current.notifyTyping());

        expect(vi.mocked(sendHubMessage).mock.calls).toEqual([['StartChannelTyping', 10], ['StartChannelTyping', 10]]);
    });

    it('pings again straight away after a message is sent', () =>
    {
        const { result } = renderTyping('conversation', 3);

        act(() => result.current.notifyTyping());
        act(() => result.current.resetPing());
        act(() => result.current.notifyTyping());

        expect(vi.mocked(sendHubMessage).mock.calls).toEqual([['StartConversationTyping', 3], ['StartConversationTyping', 3]]);
    });

    it('unsubscribes from the hub when unmounted', () =>
    {
        const { unmount } = renderTyping('channel', 10);

        unmount();

        expect(hubHandlers.get('ChannelTyping')?.size).toBe(0);
    });
});
