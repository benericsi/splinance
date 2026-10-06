import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { jsonResponse, renderWithQuery, stubFetch } from '../../../test/utils';
import { StatusPanel } from './status-panel';

const live = () => jsonResponse({ status: 'ok', uptimeSeconds: 12 });

async function expectStatus(service: 'API' | 'Database', label: string) {
  const card = await screen.findByRole('group', { name: service });
  expect(await within(card).findByText(label)).toBeInTheDocument();
}

describe('StatusPanel', () => {
  it('shows API online and database connected when both are healthy', async () => {
    stubFetch({
      '/api/health/live': live,
      '/api/health/ready': () => jsonResponse({ status: 'ok', checks: { database: 'ok' } }),
    });

    renderWithQuery(<StatusPanel />);

    await expectStatus('API', 'Online');
    await expectStatus('Database', 'Connected');
  });

  it('shows the database as unreachable when readiness returns 503', async () => {
    stubFetch({
      '/api/health/live': live,
      '/api/health/ready': () =>
        jsonResponse({ status: 'error', checks: { database: 'error' } }, 503),
    });

    renderWithQuery(<StatusPanel />);

    await expectStatus('API', 'Online');
    await expectStatus('Database', 'Unreachable');
  });

  it('shows the API offline and database unknown when the API cannot be reached', async () => {
    stubFetch({});

    renderWithQuery(<StatusPanel />);

    await expectStatus('API', 'Offline');
    await expectStatus('Database', 'Unknown');
  });
});
