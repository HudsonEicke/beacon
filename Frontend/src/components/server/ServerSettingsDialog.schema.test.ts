import { describe, expect, it } from 'vitest';
import { serverOverviewSchema } from './ServerSettingsDialog.schema';

describe('serverOverviewSchema', () =>
{
    it('trims the name and allows an empty icon', () =>
    {
        expect(serverOverviewSchema.parse({ serverName: '  My Server  ', iconUrl: '' })).toEqual({ serverName: 'My Server', iconUrl: '' });
    });

    it('requires a name, since the backend ignores a blank one', () =>
    {
        const result = serverOverviewSchema.safeParse({ serverName: '   ', iconUrl: '' });

        expect(result.error?.issues[0]).toMatchObject({ path: ['serverName'], message: 'Server name is required' });
    });

    it('rejects an icon URL that is not http or https', () =>
    {
        const result = serverOverviewSchema.safeParse({ serverName: 'My Server', iconUrl: 'data:image/png;base64,AAAA' });

        expect(result.error?.issues[0]).toMatchObject({ path: ['iconUrl'], message: 'Enter a valid http or https URL' });
    });
});
