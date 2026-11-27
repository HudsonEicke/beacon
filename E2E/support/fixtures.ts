import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';
import { uniqueName } from './names';

export interface TestUser
{
    username: string;
    email: string;
    password: string;
    accessToken: string;
    refreshToken: string;
}

interface Fixtures
{
    createUser: (prefix: string) => Promise<TestUser>;
    openAs: (user: TestUser, path: string) => Promise<Page>;
}

const PASSWORD = 'e2e-password-123';
const HUB_READY_TIMEOUT_MS = 15_000;

export const test = base.extend<Fixtures>({
    createUser: async ({ request }, use) =>
    {
        await use(async prefix =>
        {
            const username = uniqueName(prefix);
            const email = `${username}@example.com`;

            const response = await request.post('/api/auth/register', { data: { username, email, password: PASSWORD } });
            expect(response, await response.text()).toBeOK();
            const { accessToken, refreshToken } = await response.json() as { accessToken: string; refreshToken: string };

            return { username, email, password: PASSWORD, accessToken, refreshToken };
        });
    },

    // a separate browser context per user, logged in by putting their tokens where the app keeps them
    openAs: async ({ browser, baseURL }, use) =>
    {
        const contexts: BrowserContext[] = [];

        await use(async (user, path) =>
        {
            const context = await browser.newContext({
                baseURL,
                storageState: {
                    cookies: [],
                    origins: [{
                        origin: new URL(baseURL!).origin,
                        localStorage: [
                            { name: 'accessToken', value: user.accessToken },
                            { name: 'refreshToken', value: user.refreshToken },
                        ],
                    }],
                }
            });
            contexts.push(context);
            const page = await context.newPage();

            // live updates sent before the hub connects are never delivered, so wait for the SignalR handshake reply;
            // this also fails if WebSockets don't get through Caddy and SignalR falls back to another transport
            let isHubConnected = false;
            page.on('websocket', webSocket =>
            {
                if (webSocket.url().includes('/hubs/chat'))
                {
                    webSocket.on('framereceived', frame =>
                    {
                        if (String(frame.payload).startsWith('{}'))
                        {
                            isHubConnected = true;
                        }
                    });
                }
            });

            await page.goto(path);
            await expect.poll(() => isHubConnected, { message: `the chat hub to connect for ${user.username}`, timeout: HUB_READY_TIMEOUT_MS }).toBe(true);

            return page;
        });

        await Promise.all(contexts.map(context => context.close()));
    },
});

export { expect };
