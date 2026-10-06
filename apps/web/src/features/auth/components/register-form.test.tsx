import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http as mock, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { server } from '../../../../test/msw';
import { apiError, renderWithQuery } from '../../../../test/utils';
import { RegisterForm } from './register-form';

describe('RegisterForm', () => {
  it('shows an EMAIL_TAKEN error on the email field, not as a form error', async () => {
    server.use(
      mock.post('/api/auth/register', () =>
        HttpResponse.json(apiError('EMAIL_TAKEN'), { status: 409 }),
      ),
    );
    renderWithQuery(<RegisterForm onSuccess={vi.fn()} />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Display name'), 'Anna');
    await user.type(screen.getByLabelText('Email'), 'anna@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct horse battery');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    const email = screen.getByLabelText('Email');
    expect(await screen.findByText('An account with this email already exists')).toBeVisible();
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await user.type(email, 'x');
    expect(email).toHaveAttribute('aria-invalid', 'false');
  });

  it('updates the password checklist live from the shared rules', async () => {
    renderWithQuery(<RegisterForm onSuccess={vi.fn()} />);
    const user = userEvent.setup();
    const requirements = screen.getByRole('list', { name: 'Password requirements' });
    const item = (label: string) => within(requirements).getByText(label).closest('li');

    await user.type(screen.getByLabelText('Display name'), 'Anna');
    await user.type(screen.getByLabelText('Password'), 'anna-secret');
    expect(item('At least 10 characters')).toHaveTextContent('(met)');
    expect(item('Does not contain your email or name')).toHaveTextContent('(not met)');

    await user.clear(screen.getByLabelText('Password'));
    await user.type(screen.getByLabelText('Password'), 'qwertyuiop');
    expect(item('Not a commonly used password')).toHaveTextContent('(not met)');

    // Unmet required rules turn red only after a submit attempt.
    expect(item('Not a commonly used password')).not.toHaveClass('text-destructive');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(item('Not a commonly used password')).toHaveClass('text-destructive');
  });

  it('toggles password visibility', async () => {
    renderWithQuery(<RegisterForm onSuccess={vi.fn()} />);
    const user = userEvent.setup();
    const input = screen.getByLabelText('Password');

    expect(input).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input).toHaveAttribute('type', 'text');
    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(input).toHaveAttribute('type', 'password');
  });
});
