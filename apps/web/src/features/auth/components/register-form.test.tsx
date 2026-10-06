import { screen } from '@testing-library/react';
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

  it('enforces the shared password policy', async () => {
    renderWithQuery(<RegisterForm onSuccess={vi.fn()} />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Password'), 'short');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('Password must be at least 10 characters')).toBeVisible();
  });
});
