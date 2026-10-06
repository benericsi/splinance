import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { themeStore } from '@/lib/theme';
import { renderWithQuery, testUser } from '../../../../test/utils';
import { UserMenu } from './user-menu';

describe('UserMenu keyboard access', () => {
  it('opens with Enter and closes with Escape, returning focus to the trigger', async () => {
    renderWithQuery(<UserMenu user={testUser} />);
    const user = userEvent.setup();

    await user.tab();
    const trigger = screen.getByRole('button', { name: 'Account menu' });
    expect(trigger).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(await screen.findByRole('menu')).toBeVisible();

    // Focus lands on the theme toggle, which shows its tooltip. Escape dismisses the
    // innermost layer first (tooltip), then the menu: standard nested-popup behavior.
    await user.keyboard('{Escape}');
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
    expect(trigger).toHaveFocus();
  });

  it('lets keyboard users change the theme inside the menu', async () => {
    themeStore.setPreference('light');
    renderWithQuery(<UserMenu user={testUser} />);
    const user = userEvent.setup();

    await user.tab();
    await user.keyboard('{Enter}');
    await screen.findByRole('menu');

    // The theme toggle is the first focusable control in the menu.
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

  it('reaches Log out with Tab and closes from there with Escape', async () => {
    renderWithQuery(<UserMenu user={testUser} />);
    const user = userEvent.setup();

    await user.tab();
    await user.keyboard('{Enter}');
    await screen.findByRole('menu');
    await user.tab();
    expect(screen.getByRole('menuitem', { name: 'Log out' })).toHaveFocus();

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });
});
