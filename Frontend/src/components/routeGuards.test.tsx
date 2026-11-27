import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import GuestRoute from './GuestRoute';
import { renderWithProviders } from '@/test/renderWithProviders';
import { makeAuthState } from '@/test/factories';

const renderApp = (route: string, isAuthenticated: boolean) => renderWithProviders(
    <Routes>
        <Route element={<GuestRoute />}>
            <Route path="/login" element={<p>Login page</p>} />
        </Route>
        <Route element={<ProtectedRoute />}>
            <Route path="/channels/@me" element={<p>Home page</p>} />
        </Route>
    </Routes>,
    {
        route,
        preloadedState: {
            auth: makeAuthState(isAuthenticated ? {} : { accessToken: null, refreshToken: null, isAuthenticated: false })
        }
    }
);

describe('route guards', () =>
{
    it('sends a logged-out visitor from a protected page to the login page', () =>
    {
        renderApp('/channels/@me', false);

        expect(screen.getByText('Login page')).toBeInTheDocument();
    });

    it('shows a protected page when logged in', () =>
    {
        renderApp('/channels/@me', true);

        expect(screen.getByText('Home page')).toBeInTheDocument();
    });

    it('sends a logged-in user from the login page to the home page', () =>
    {
        renderApp('/login', true);

        expect(screen.getByText('Home page')).toBeInTheDocument();
    });

    it('shows the login page when logged out', () =>
    {
        renderApp('/login', false);

        expect(screen.getByText('Login page')).toBeInTheDocument();
    });
});
