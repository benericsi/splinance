import type { ImportBatch, ImportCheckResult, ImportInput } from '@splinance/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http as mock, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { server } from '../../../test/msw';
import { renderRoute } from '../../../test/router';
import { authResponse, householdDetail, testHousehold, testUser } from '../../../test/utils';

const ben = {
  userId: '01a1216a-b248-781c-9cc6-cd68276fcdfc',
  displayName: 'Ben',
  role: 'member' as const,
  joinedAt: '2026-10-09T16:06:43.492Z',
};

const base = `/api/households/${testHousehold.id}`;
const page = `/h/${testHousehold.id}/transactions/import`;

/** A made-up K&H export (tab separated), in the bank's layout. */
const KH = [
  [
    'könyvelés dátuma',
    'tranzakció azonosító ',
    'típus',
    'könyvelési számla',
    'könyvelési számla elnevezése',
    'partner számla',
    'partner elnevezése',
    'összeg',
    'összeg devizaneme',
    'közlemény',
  ],
  [
    '2026.10.12',
    'MSV-1',
    'Vásárlás belföldi kereskedőnél',
    '104',
    'KOVÁCS ANNA',
    '',
    'Pizza Place',
    '-9550',
    'HUF',
    'Ref.: MSV-1 2026/10/10 Pizza Place,HUN',
  ],
  [
    '2026.10.12',
    '544537******0',
    'bankkártya tranzakció foglalás',
    '104',
    'KOVÁCS ANNA',
    '',
    'Selecta SAS',
    '-773.00',
    '',
    '',
  ],
  [
    '2026.10.08',
    'MSV-2',
    'Vásárlás külföldi kereskedőnél',
    '104',
    'KOVÁCS ANNA',
    '',
    'APPLE.COM/BILL',
    '-15000',
    'HUF',
    'Ref.: MSV-2 2026/10/08 APPLE.COM/BILL,IRL',
  ],
  [
    '2026.10.07',
    'MSV-3',
    'Vásárlás külföldi kereskedőnél',
    '104',
    'KOVÁCS ANNA',
    '',
    'Revolut 1234',
    '-12320',
    'HUF',
    'Ref.: MSV-3 2026/10/06 Revolut 1234,IRL',
  ],
  [
    '2026.09.28',
    'MSV-4',
    'Vásárlás belföldi kereskedőnél',
    '104',
    'KOVÁCS ANNA',
    '',
    'TESCO 44049',
    '-1428',
    'HUF',
    'Ref.: MSV-4 2026/09/24 TESCO 44049,HUN',
  ],
]
  .map((cells) => cells.join('\t'))
  .join('\r\n');

const batch: ImportBatch = {
  id: '01a1250a-8673-7669-9f80-8f4006ca5e09',
  source: 'kh',
  fileName: 'export.csv',
  rowCount: 2,
  createdBy: { userId: testUser.id, displayName: 'Anna' },
  createdAt: '2026-10-12T10:00:00.000Z',
  undoneAt: null,
};

