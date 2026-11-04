import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { themeStore } from '@/lib/theme';
import { renderWithQuery, testUser } from '../../../../test/utils';
import { UserMenu } from './user-menu';

/** The menu links to /account, so it needs a router around it. */
async function renderMenu() {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <UserMenu user={testUser} /> }),
    history: createMemoryHistory(),
  });
  renderWithQuery(<RouterProvider router={router} />);
  await screen.findByRole('button', { name: 'Account menu' });
}

describe('UserMenu keyboard access', () => {
  it('opens with Enter and closes with Escape, returning focus to the trigger', async () => {
    await renderMenu();
    const user = userEvent.setup();

    await user.tab();
    const trigger = screen.getByRole('button', { name: 'Account menu' });
    expect(trigger).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(await screen.findByRole('menu')).toBeVisible();
    // Focus lands on the first item, Account settings.
    expect(screen.getByRole('menuitem', { name: 'Account settings' })).toHaveFocus();

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
    expect(trigger).toHaveFocus();
  });

  it('lets keyboard users change the theme inside the menu', async () => {
    themeStore.setPreference('light');
    await renderMenu();
    const user = userEvent.setup();

    await user.tab();
    await user.keyboard('{Enter}');
    await screen.findByRole('menu');

    // The theme toggle is the next focusable control after Account settings.
    await user.tab();
    expect(screen.getByRole('button', { name: 'Light' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('button', { name: 'Dark' })).toHaveFocus();
    await user.keyboard(' ');
    expect(themeStore.getState().preference).toBe('dark');

    // Selecting with Space hides the tooltip, so one Escape closes the menu.
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Account menu' })).toHaveFocus();
  });

  it('links to the account settings', async () => {
    await renderMenu();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    expect(await screen.findByRole('menuitem', { name: 'Account settings' })).toHaveAttribute(
      'href',
      '/account',
    );
  });

  it('reaches Log out with the arrow keys and closes from there with Escape', async () => {
    await renderMenu();
    const user = userEvent.setup();

    await user.tab();
    await user.keyboard('{Enter}');
    await screen.findByRole('menu');
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Log out' })).toHaveFocus();

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });
});
