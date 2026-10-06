import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithQuery } from '../../test/utils';
import { THEME_STORAGE_KEY, themeStore } from '@/lib/theme';
import { ThemeToggle } from './theme-toggle';

describe('ThemeToggle', () => {
  it('applies and persists the chosen theme', async () => {
    themeStore.setPreference('system');
    renderWithQuery(<ThemeToggle />);
    const user = userEvent.setup();

    expect(screen.getByRole('button', { name: 'System' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Dark' }));
    expect(screen.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true');
    expect(document.documentElement).toHaveClass('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    // Clicking the active option keeps it selected instead of clearing the group.
    await user.click(screen.getByRole('button', { name: 'Dark' }));
    expect(themeStore.getState().preference).toBe('dark');

    await user.click(screen.getByRole('button', { name: 'Light' }));
    expect(document.documentElement).not.toHaveClass('dark');
  });
});
