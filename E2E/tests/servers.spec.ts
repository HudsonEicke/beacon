import { expect, test } from '../support/fixtures';
import { uniqueName } from '../support/names';

test('creates a server and channel, and a sent message is still there after a reload', async ({ createUser, openAs }) =>
{
    const owner = await createUser('owner');
    const serverName = uniqueName('Server');
    const messageText = uniqueName('first message');
    const page = await openAs(owner, '/channels/@me');

    await page.getByRole('button', { name: 'Add a server' }).click();
    const addServerDialog = page.getByRole('dialog');
    await addServerDialog.getByLabel('Server name').fill(serverName);
    await addServerDialog.getByRole('button', { name: 'Create server' }).click();
    await expect(page).toHaveURL(/\/channels\/\d+$/);

    await page.getByRole('button', { name: 'Create channel' }).click();
    const createChannelDialog = page.getByRole('dialog');
    await createChannelDialog.getByLabel('Channel name').fill('general');
    await createChannelDialog.getByRole('button', { name: 'Create channel' }).click();
    await expect(page).toHaveURL(/\/channels\/\d+\/\d+$/);
    await expect(page.getByRole('navigation', { name: 'Channels' }).getByRole('link', { name: 'general' })).toBeVisible();

    const composer = page.getByRole('textbox', { name: 'Message #general' });
    await composer.fill(messageText);
    await composer.press('Enter');

    const messages = page.getByRole('list', { name: 'Messages' });
    await expect(messages.getByText(messageText)).toBeVisible();
    await expect(composer).toHaveValue('');

    await page.reload();
    await expect(messages.getByText(messageText)).toBeVisible();
});
