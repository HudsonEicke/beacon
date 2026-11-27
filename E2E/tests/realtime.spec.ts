import { createServerWithChannel } from '../support/api';
import { expect, test } from '../support/fixtures';
import { uniqueName } from '../support/names';

test('someone who joins with an invite sees typing and messages live', async ({ createUser, openAs, request }) =>
{
    const owner = await createUser('owner');
    const member = await createUser('member');
    const serverName = uniqueName('Server');
    const { serverID, channelID } = await createServerWithChannel(request, owner, serverName, 'general');
    const channelPath = `/channels/${serverID}/${channelID}`;

    const ownerPage = await openAs(owner, channelPath);
    await ownerPage.getByRole('heading', { name: serverName, exact: true }).getByRole('button').click();
    await ownerPage.getByRole('menuitem', { name: 'Invite people' }).click();
    const inviteDialog = ownerPage.getByRole('dialog');
    await inviteDialog.getByRole('button', { name: 'Generate invite' }).click();
    const inviteCodeInput = inviteDialog.getByLabel('Invite code');
    await expect(inviteCodeInput).not.toHaveValue('');
    const inviteCode = await inviteCodeInput.inputValue();
    await ownerPage.keyboard.press('Escape');
    await expect(inviteDialog).toBeHidden();

    const memberPage = await openAs(member, '/channels/@me');
    await memberPage.getByRole('button', { name: 'Add a server' }).click();
    const addServerDialog = memberPage.getByRole('dialog');
    await addServerDialog.getByRole('tab', { name: 'Join' }).click();
    await addServerDialog.getByLabel('Invite code').fill(inviteCode);
    await addServerDialog.getByRole('button', { name: 'Continue' }).click();
    await expect(addServerDialog.getByText(serverName)).toBeVisible();
    await addServerDialog.getByRole('button', { name: 'Join server' }).click();
    await expect(memberPage).toHaveURL(channelPath);

    const memberMessage = uniqueName('hello from the member');
    const memberComposer = memberPage.getByRole('textbox', { name: 'Message #general' });
    await memberComposer.fill(memberMessage);
    await expect(ownerPage.getByText(`${member.username} is typing…`)).toBeVisible();

    await memberComposer.press('Enter');
    await expect(ownerPage.getByRole('list', { name: 'Messages' }).getByText(memberMessage)).toBeVisible();

    const ownerMessage = uniqueName('welcome from the owner');
    const ownerComposer = ownerPage.getByRole('textbox', { name: 'Message #general' });
    await ownerComposer.fill(ownerMessage);
    await ownerComposer.press('Enter');
    await expect(memberPage.getByRole('list', { name: 'Messages' }).getByText(ownerMessage)).toBeVisible();
});
