import type { Category } from '@splinance/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http as mock, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { server } from '../../../test/msw';
import { renderRoute } from '../../../test/router';
import {
  apiError,
  authResponse,
  getField,
  householdDetail,
  testHousehold,
} from '../../../test/utils';
import { suggestColor } from './appearance';

const groceries: Category = {
  id: '01a12509-0f61-75bc-b406-130108780436',
  name: 'Groceries',
  kind: 'expense',
  icon: 'shopping-cart',
  color: 'green',
  archivedAt: null,
};
const eatingOut: Category = {
  ...groceries,
  id: '01a12509-0f61-790b-b827-659280707924',
  name: 'Eating out',
  icon: 'utensils',
  color: 'orange',
};
const salary: Category = {
  ...groceries,
  id: '01a12509-0f61-790b-b827-659280707925',
  name: 'Salary',
  kind: 'income',
  icon: 'briefcase',
};
const oldPets: Category = {
  ...groceries,
  id: '01a12509-0f61-790b-b827-659280707926',
  name: 'Old pets',
  icon: 'paw-print',
  color: 'pink',
  archivedAt: '2026-10-01T10:00:00.000Z',
};

const base = `/api/households/${testHousehold.id}/categories`;
const settings = `/h/${testHousehold.id}/settings`;

/** An in-memory categories API for Anna's household. */
function fakeApi() {
  const state = {
    categories: [eatingOut, groceries, salary, oldPets],
    requests: [] as { method: string; path: string; body: unknown }[],
  };
  const record = async (request: Request) => {
    const body: unknown = await request
      .clone()
      .json()
      .catch(() => undefined);
    state.requests.push({ method: request.method, path: new URL(request.url).pathname, body });
  };
  const byId = (id: unknown) => state.categories.find((c) => c.id === id);

  server.use(
    mock.post('/api/auth/refresh', () => HttpResponse.json(authResponse())),
    mock.get('/api/households', () => HttpResponse.json({ households: [testHousehold] })),
    mock.get(`/api/households/${testHousehold.id}`, () =>
      HttpResponse.json({ household: householdDetail() }),
    ),
    mock.get(base, () => HttpResponse.json({ categories: state.categories })),
    mock.post(base, async ({ request }) => {
      await record(request);
      const input = (await request.json()) as Pick<Category, 'name' | 'kind' | 'icon' | 'color'>;
      if (state.categories.some((c) => c.name.toLowerCase() === input.name.toLowerCase())) {
        return HttpResponse.json(apiError('CATEGORY_NAME_TAKEN'), { status: 409 });
      }
      const created: Category = {
        ...input,
        id: '01a12509-0f61-790b-b827-659280707999',
        archivedAt: null,
      };
      state.categories = [...state.categories, created];
      return HttpResponse.json({ category: created }, { status: 201 });
    }),
    mock.patch(`${base}/:id`, async ({ request, params }) => {
      await record(request);
      const patch = (await request.json()) as Partial<Category>;
      const updated = { ...byId(params.id), ...patch } as Category;
      state.categories = state.categories.map((c) => (c.id === params.id ? updated : c));
      return HttpResponse.json({ category: updated });
    }),
    mock.delete(`${base}/:id`, async ({ request, params }) => {
      await record(request);
      state.categories = state.categories.map((c) =>
        c.id === params.id ? { ...c, archivedAt: '2026-10-10T10:00:00.000Z' } : c,
      );
      return new HttpResponse(null, { status: 204 });
    }),
    mock.post(`${base}/:id/restore`, async ({ request, params }) => {
      await record(request);
      state.categories = state.categories.map((c) =>
        c.id === params.id ? { ...c, archivedAt: null } : c,
      );
      return HttpResponse.json({ category: { ...byId(params.id), archivedAt: null } });
    }),
  );
  return state;
}

const card = async () =>
  (await screen.findByRole('heading', { name: 'Categories' })).closest<HTMLElement>(
    '[data-slot=card]',
  ) ?? document.body;

afterEach(() => {
  localStorage.clear();
});