function fakeApi({ history = [] as ImportBatch[] } = {}) {
  const state = { imported: undefined as ImportInput | undefined, undone: [] as string[], history };
  server.use(
    mock.post('/api/auth/refresh', () => HttpResponse.json(authResponse())),
    mock.get('/api/households', () => HttpResponse.json({ households: [testHousehold] })),
    mock.get(base, () =>
      HttpResponse.json({
        household: householdDetail(testHousehold, [
          {
            userId: testUser.id,
            displayName: 'Anna',
            role: 'owner',
            joinedAt: testHousehold.createdAt,
          },
          ben,
        ]),
      }),
    ),
    mock.get(`${base}/imports`, () => HttpResponse.json({ batches: state.history })),
    mock.post(`${base}/imports/check`, async ({ request }) => {
      const { rows } = (await request.json()) as { rows: { fingerprint: string }[] };
      return HttpResponse.json({
        rows: rows.map(({ fingerprint }): ImportCheckResult => {
          if (fingerprint === 'kh:MSV-1') {
            return {
              fingerprint,
              status: 'possible-duplicate',
              match: {
                id: '01a1250a-8673-7669-9f80-8f4006ca5e01',
                description: 'Pizza night',
                occurredOn: '2026-10-09',
              },
            };
          }
          if (fingerprint === 'kh:MSV-4') return { fingerprint, status: 'imported', match: null };
          return { fingerprint, status: 'new', match: null };
        }),
      });
    }),
    mock.post(`${base}/imports`, async ({ request }) => {
      state.imported = (await request.json()) as ImportInput;
      state.history = [{ ...batch, rowCount: state.imported.rows.length }];
      return HttpResponse.json({ batch: state.history[0], skipped: 0 }, { status: 201 });
    }),
    mock.delete(`${base}/imports/:id`, ({ params }) => {
      state.undone.push(String(params.id));
      state.history = state.history.map((b) => ({ ...b, undoneAt: '2026-10-12T11:00:00.000Z' }));
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return state;
}

const fileInput = () => {
  const input = document.querySelector('input[type=file]');
  if (!(input instanceof HTMLInputElement)) throw new Error('No file input');
  return input;
};

afterEach(() => {
  localStorage.clear();
});

describe('importing a bank export', () => {
  it('groups the rows by what needs a decision and imports the picked ones', async () => {
    const api = fakeApi();
    const user = userEvent.setup();
    renderRoute(page);

    expect(await screen.findByRole('heading', { name: 'Import from your bank' })).toBeVisible();
    await user.upload(fileInput(), new File([KH], 'export.csv', { type: 'text/csv' }));

    const needsLook = await screen.findByRole('region', { name: 'Needs a look' });
    expect(within(needsLook).getByText('Pizza Place')).toBeVisible();
    expect(within(needsLook).getByText(/Maybe already added: "Pizza night"/)).toBeVisible();
    expect(within(needsLook).getByText('Revolut 1234')).toBeVisible();
    expect(
      within(needsLook).getByText('Looks like a transfer between your own accounts'),
    ).toBeVisible();

    const ready = screen.getByRole('region', { name: 'Ready to import' });
    expect(within(ready).getByLabelText('Description of APPLE.COM/BILL')).toHaveValue(
      'APPLE.COM/BILL',
    );
    expect(screen.getByText('Left out: 1 not booked yet, 1 already imported')).toBeVisible();
    // The account holder from the file fills the name field.
    expect(screen.getByLabelText('Your name at the bank')).toHaveValue('KOVÁCS ANNA');

    // Edit the ready row, make it shared, and pick the possible duplicate too.
    const description = within(ready).getByLabelText('Description of APPLE.COM/BILL');
    await user.clear(description);
    await user.type(description, 'iCloud');
    await user.click(within(ready).getByRole('button', { name: 'Shared' }));
    await user.click(within(needsLook).getByLabelText('Import Pizza Place'));
    await user.click(screen.getByRole('button', { name: 'Import 2 transactions' }));

    expect(await screen.findByText('2 transactions imported')).toBeVisible();
    expect(api.imported).toEqual({
      source: 'kh',
      fileName: 'export.csv',
      rows: [
        {
          fingerprint: 'kh:MSV-1',
          counterparty: 'Pizza Place',
          transaction: {
            visibility: 'private',
            kind: 'expense',
            amount: 9550,
            occurredOn: '2026-10-10',
            description: 'Pizza Place',
            categoryId: null,
          },
        },
        {
          fingerprint: 'kh:MSV-2',
          counterparty: 'APPLE.COM/BILL',
          transaction: {
            visibility: 'shared',
            kind: 'expense',
            amount: 15_000,
            occurredOn: '2026-10-08',
            description: 'iCloud',
            categoryId: null,
            paidBy: testUser.id,
            split: { method: 'equal', userIds: [testUser.id, ben.userId] },
          },
        },
      ],
    });

    // Undo right from the summary.
    await user.click(screen.getByRole('button', { name: 'Undo import' }));
    expect(await screen.findByText('Import undone')).toBeVisible();
    expect(api.undone).toEqual([batch.id]);
  });

  it('explains a file it cannot read', async () => {
    fakeApi();
    const user = userEvent.setup();
    renderRoute(page);

    await screen.findByRole('heading', { name: 'Import from your bank' });
    await user.upload(fileInput(), new File(['date;amount\n2026-01-01;5'], 'other.csv'));
    expect(await screen.findByText(/not a Revolut or K&H export/)).toBeVisible();
  });

  it('undoes an earlier import after asking', async () => {
    const api = fakeApi({ history: [batch] });
    const user = userEvent.setup();
    renderRoute(page);

    const history = (await screen.findByRole('heading', { name: 'Your imports' })).closest(
      '[data-slot=card]',
    );
    if (!(history instanceof HTMLElement)) throw new Error('No card');
    expect(within(history).getByText(/K&H · 12 Oct 2026 · 2 transactions/)).toBeVisible();

    await user.click(within(history).getByRole('button', { name: 'Undo' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Undo this import?' });
    await user.click(within(confirm).getByRole('button', { name: 'Undo import' }));

    // The alert dialog keeps the rest of the page hidden until its exit animation ends.
    await waitFor(() => {
      expect(screen.getByText('Import undone')).toBeVisible();
    });
    expect(api.undone).toEqual([batch.id]);
    await waitFor(() => {
      expect(within(history).getByText(/· undone/)).toBeVisible();
    });
  });
});
