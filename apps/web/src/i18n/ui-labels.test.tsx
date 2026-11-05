import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RouteDialog } from '@/components/route-dialog';
import { localeStore } from '@/lib/locale';
import { renderRoute } from '../../test/router';

// Text screen readers get from the UI kit and the toast library, not from our own pages.
describe('labels from the UI kit, in Hungarian', () => {
  it('names the dialog close button', async () => {
    await localeStore.setLocale('hu', { persist: false });
    render(
      <RouteDialog title="Új háztartás" onClose={() => undefined}>
        <p>Tartalom</p>
      </RouteDialog>,
    );
    expect(screen.getByRole('button', { name: 'Bezárás' })).toBeVisible();
  });

  it('names the toast region', async () => {
    await localeStore.setLocale('hu', { persist: false });
    renderRoute('/login');
    await waitFor(() => {
      expect(document.querySelector('[aria-label^="Értesítések"]')).not.toBeNull();
    });
    expect(document.querySelector('[aria-label^="Notifications"]')).toBeNull();
  });
});
