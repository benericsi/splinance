import { describe, expect, it } from 'vitest';
import { reportRange, reportWindow } from './window';

describe('reportWindow', () => {
  it('ends at the current month and selects it by default', () => {
    expect(reportWindow({}, '2026-10')).toEqual({
      from: '2026-05',
      to: '2026-10',
      month: '2026-10',
    });
  });

  it('keeps a selected month that is inside the window', () => {
    expect(reportWindow({ to: '2026-10', month: '2026-07' }, '2026-10')).toEqual({
      from: '2026-05',
      to: '2026-10',
      month: '2026-07',
    });
  });

  it('moves the window to end at a selected month outside it', () => {
    expect(reportWindow({ to: '2026-10', month: '2026-04' }, '2026-10')).toEqual({
      from: '2025-11',
      to: '2026-04',
      month: '2026-04',
    });
    expect(reportWindow({ to: '2026-04', month: '2026-05' }, '2026-10').to).toBe('2026-05');
  });
});

describe('reportRange', () => {
  it('is the month window unless the year is asked for', () => {
    expect(reportRange({ to: '2026-10', month: '2026-08' }, '2026-10')).toEqual({
      period: 'month',
      from: '2026-05',
      to: '2026-10',
      month: '2026-08',
    });
  });

  it('covers a calendar year, by default the selected month’s', () => {
    expect(reportRange({ period: 'year', month: '2025-03' }, '2026-10')).toEqual({
      period: 'year',
      from: '2025-01',
      to: '2025-12',
      year: '2025',
    });
    expect(reportRange({ period: 'year' }, '2026-10')).toMatchObject({ year: '2026' });
    expect(reportRange({ period: 'year', year: '2024' }, '2026-10').from).toBe('2024-01');
  });
});
