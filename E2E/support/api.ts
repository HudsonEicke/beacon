import { expect, type APIRequestContext } from '@playwright/test';
import type { TestUser } from './fixtures';

interface ServerWithChannel
{
    serverID: number;
    channelID: number;
}

const authHeaders = (user: TestUser) => ({ Authorization: `Bearer ${user.accessToken}` });

// setup that isn't what a test is about goes through the API, so the browser steps stay focused and fast
export const createServerWithChannel = async (request: APIRequestContext, owner: TestUser, serverName: string, channelName: string): Promise<ServerWithChannel> =>
{
    const serverResponse = await request.post('/api/servers', { headers: authHeaders(owner), data: { serverName } });
    expect(serverResponse, await serverResponse.text()).toBeOK();
    const { serverID } = await serverResponse.json() as { serverID: number };

    const channelResponse = await request.post(`/api/servers/${serverID}/channels`, { headers: authHeaders(owner), data: { channelName } });
    expect(channelResponse, await channelResponse.text()).toBeOK();
    const { channelID } = await channelResponse.json() as { channelID: number };

    return { serverID, channelID };
};
