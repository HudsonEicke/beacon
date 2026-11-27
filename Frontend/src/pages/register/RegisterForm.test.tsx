import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { RegisterForm } from './RegisterForm';
import { renderWithProviders } from '@/test/renderWithProviders';
import { server, apiUrl } from '@/test/server';

const renderRegisterPage = () => renderWithProviders(
    <Routes>
        <Route path="/register" element={<RegisterForm />} />
        <Route path="/channels/@me" element={<p>Home page</p>} />
    </Routes>,
    { route: '/register' }
);

const fillIn = async (user: ReturnType<typeof renderRegisterPage>['user'], confirmPassword = 'password123') =>
{
    await user.type(screen.getByLabelText('Username'), 'alice');
    await user.type(screen.getByLabelText('Email'), 'alice@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.type(screen.getByLabelText('Confirm Password'), confirmPassword);
    await user.click(screen.getByRole('button', { name: 'Sign up' }));
};

const registerReturns = (status: number, body: string) =>
    server.use(http.post(apiUrl('/auth/register'), () => HttpResponse.text(body, { status })));

describe('RegisterForm', () =>
{
    it('sends only username, email and password, then goes to the home page', async () =>
    {
        const registerBodies: unknown[] = [];
        server.use(http.post(apiUrl('/auth/register'), async ({ request }) =>
        {
            registerBodies.push(await request.json());

            return HttpResponse.json({ success: true, message: '', accessToken: 'access', refreshToken: 'refresh' });
        }));
        const { user } = renderRegisterPage();

        await fillIn(user);

        expect(await screen.findByText('Home page')).toBeInTheDocument();
        expect(registerBodies).toEqual([{ username: 'alice', email: 'alice@example.com', password: 'password123' }]);
    });

    it('stops at mismatched passwords without calling the API', async () =>
    {
        const { user } = renderRegisterPage();

        await fillIn(user, 'different123');

        expect(await screen.findByText("Passwords don't match")).toBeInTheDocument();
    });

    it('shows a taken username under the username field', async () =>
    {
        registerReturns(409, 'Username is already taken');
        const { user } = renderRegisterPage();

        await fillIn(user);

        expect(await screen.findByText('Username is already taken')).toBeInTheDocument();
        expect(screen.getByLabelText('Username')).toHaveAttribute('aria-invalid', 'true');
        expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'false');
    });

    it('marks both fields when the username and email are both taken', async () =>
    {
        registerReturns(409, 'Username and email are already in use');
        const { user } = renderRegisterPage();

        await fillIn(user);

        expect(await screen.findByText('Username already in use')).toBeInTheDocument();
        expect(screen.getByText('Email already in use')).toBeInTheDocument();
    });

    it('shows any other error below the form', async () =>
    {
        registerReturns(429, 'Too many attempts, try again later');
        const { user } = renderRegisterPage();

        await fillIn(user);

        expect(await screen.findByText('Too many attempts, try again later')).toBeInTheDocument();
        expect(screen.getByLabelText('Username')).toHaveAttribute('aria-invalid', 'false');
    });
});
