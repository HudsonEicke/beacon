import { expect, test } from '../support/fixtures';
import { uniqueName } from '../support/names';

test('a friend request is accepted live, and the friends can message each other in a DM', async ({ createUser, openAs }) =>
{
    const alice = await createUser('alice');
    const bob = await createUser('bob');
    const alicePage = await openAs(alice, '/channels/@me');
    const bobPage = await openAs(bob, '/channels/@me');

    await alicePage.getByRole('tab', { name: 'Add Friend' }).click();
    await alicePage.getByRole('textbox', { name: 'Add Friend' }).fill(bob.username);
    await alicePage.getByRole('button', { name: 'Send Friend Request' }).click();
    await expect(alicePage.getByRole('status').filter({ hasText: bob.username })).toBeVisible();

    await bobPage.getByRole('tab', { name: /^Pending/ }).click();
    await bobPage.getByRole('listitem').filter({ hasText: alice.username }).getByRole('button', { name: 'Accept' }).click();

    await alicePage.getByRole('tab', { name: 'All', exact: true }).click();
    await alicePage.getByRole('listitem').filter({ hasText: bob.username }).getByRole('button', { name: 'Message' }).click();
    await expect(alicePage).toHaveURL(/\/channels\/@me\/\d+$/);

    const aliceMessage = uniqueName('hi bob');
    const aliceComposer = alicePage.getByRole('textbox', { name: `Message @${bob.username}` });
    await aliceComposer.fill(aliceMessage);
    await aliceComposer.press('Enter');

    await bobPage.getByRole('navigation', { name: 'Direct messages' }).getByRole('link').filter({ hasText: alice.username }).click();
    await expect(bobPage.getByRole('list', { name: 'Messages' }).getByText(aliceMessage)).toBeVisible();

    const bobMessage = uniqueName('hi alice');
    const bobComposer = bobPage.getByRole('textbox', { name: `Message @${alice.username}` });
    await bobComposer.fill(bobMessage);
    await bobComposer.press('Enter');
    await expect(alicePage.getByRole('list', { name: 'Messages' }).getByText(bobMessage)).toBeVisible();
});
