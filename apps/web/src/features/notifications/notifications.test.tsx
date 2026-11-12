import type { Notification } from '@splinance/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http as mock, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { server } from '../../../test/msw';
import { renderRoute } from '../../../test/router';
import { authResponse, householdDetail, testHousehold, testUser } from '../../../test/utils';
import { describeNotification, timeAgo } from './describe';

const base = `/api/households/${testHousehold.id}`;
const jane = { userId: '01a12509-0f61-75bc-b406-1301087809a1', displayName: 'Jane' };

function notification(overrides: Partial<Notification>): Notification {
  return {
    id: '01a12509-0f61-75bc-b406-1301087809b1',
    householdId: testHousehold.id,
    householdName: testHousehold.name,
    type: 'tx_added',
    action: 'create',
    actor: null,
    subjectId: '01a12509-0f61-75bc-b406-1301087809c1',
    subjectName: null,
    subjectKind: null,
    parties: null,
    dueOn: null,
    amount: null,
    previousAmount: null,
    count: null,
    currency: 'HUF',
    createdAt: new Date().toISOString(),
    readAt: null,
    resolvedAt: null,
    ...overrides,
  };
}

const plain = (text: string) => text.replace(/\s/g, ' ');
const sentence = (n: Notification, today = '2026-11-05') => {
  const { lead, rest, detail } = describeNotification(n, testUser.id, today);
  return plain(`${lead}${rest} | ${detail}`);
};

describe('describeNotification', () => {
  it('says each kind in words, from the reader’s side', () => {
    expect(
      sentence(
        notification({
          type: 'renewal_due',
          subjectName: 'Netflix',
          dueOn: '2026-11-07',
          amount: 4_990,
        }),
      ),
    ).toBe('Netflix renews on Saturday | 4990 Ft');
    expect(
      sentence(
        notification({
          type: 'renewal_due',
          subjectName: 'Netflix',
          dueOn: '2026-11-06',
          amount: 4_990,
          resolvedAt: '2026-11-06T08:00:00Z',
        }),
      ),
    ).toBe('Netflix renews tomorrow | Paid');
    expect(
      sentence(notification({ type: 'renewal_missed', subjectName: 'Gym', dueOn: '2026-08-03' })),
    ).toBe('Gym was not paid | Expected 3 Aug. Cancelled?');
    expect(
      sentence(
        notification({
          type: 'price_changed',
          subjectName: 'Netflix',
          amount: 4_990,
          previousAmount: 4_490,
        }),
      ),
    ).toBe('Netflix price went up 11% | 4490 Ft to 4990 Ft');
    expect(
      sentence(
        notification({
          type: 'budget_near',
          subjectName: 'Eating out',
          amount: 35_200,
          previousAmount: 40_000,
          dueOn: '2026-11-01',
        }),
      ),
    ).toBe('Eating out is at 88% of its budget | 35 200 Ft of 40 000 Ft in November');
    expect(
      sentence(
        notification({
          type: 'budget_over',
          subjectName: 'Eating out',
          amount: 41_000,
          previousAmount: 40_000,
          dueOn: '2026-11-01',
        }),
      ),
    ).toBe('Eating out is over budget | 41 000 Ft of 40 000 Ft in November');
    // Another year says which.
    expect(
      sentence(
        notification({
          type: 'budget_over',
          subjectName: 'Eating out',
          amount: 41_000,
          previousAmount: 40_000,
          dueOn: '2025-12-01',
        }),
        '2026-01-03',
      ),
    ).toBe('Eating out is over budget | 41 000 Ft of 40 000 Ft in December 2025');
    expect(sentence(notification({ actor: jane, subjectName: 'Groceries', amount: 6_200 }))).toBe(
      'Jane added Groceries | Your share 6200 Ft',
    );
    expect(
      sentence(
        notification({
          type: 'tx_changed',
          action: 'update',
          actor: jane,
          subjectName: 'Groceries',
          amount: 7_400,
          previousAmount: 6_200,
        }),
      ),
    ).toBe('Jane changed Groceries | Your share 6200 Ft to 7400 Ft');
    expect(
      sentence(
        notification({
          type: 'tx_deleted',
          action: 'delete',
          actor: jane,
          subjectName: 'Lidl',
          amount: 3_150,
        }),
      ),
    ).toBe('Jane deleted Lidl | Your share was 3150 Ft');
    expect(
      sentence(notification({ type: 'import_added', actor: jane, count: 23, amount: 45_300 })),
    ).toBe('Jane imported 23 shared transactions | Your share 45 300 Ft');
    expect(
      sentence(
        notification({
          type: 'settlement_recorded',
          actor: jane,
          amount: 20_000,
          parties: { from: { userId: testUser.id, displayName: testUser.displayName }, to: jane },
        }),
      ),
    ).toBe('Jane recorded a payment | You to Jane, 20 000 Ft');
  });

  it('says how long ago', () => {
    const now = new Date('2026-11-05T12:00:00Z');
    expect(timeAgo('2026-11-05T11:59:40Z', now)).toBe('now');
    expect(timeAgo('2026-11-05T11:15:00Z', now)).toBe('45m');
    expect(timeAgo('2026-11-05T09:00:00Z', now)).toBe('3h');
    expect(timeAgo('2026-11-02T12:00:00Z', now)).toBe('3d');
    expect(timeAgo('2026-10-20T12:00:00Z', now)).toBe('20 Oct');
  });
});

