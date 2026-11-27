import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { LoginForm } from './LoginForm';
import { renderWithProviders } from '@/test/renderWithProviders';
import { server, apiUrl } from '@/test/server';

const renderLoginPage = () => renderWithProviders(
    <Routes>
        <Route path="/login" element={<LoginForm />} />
        <Route path="/channels/@me" element={<p>Home page</p>} />
    </Routes>,
    { route: '/login' }
);

describe('LoginForm', () =>
{
    it('shows required-field errors without calling the API', async () =>
    {
        const { user } = renderLoginPage();

        await user.click(screen.getByRole('button', { name: 'Login' }));

        expect(await screen.findByText('Username is required')).toBeInTheDocument();
        expect(screen.getByText('Password is required')).toBeInTheDocument();
        expect(screen.getByLabelText('Username')).toHaveAttribute('aria-invalid', 'true');
    });

    it('logs in and goes to the home page', async () =>
    {
        const loginBodies: unknown[] = [];
        server.use(http.post(apiUrl('/auth/login'), async ({ request }) =>
        {
            loginBodies.push(await request.json());

            return HttpResponse.json({ success: true, message: '', accessToken: 'access', refreshToken: 'refresh' });
        }));
        const { user, store } = renderLoginPage();

        await user.type(screen.getByLabelText('Username'), 'alice');
        await user.type(screen.getByLabelText('Password'), 'password123');
        await user.click(screen.getByRole('button', { name: 'Login' }));

        expect(await screen.findByText('Home page')).toBeInTheDocument();
        expect(loginBodies).toEqual([{ username: 'alice', password: 'password123' }]);
        expect(store.getState().auth.isAuthenticated).toBe(true);
    });

    it('shows an error and stays on the page when the login is refused', async () =>
    {
        server.use(http.post(apiUrl('/auth/login'), () => new HttpResponse(null, { status: 401 })));
        const { user } = renderLoginPage();

        await user.type(screen.getByLabelText('Username'), 'alice');
        await user.type(screen.getByLabelText('Password'), 'wrong-password');
        await user.click(screen.getByRole('button', { name: 'Login' }));

        expect(await screen.findByText('Invalid username or password')).toBeInTheDocument();
        expect(screen.queryByText('Home page')).not.toBeInTheDocument();
    });
});
