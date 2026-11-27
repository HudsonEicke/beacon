import { describe, expect, it } from 'vitest';
import { editMessageText, insertMessage, removeMessage, updateSenderProfile } from './messageList';
import { makeMessage, makeReplyPreview } from '@/test/factories';

const ids = (messages: { id: number }[]) => messages.map(message => message.id);

describe('insertMessage', () =>
{
    it('appends a newer message to the end', () =>
    {
        const messages = [makeMessage({ id: 1 }), makeMessage({ id: 2 })];

        insertMessage(messages, makeMessage({ id: 3 }));

        expect(ids(messages)).toEqual([1, 2, 3]);
    });

    it('puts a message that arrives out of order in id order', () =>
    {
        const messages = [makeMessage({ id: 1 }), makeMessage({ id: 3 })];

        insertMessage(messages, makeMessage({ id: 2 }));

        expect(ids(messages)).toEqual([1, 2, 3]);
    });

    it('ignores a message that is already listed', () =>
    {
        const messages = [makeMessage({ id: 1, messageText: 'first copy' })];

        insertMessage(messages, makeMessage({ id: 1, messageText: 'second copy' }));

        expect(messages).toHaveLength(1);
        expect(messages[0].messageText).toBe('first copy');
    });

    it('adds to an empty list', () =>
    {
        const messages: ReturnType<typeof makeMessage>[] = [];

        insertMessage(messages, makeMessage({ id: 5 }));

        expect(ids(messages)).toEqual([5]);
    });
});

describe('editMessageText', () =>
{
    it('changes the text and marks the message edited', () =>
    {
        const messages = [makeMessage({ id: 1 }), makeMessage({ id: 2, messageText: 'untouched' })];

        editMessageText(messages, 1, 'new text');

        expect(messages[0]).toMatchObject({ messageText: 'new text', edited: true });
        expect(messages[1]).toMatchObject({ messageText: 'untouched', edited: false });
    });

    it('updates reply previews of the edited message, shortened', () =>
    {
        const longText = 'a'.repeat(150);
        const messages = [
            makeMessage({ id: 1 }),
            makeMessage({ id: 2, isReply: true, replyToID: 1, replyTo: makeReplyPreview({ id: 1 }) })
        ];

        editMessageText(messages, 1, longText);

        expect(messages[1].replyTo?.messageText).toBe(`${'a'.repeat(100)}…`);
        expect(messages[1].edited).toBe(false);
    });
});

describe('removeMessage', () =>
{
    it('removes the message', () =>
    {
        const messages = [makeMessage({ id: 1 }), makeMessage({ id: 2 })];

        removeMessage(messages, 1);

        expect(ids(messages)).toEqual([2]);
    });

    it('clears the reply target on replies but keeps isReply', () =>
    {
        const messages = [
            makeMessage({ id: 1 }),
            makeMessage({ id: 2, isReply: true, replyToID: 1, replyTo: makeReplyPreview({ id: 1 }) })
        ];

        removeMessage(messages, 1);

        expect(messages[0]).toMatchObject({ id: 2, isReply: true, replyToID: undefined, replyTo: null });
    });

    it('does nothing for an id that is not listed', () =>
    {
        const messages = [makeMessage({ id: 1 })];

        removeMessage(messages, 99);

        expect(ids(messages)).toEqual([1]);
    });
});

describe('updateSenderProfile', () =>
{
    it('updates the sender and reply previews of that user only', () =>
    {
        const messages = [
            makeMessage({ id: 1, senderUsername: 'bob' }),
            makeMessage({ id: 2, senderUsername: 'carol', senderDisplayName: 'Carol', replyTo: makeReplyPreview({ senderUsername: 'bob' }) })
        ];

        updateSenderProfile(messages, 'bob', 'Bobby', 'https://example.com/bob.png');

        expect(messages[0]).toMatchObject({ senderDisplayName: 'Bobby', senderProfileImageUrl: 'https://example.com/bob.png' });
        expect(messages[1].senderDisplayName).toBe('Carol');
        expect(messages[1].replyTo).toMatchObject({ senderDisplayName: 'Bobby', senderProfileImageUrl: 'https://example.com/bob.png' });
    });
});
