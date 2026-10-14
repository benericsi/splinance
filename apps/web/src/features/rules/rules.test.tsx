import type { Category, Rule } from '@splinance/shared';
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

const groceries: Category = {
  id: '01a12509-0f61-75bc-b406-130108780436',
  name: 'Groceries',
  kind: 'expense',
  icon: 'shopping-cart',
  color: 'green',
  archivedAt: null,
};
const subscriptions: Category = {
  ...groceries,
  id: '01a12509-0f61-790b-b827-659280707924',
  name: 'Subscriptions',
  icon: 'music',
  color: 'pink',
};

const tesco: Rule = {
  id: '01a12509-0f61-790b-b827-6592807079a1',
  pattern: 'tesco',
  categoryId: groceries.id,
  kind: 'expense',
  markShared: true,
  position: 0,
};
const spotify: Rule = {
  ...tesco,
  id: '01a12509-0f61-790b-b827-6592807079a2',
  pattern: 'spotify',
  categoryId: subscriptions.id,
  markShared: false,
  position: 1,
};

const base = `/api/households/${testHousehold.id}/rules`;
const settings = `/h/${testHousehold.id}/settings`;

function fakeApi({ matches = 0 } = {}) {
  const state = {
    rules: [tesco, spotify],
    writes: [] as { method: string; path: string; body: unknown }[],
  };
  const record = async (request: Request) => {
    const body: unknown = await request
      .clone()
      .json()
      .catch(() => undefined);
    state.writes.push({ method: request.method, path: new URL(request.url).pathname, body });
  };

  server.use(
    mock.post('/api/auth/refresh', () => HttpResponse.json(authResponse())),
    mock.get('/api/households', () => HttpResponse.json({ households: [testHousehold] })),
    mock.get(`/api/households/${testHousehold.id}`, () =>
      HttpResponse.json({ household: householdDetail() }),
    ),
    mock.get(`/api/households/${testHousehold.id}/categories`, () =>
      HttpResponse.json({ categories: [groceries, subscriptions] }),
    ),
    mock.get(base, () => HttpResponse.json({ rules: state.rules })),
    mock.post(base, async ({ request }) => {
      await record(request);
      const input = (await request.json()) as Pick<Rule, 'pattern' | 'categoryId' | 'markShared'>;
      if (state.rules.some((r) => r.pattern.toLowerCase() === input.pattern.toLowerCase())) {
        return HttpResponse.json(apiError('RULE_PATTERN_TAKEN'), { status: 409 });
      }
      const created: Rule = {
        ...input,
        id: '01a12509-0f61-790b-b827-6592807079a9',
        kind: 'expense',
        position: state.rules.length,
      };
      state.rules = [...state.rules, created];
      return HttpResponse.json({ rule: created }, { status: 201 });
    }),
    mock.put(`${base}/order`, async ({ request }) => {
      await record(request);
      const { ruleIds } = (await request.json()) as { ruleIds: string[] };
      state.rules = ruleIds.map((id, position) => ({
        ...(state.rules.find((r) => r.id === id) as Rule),
        position,
      }));
      return HttpResponse.json({ rules: state.rules });
    }),
    mock.delete(`${base}/:id`, async ({ request, params }) => {
      await record(request);
      state.rules = state.rules.filter((r) => r.id !== params.id);
      return new HttpResponse(null, { status: 204 });
    }),
    mock.get(`${base}/:id/matches`, () => HttpResponse.json({ count: matches })),
    mock.post(`${base}/:id/apply`, async ({ request }) => {
      await record(request);
      return HttpResponse.json({ updated: matches });
    }),
  );
  return state;
}

const rulesCard = async () => {
  const card = (await screen.findByRole('heading', { name: 'Rules' })).closest('[data-slot=card]');
  if (!(card instanceof HTMLElement)) throw new Error('No card');
  return card;
};

afterEach(() => {
  localStorage.clear();
});

describe('rules in household settings', () => {
  it('lists the rules in order with their category', async () => {
    fakeApi();
    renderRoute(settings);
    const card = await rulesCard();
    const items = within(card).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringMatching(/Contains tesco.*Groceries.*Shared/),
      expect.stringMatching(/Contains spotify.*Subscriptions/),
    ]);
  });

  it('adds a rule, explaining a taken text next to the field', async () => {
    const api = fakeApi({ matches: 3 });
    const user = userEvent.setup();
    renderRoute(settings);

    await user.click(within(await rulesCard()).getByRole('link', { name: 'Add rule' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add rule' });
    await user.type(getField('When the merchant or description contains'), 'TESCO');
    await user.click(within(dialog).getByRole('button', { name: 'Add rule' }));
    expect(await within(dialog).findByText('Choose a category')).toBeVisible();

    await user.click(within(dialog).getByLabelText('Use category'));
    await user.click(await screen.findByRole('option', { name: 'Subscriptions' }));
    await user.click(within(dialog).getByRole('button', { name: 'Add rule' }));
    expect(await within(dialog).findByText('There is a rule for this text already')).toBeVisible();

    const pattern = getField('When the merchant or description contains');
    await user.clear(pattern);
    await user.type(pattern, 'apple.com');
    await user.click(within(dialog).getByLabelText('Mark imported matches as shared'));
    await user.click(within(dialog).getByRole('button', { name: 'Add rule' }));

    // The toast offers the earlier matches.
    expect(
      await screen.findByText('It matches 3 earlier transactions without a category.'),
    ).toBeVisible();
    expect(api.writes.filter((w) => w.method === 'POST').at(-1)?.body).toEqual({
      pattern: 'apple.com',
      categoryId: subscriptions.id,
      markShared: true,
    });
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(await screen.findByText('3 transactions categorized')).toBeVisible();
  });

  it('moves a rule down and deletes one after asking', async () => {
    const api = fakeApi();
    const user = userEvent.setup();
    renderRoute(settings);
    const card = await rulesCard();

    await user.click(within(card).getByRole('button', { name: 'Actions for rule tesco' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Move down' }));
    await waitFor(() => {
      expect(api.writes).toContainEqual({
        method: 'PUT',
        path: `${base}/order`,
        body: { ruleIds: [spotify.id, tesco.id] },
      });
    });

    await user.click(within(card).getByRole('button', { name: 'Actions for rule spotify' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Delete the rule "spotify"?' });
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }));
    await waitFor(() => {
      expect(screen.getByText('Rule deleted')).toBeVisible();
    });
    expect(api.writes.at(-1)).toMatchObject({ method: 'DELETE', path: `${base}/${spotify.id}` });
  });

  it('applies an existing rule to earlier transactions from its dialog', async () => {
    const api = fakeApi({ matches: 12 });
    const user = userEvent.setup();
    renderRoute(`${settings}/rules/${tesco.id}`);

    const dialog = await screen.findByRole('dialog', { name: 'Edit rule' });
    expect(
      await within(dialog).findByText('It matches 12 earlier transactions without a category.'),
    ).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Apply to them' }));
    expect(await screen.findByText('12 transactions categorized')).toBeVisible();
    expect(api.writes.at(-1)).toMatchObject({ method: 'POST', path: `${base}/${tesco.id}/apply` });
  });
});