function fakeApi(list: Notification[], unread = list.filter((n) => !n.readAt).length) {
  const state = { reads: [] as unknown[], settings: [] as unknown[], unread };
  server.use(
    mock.post('/api/auth/refresh', () => HttpResponse.json(authResponse())),
    mock.get('/api/households', () => HttpResponse.json({ households: [testHousehold] })),
    mock.get(base, () => HttpResponse.json({ household: householdDetail() })),
    mock.get('/api/notifications/unread-count', () => HttpResponse.json({ unread: state.unread })),
    mock.get('/api/notifications', () =>
      HttpResponse.json({ notifications: list, unread: state.unread }),
    ),
    mock.post('/api/notifications/read', async ({ request }) => {
      state.reads.push(await request.json());
      state.unread = 0;
      return new HttpResponse(null, { status: 204 });
    }),
    mock.put(`${base}/notification-settings`, async ({ request }) => {
      const body = await request.json();
      state.settings.push(body);
      return HttpResponse.json({ settings: body });
    }),
  );
  return state;
}

afterEach(() => {
  localStorage.clear();
});

describe('the bell', () => {
  const list = [
    notification({
      id: '01a12509-0f61-75bc-b406-1301087809b2',
      type: 'budget_over',
      subjectName: 'Eating out',
      amount: 41_000,
      previousAmount: 40_000,
      dueOn: '2026-11-01',
    }),
    notification({ actor: jane, subjectName: 'Groceries', amount: 6_200 }),
    notification({
      id: '01a12509-0f61-75bc-b406-1301087809b3',
      type: 'renewal_due',
      subjectName: 'Netflix',
      dueOn: '2026-11-07',
      amount: 4_990,
      readAt: '2026-11-04T10:00:00Z',
    }),
  ];

  it('shows the unread count and the list, and marks everything read', async () => {
    const api = fakeApi(list);
    const user = userEvent.setup();
    renderRoute(`/h/${testHousehold.id}`);

    const bell = await screen.findByRole('button', { name: 'Notifications, 2 unread' });
    expect(within(bell).getByText('2')).toBeInTheDocument();
    await user.click(bell);
    const items = within(await screen.findByRole('list', { name: 'Notifications' })).getAllByRole(
      'listitem',
    );
    expect(items.map((item) => plain(item.textContent))).toEqual([
      expect.stringMatching(
        /^Eating out is over budget41 000 Ft of 40 000 Ft in November( 2026)?now$/,
      ),
      expect.stringMatching(/^Jane added GroceriesYour share 6200 Ftnow$/),
      expect.stringMatching(/^Netflix renews .*4990 Ftnow$/),
    ]);
    expect(within(items[0] as HTMLElement).getByLabelText('Unread')).toBeInTheDocument();
    expect(within(items[2] as HTMLElement).queryByLabelText('Unread')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Mark all as read' }));
    await waitFor(() => {
      expect(api.reads).toEqual([{ all: true }]);
    });
    expect(await screen.findByRole('button', { name: 'Notifications' })).toBeInTheDocument();
  });

  it('opens an item where it points and marks it read', async () => {
    const api = fakeApi(list);
    const user = userEvent.setup();
    const router = renderRoute(`/h/${testHousehold.id}`);

    await user.click(await screen.findByRole('button', { name: /^Notifications/ }));
    await user.click(await screen.findByRole('button', { name: /Eating out is over budget/ }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/h/${testHousehold.id}/budgets`);
    });
    expect(router.state.location.search).toEqual({ month: '2026-11' });
    expect(api.reads).toEqual([{ ids: ['01a12509-0f61-75bc-b406-1301087809b2'] }]);
  });

  it('shows 9+ for many, and turns off what others change here', async () => {
    const api = fakeApi(list, 12);
    const user = userEvent.setup();
    renderRoute(`/h/${testHousehold.id}`);

    const bell = await screen.findByRole('button', { name: 'Notifications, 12 unread' });
    expect(within(bell).getByText('9+')).toBeInTheDocument();
    await user.click(bell);
    const toggle = await screen.findByRole('checkbox', {
      name: `What others change in ${testHousehold.name}`,
    });
    expect(toggle).toBeChecked();
    await user.click(toggle);
    await waitFor(() => {
      expect(api.settings).toEqual([{ activity: false }]);
    });
  });

  it('says so when there is nothing', async () => {
    fakeApi([]);
    const user = userEvent.setup();
    renderRoute(`/h/${testHousehold.id}`);
    await user.click(await screen.findByRole('button', { name: 'Notifications' }));
    expect(await screen.findByText(/Nothing new/)).toBeVisible();
  });
});
