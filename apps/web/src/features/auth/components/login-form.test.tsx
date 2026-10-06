import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http as mock, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { authStore } from '@/lib/auth-store';
import { server } from '../../../../test/msw';
import {
  apiError,
  authResponse,
  getField,
  renderWithQuery,
  testUser,
} from '../../../../test/utils';
import { LoginForm } from './login-form';

async function fillAndSubmit(email: string, password: string) {
  const user = userEvent.setup();
  if (email) await user.type(getField('Email'), email);
  if (password) await user.type(getField('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Log in' }));
  return user;
}

describe('LoginForm', () => {
  it('validates before sending anything', async () => {
    const onSuccess = vi.fn();
    renderWithQuery(<LoginForm onSuccess={onSuccess} />);

    await fillAndSubmit('not-an-email', '');

    expect(getField('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(getField('Password')).toHaveAttribute('aria-invalid', 'true');
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('starts a session and calls onSuccess with normalized credentials', async () => {
    let sent: unknown;
    server.use(
      mock.post('/api/auth/login', async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json(authResponse());
      }),
    );
    const onSuccess = vi.fn();
    renderWithQuery(<LoginForm onSuccess={onSuccess} />);

    await fillAndSubmit('  Anna@Example.com', 'correct horse battery');

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledOnce();
    });
    expect(sent).toEqual({ email: 'anna@example.com', password: 'correct horse battery' });
    expect(authStore.getState()).toMatchObject({ status: 'authenticated', user: testUser });
  });

  it('shows the API error above the form and clears it when the user edits', async () => {
    server.use(
      mock.post('/api/auth/login', () =>
        HttpResponse.json(apiError('INVALID_CREDENTIALS', 'Invalid email or password'), {
          status: 401,
        }),
      ),
    );
    renderWithQuery(<LoginForm onSuccess={vi.fn()} />);

    const user = await fillAndSubmit('anna@example.com', 'wrong password');

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    await user.type(getField('Password'), 'x');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
