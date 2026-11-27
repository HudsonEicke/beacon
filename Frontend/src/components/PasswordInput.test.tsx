import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PasswordInput from './PasswordInput';

const renderInForm = () =>
{
    const onSubmit = vi.fn();

    render(
        <form onSubmit={onSubmit}>
            <label htmlFor="password">Password</label>
            <PasswordInput id="password" />
        </form>
    );

    return { user: userEvent.setup(), onSubmit };
};

describe('PasswordInput', () =>
{
    it('starts hidden', () =>
    {
        renderInForm();

        expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
        expect(screen.getByRole('button', { name: 'Show password' })).toBeInTheDocument();
    });

    it('shows the typed text and hides it again', async () =>
    {
        const { user } = renderInForm();
        await user.type(screen.getByLabelText('Password'), 'hunter2!');

        await user.click(screen.getByRole('button', { name: 'Show password' }));

        expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text');
        expect(screen.getByLabelText('Password')).toHaveValue('hunter2!');

        await user.click(screen.getByRole('button', { name: 'Hide password' }));

        expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    });

    it('does not submit the form', async () =>
    {
        const { user, onSubmit } = renderInForm();

        await user.click(screen.getByRole('button', { name: 'Show password' }));

        expect(onSubmit).not.toHaveBeenCalled();
    });
});
