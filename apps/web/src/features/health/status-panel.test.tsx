import { screen, within } from '@testing-library/react';
import { http as mock, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../../../test/msw';
import { renderWithQuery } from '../../../test/utils';
import { StatusPanel } from './status-panel';

const live = mock.get('/api/health/live', () =>
  HttpResponse.json({ status: 'ok', uptimeSeconds: 12 }),
);

async function expectStatus(service: 'API' | 'Database', label: string) {
  const card = await screen.findByRole('group', { name: service });
  expect(await within(card).findByText(label)).toBeInTheDocument();
}

describe('StatusPanel', () => {
  it('shows API online and database connected when both are healthy', async () => {
    server.use(
      live,
      mock.get('/api/health/ready', () =>
        HttpResponse.json({ status: 'ok', checks: { database: 'ok' } }),
      ),
    );

    renderWithQuery(<StatusPanel />);

    await expectStatus('API', 'Online');
    await expectStatus('Database', 'Connected');
  });

  it('shows the database as unreachable when readiness returns 503', async () => {
    server.use(
      live,
      mock.get('/api/health/ready', () =>
        HttpResponse.json({ status: 'error', checks: { database: 'error' } }, { status: 503 }),
      ),
    );

    renderWithQuery(<StatusPanel />);

    await expectStatus('API', 'Online');
    await expectStatus('Database', 'Unreachable');
  });

  it('shows the API offline and database unknown when the API cannot be reached', async () => {
    server.use(
      mock.get('/api/health/live', () => HttpResponse.error()),
      mock.get('/api/health/ready', () => HttpResponse.error()),
    );

    renderWithQuery(<StatusPanel />);

    await expectStatus('API', 'Offline');
    await expectStatus('Database', 'Unknown');
  });
});
