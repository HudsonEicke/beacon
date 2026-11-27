import type { FullConfig } from '@playwright/test';

const READY_TIMEOUT_MS = 120_000;
const RETRY_DELAY_MS = 2_000;

// waits for Caddy and the API behind it, since the API has no healthcheck the stack can wait on
export default async function globalSetup(config: FullConfig)
{
    const baseURL = config.projects[0].use.baseURL;
    const probeUrl = `${baseURL}/api/servers`;
    const deadline = Date.now() + READY_TIMEOUT_MS;

    while (Date.now() < deadline)
    {
        try
        {
            const response = await fetch(probeUrl);

            if (response.status === 401)
            {
                return;
            }
        }
        catch
        {
            // not accepting connections yet
        }

        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    }

    throw new Error(`The app at ${baseURL} wasn't ready after ${READY_TIMEOUT_MS / 1000}s. Is the E2E stack running?`);
}
