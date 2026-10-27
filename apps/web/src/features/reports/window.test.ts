import { describe, expect, it } from 'vitest';
import { reportWindow } from './window';

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
