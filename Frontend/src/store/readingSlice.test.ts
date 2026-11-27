import { describe, expect, it } from 'vitest';
import readingReducer, { startReadingChannel, startReadingConversation, stopReadingChannel, stopReadingConversation } from './readingSlice';
import { clearTokens } from './authSlice';

const initialState = readingReducer(undefined, { type: 'init' });

describe('readingSlice', () =>
{
    it('stops reading the channel it was reading', () =>
    {
        const state = readingReducer(readingReducer(initialState, startReadingChannel(1)), stopReadingChannel(1));

        expect(state.channelID).toBeNull();
    });

    it('ignores a late stop from the previous channel after the next one started', () =>
    {
        const state = [startReadingChannel(1), startReadingChannel(2), stopReadingChannel(1)].reduce(readingReducer, initialState);

        expect(state.channelID).toBe(2);
    });

    it('ignores a late stop from the previous conversation after the next one started', () =>
    {
        const state = [startReadingConversation(1), startReadingConversation(2), stopReadingConversation(1)].reduce(readingReducer, initialState);

        expect(state.conversationID).toBe(2);
    });

    it('resets on logout', () =>
    {
        expect(readingReducer(readingReducer(initialState, startReadingChannel(1)), clearTokens())).toEqual(initialState);
    });
});
