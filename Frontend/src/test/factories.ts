import { ActivityStatus, ConversationType } from '@/types';
import type { ChannelResponse, ConversationResponse, InviteResponse, MessageReplyPreview, MessageResponse, SendMessageResponse, ServerResponse, UserDetailedResponse, UserResponse } from '@/types';
import type { RootState } from '@/store/store';

export const makeUser = (overrides: Partial<UserResponse> = {}): UserResponse => ({
    username: 'alice',
    displayName: 'Alice',
    profileImageUrl: '',
    activityStatus: ActivityStatus.online,
    accountCreationTime: '2026-01-01T00:00:00Z',
    ...overrides
});

export const makeDetailedUser = (overrides: Partial<UserDetailedResponse> = {}): UserDetailedResponse => ({
    ...makeUser(),
    email: 'alice@example.com',
    ...overrides
});

export const makeReplyPreview = (overrides: Partial<MessageReplyPreview> = {}): MessageReplyPreview => ({
    id: 1,
    messageText: 'Original message',
    senderUsername: 'bob',
    senderDisplayName: 'Bob',
    senderProfileImageUrl: '',
    ...overrides
});

export const makeMessage = (overrides: Partial<MessageResponse> = {}): MessageResponse => ({
    id: 1,
    messageText: 'Hello',
    senderUsername: 'bob',
    senderDisplayName: 'Bob',
    senderProfileImageUrl: '',
    timeSent: '2026-11-20T12:00:00Z',
    edited: false,
    isReply: false,
    replyTo: null,
    ...overrides
});

// the hub sends messages without the edited flag
export const makeSentMessage = (overrides: Partial<SendMessageResponse> = {}): SendMessageResponse => ({
    id: 1,
    messageText: 'Hello',
    senderUsername: 'bob',
    senderDisplayName: 'Bob',
    senderProfileImageUrl: '',
    timeSent: '2026-11-20T12:00:00Z',
    isReply: false,
    replyTo: null,
    ...overrides
});

export const makeServer = (overrides: Partial<ServerResponse> = {}): ServerResponse => ({
    serverID: 1,
    ownerUsername: 'alice',
    serverName: 'Test Server',
    iconUrl: '',
    hasUnread: false,
    ...overrides
});

export const makeChannel = (overrides: Partial<ChannelResponse> = {}): ChannelResponse => ({
    channelID: 1,
    channelName: 'general',
    channelOrder: 0,
    hasUnread: false,
    ...overrides
});

export const makeConversation = (overrides: Partial<ConversationResponse> = {}): ConversationResponse => ({
    id: 1,
    conversationName: 'Bob',
    otherUsername: 'bob',
    iconUrl: '',
    conversationType: ConversationType.direct,
    lastMessageID: null,
    unreadCount: 0,
    ...overrides
});

export const makeInvite = (overrides: Partial<InviteResponse> = {}): InviteResponse => ({
    inviteCode: '3f2b8c1e-4a5d-4e6f-8a9b-0c1d2e3f4a5b',
    createdByUsername: 'alice',
    createdDate: '2026-11-01T00:00:00Z',
    expiresDate: null,
    maxUses: null,
    uses: 0,
    ...overrides
});

export const makeAuthState = (overrides: Partial<RootState['auth']> = {}): RootState['auth'] => ({
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    isAuthenticated: true,
    status: 'idle',
    error: null,
    ...overrides
});

// an unsigned JWT; the client only reads its exp claim
export const makeJwt = (expiresAt: Date): string =>
{
    const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

    return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ exp: Math.floor(expiresAt.getTime() / 1000) })}.signature`;
};
