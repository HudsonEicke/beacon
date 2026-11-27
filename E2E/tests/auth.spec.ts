import { expect, test } from '../support/fixtures';
import { uniqueName } from '../support/names';

test('registers a new account and lands on the friends page', async ({ page }) =>
{
    const username = uniqueName('newuser');

    await page.goto('/register');
    await page.getByLabel('Username').fill(username);
    await page.getByLabel('Email').fill(`${username}@example.com`);
    await page.getByLabel('Password', { exact: true }).fill('e2e-password-123');
    await page.getByLabel('Confirm Password').fill('e2e-password-123');
    await page.getByRole('button', { name: 'Sign up' }).click();

    await expect(page).toHaveURL('/channels/@me');
    await expect(page.getByRole('region', { name: 'Friends' })).toBeVisible();
});

test('logs in, logs out, and needs to log in again to get back in', async ({ page, createUser }) =>
{
    const user = await createUser('login');

    await page.goto('/login');
    await page.getByLabel('Username').fill(user.username);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page).toHaveURL('/channels/@me');

    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page).toHaveURL('/login');

    await page.goto('/channels/@me');
    await expect(page).toHaveURL('/login');
});

test('refuses a wrong password', async ({ page, createUser }) =>
{
    const user = await createUser('wrongpw');

    await page.goto('/login');
    await page.getByLabel('Username').fill(user.username);
    await page.getByLabel('Password').fill('not-the-password');
    await page.getByRole('button', { name: 'Login' }).click();

    await expect(page.getByText('Invalid username or password')).toBeVisible();
    await expect(page).toHaveURL('/login');
});

test('sends a logged-out visitor to the login page', async ({ page }) =>
{
    await page.goto('/channels/@me');

    await expect(page).toHaveURL('/login');
});
