import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PHONE_QUERY } from '@/lib/use-media-query';
import { RouteDialog } from './route-dialog';

function emulatePhone() {
  const original = window.matchMedia.bind(window);
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) =>
    Object.assign(original(query), { matches: query === PHONE_QUERY }),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

function renderDialog() {
  const onClose = vi.fn();
  render(
    <RouteDialog title="New household" description="A shared space." onClose={onClose}>
      <input aria-label="Name" />
    </RouteDialog>,
  );
  return onClose;
}

describe('RouteDialog', () => {
  it('is a dialog on larger screens and reports the close after its animation', async () => {
    const user = userEvent.setup();
    const onClose = renderDialog();

    const dialog = screen.getByRole('dialog', { name: 'New household' });
    expect(dialog).toHaveAccessibleDescription('A shared space.');
    expect(dialog.dataset.slot).toBe('dialog-content');

    await user.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  it('is a bottom drawer on phones and closes with Escape', async () => {
    emulatePhone();
    const user = userEvent.setup();
    const onClose = renderDialog();

    const drawer = await screen.findByRole('dialog', { name: 'New household' });
    expect(drawer.dataset.slot).toBe('drawer-popup');

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledOnce();
    });
  });
});
