import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http as mock, HttpResponse } from 'msw';
import type * as Sonner from 'sonner';
import { toast } from 'sonner';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerSW } from 'virtual:pwa-register';
import { UserMenu } from '@/features/auth/components/user-menu';
import { server } from '../../../test/msw';
import { renderRoute } from '../../../test/router';
import { renderWithQuery, testUser } from '../../../test/utils';
import { InstallAppDialog } from './components/install-app-dialog';
import { type BeforeInstallPromptEvent, watchInstallPrompt } from './install';
import { startServiceWorker } from './register';

vi.mock('virtual:pwa-register', () => ({ registerSW: vi.fn(() => vi.fn()) }));
vi.mock('sonner', async (importOriginal) => ({
  ...(await importOriginal<typeof Sonner>()),
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

function installEvent() {
  const event = new Event('beforeinstallprompt', {
    cancelable: true,
  }) as BeforeInstallPromptEvent;
  event.prompt = vi.fn(() => Promise.resolve());
  return event;
}

async function openMenu() {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <UserMenu user={testUser} /> }),
    history: createMemoryHistory(),
  });
  renderWithQuery(<RouterProvider router={router} />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Account menu' }));
  return user;
}

function browserIs(userAgent: string) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
}

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1';

describe('Install app in the account menu', () => {
  it('uses the browser prompt once it is offered, and only once', async () => {
    const stop = watchInstallPrompt();
    const event = installEvent();
    const user = await openMenu();
    expect(screen.queryByRole('menuitem', { name: 'Install app' })).not.toBeInTheDocument();

    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    await user.click(await screen.findByRole('menuitem', { name: 'Install app' }));
    expect(event.prompt).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    expect(screen.queryByRole('menuitem', { name: 'Install app' })).not.toBeInTheDocument();
    stop();
  });

  it('points iOS to the instructions, which have no event to wait for', async () => {
    browserIs(IPHONE);
    await openMenu();
    expect(await screen.findByRole('menuitem', { name: 'Install app' })).toHaveAttribute(
      'href',
      expect.stringContaining('modal=install-app'),
    );
  });

  it('is gone in the installed app and after installing', async () => {
    browserIs(IPHONE);
    const original = window.matchMedia.bind(window);
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) =>
      Object.assign(original(query), { matches: query === '(display-mode: standalone)' }),
    );
    await openMenu();
    expect(screen.queryByRole('menuitem', { name: 'Install app' })).not.toBeInTheDocument();
  });

  it('explains the steps', async () => {
    const router = createRouter({
      routeTree: createRootRoute({ component: InstallAppDialog }),
      history: createMemoryHistory(),
    });
    renderWithQuery(<RouterProvider router={router} />);
    expect(await screen.findByRole('dialog', { name: 'Install Splinance' })).toHaveTextContent(
      'Choose Add to Home Screen',
    );
  });
});

describe('a new version', () => {
  it('waits for a click: reloading on its own could lose a form', () => {
    const update = vi.fn(() => Promise.resolve());
    vi.mocked(registerSW).mockReturnValue(update);
    startServiceWorker();
    const options = vi.mocked(registerSW).mock.calls.at(-1)?.[0];

    options?.onNeedRefresh?.();
    expect(update).not.toHaveBeenCalled();
    const [title, shown] = vi.mocked(toast).mock.calls.at(-1) ?? [];
    expect(title).toBe('New version available');
    expect(shown?.duration).toBe(Infinity);

    const action = shown?.action as { label: string; onClick: () => void };
    expect(action.label).toBe('Reload');
    action.onClick();
    expect(update).toHaveBeenCalledWith(true);
  });
});

describe('opening the app without a connection', () => {
  it('says so instead of showing the login page, and recovers by itself', async () => {
    server.use(mock.post('/api/auth/refresh', () => HttpResponse.error()));
    renderRoute('/login');
    expect(await screen.findByRole('heading', { name: 'No connection' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Log in' })).not.toBeInTheDocument();

    server.use(
      mock.post('/api/auth/refresh', () =>
        HttpResponse.json(
          { error: { code: 'INVALID_REFRESH_TOKEN', message: 'No session' } },
          { status: 401 },
        ),
      ),
    );
    window.dispatchEvent(new Event('online'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Log in' })).toBeVisible();
    });
  });
});