describe('categories in household settings', () => {
  it('lists one kind at a time, archived ones folded away', async () => {
    fakeApi();
    const user = userEvent.setup();
    renderRoute(settings);

    const categories = within(await card());
    expect(categories.getByRole('link', { name: 'Eating out' })).toBeVisible();
    expect(categories.getByRole('link', { name: 'Groceries' })).toBeVisible();
    expect(categories.queryByText('Salary')).not.toBeInTheDocument();
    expect(categories.queryByText('Old pets')).not.toBeInTheDocument();

    await user.click(categories.getByRole('button', { name: 'Archived (1)' }));
    expect(categories.getByText('Old pets')).toBeVisible();

    await user.click(categories.getByRole('button', { name: 'Income (1)' }));
    expect(categories.getByRole('link', { name: 'Salary' })).toBeVisible();
  });

  it('adds a category with the kind of the open tab, a color and an icon', async () => {
    const api = fakeApi();
    const user = userEvent.setup();
    renderRoute(settings);

    const categories = within(await card());
    await user.click(categories.getByRole('button', { name: 'Income (1)' }));
    await user.click(categories.getByRole('link', { name: 'Add category' }));

    const dialog = within(await screen.findByRole('dialog', { name: 'New category' }));
    expect(dialog.getByRole('button', { name: 'Income' })).toHaveAttribute('aria-pressed', 'true');
    // The least used color among income categories is suggested.
    expect(dialog.getByRole('radio', { name: 'Pink' })).toBeChecked();

    await user.type(getField('Name'), 'Freelance');
    await user.click(dialog.getByRole('radio', { name: 'Sky' }));
    await user.click(dialog.getByRole('radio', { name: 'Hand coins' }));
    await user.click(dialog.getByRole('button', { name: 'Add category' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(api.requests).toEqual([
      {
        method: 'POST',
        path: base,
        body: { name: 'Freelance', kind: 'income', icon: 'hand-coins', color: 'sky' },
      },
    ]);
    expect(await within(await card()).findByRole('link', { name: 'Freelance' })).toBeVisible();
  });

  it('shows a taken name next to the field', async () => {
    fakeApi();
    const user = userEvent.setup();
    renderRoute(settings);

    await user.click(within(await card()).getByRole('link', { name: 'Add category' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'New category' }));
    await user.type(getField('Name'), 'groceries');
    await user.click(dialog.getByRole('button', { name: 'Add category' }));

    expect(await dialog.findByText('A category with this name already exists')).toBeVisible();
    expect(getField('Name')).toHaveAttribute('aria-invalid', 'true');
  });

  it('edits name, color and icon but not the kind', async () => {
    const api = fakeApi();
    const user = userEvent.setup();
    renderRoute(settings);

    await user.click(within(await card()).getByRole('link', { name: 'Groceries' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Edit category' }));
    expect(dialog.getByText('Expense category')).toBeVisible();
    expect(dialog.queryByRole('button', { name: 'Income' })).not.toBeInTheDocument();
    expect(dialog.getByRole('radio', { name: 'Shopping cart' })).toBeChecked();

    await user.clear(getField('Name'));
    await user.type(getField('Name'), 'Food');
    await user.click(dialog.getByRole('radio', { name: 'Mustard' }));
    await user.click(dialog.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(api.requests).toEqual([
        {
          method: 'PATCH',
          path: `${base}/${groceries.id}`,
          body: { name: 'Food', icon: 'shopping-cart', color: 'mustard' },
        },
      ]);
    });
  });

  it('archives after confirming and restores from the archived list', async () => {
    const api = fakeApi();
    const user = userEvent.setup();
    renderRoute(settings);

    const categories = within(await card());
    await user.click(categories.getByRole('button', { name: 'Actions for Groceries' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Archive' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Archive Groceries?' });
    await user.click(within(confirm).getByRole('button', { name: 'Archive' }));

    await user.click(await categories.findByRole('button', { name: 'Archived (2)' }));
    await user.click(categories.getByRole('button', { name: 'Restore Groceries' }));

    await waitFor(() => {
      expect(api.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
        `DELETE ${base}/${groceries.id}`,
        `POST ${base}/${groceries.id}/restore`,
      ]);
    });
    expect(await categories.findByRole('link', { name: 'Groceries' })).toBeVisible();
  });

  it('does not open an archived category for editing', async () => {
    fakeApi();
    const router = renderRoute(`${settings}/categories/${oldPets.id}`);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(settings);
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('suggestColor', () => {
  it('picks the least used color of that kind, palette order on ties', () => {
    expect(suggestColor([groceries, eatingOut, salary], 'expense')).toBe('pink');
    expect(suggestColor([], 'income')).toBe('green');
  });
});
