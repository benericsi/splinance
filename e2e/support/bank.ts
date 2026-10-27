import type { Page } from '@playwright/test';

/** A row of a K&H transaction history export, as the bank writes it. */
export interface KhRow {
  /** Booking date, `YYYY.MM.DD`. */
  booked: string;
  id: string;
  type: string;
  partner: string;
  /** Signed, e.g. '-6000'. */
  amount: string;
  currency: string;
  note: string;
}

const KH_HEADER = [
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
];

/**
 * A made-up K&H transaction history export (tab separated, like the real one) for an
 * account holder called Kovács Anna. Every value is invented.
 */
export function khExport(rows: KhRow[]): string {
  return [
    KH_HEADER,
    ...rows.map((row) => [
      row.booked,
      row.id,
      row.type,
      '104',
      'KOVÁCS ANNA',
      '',
      row.partner,
      row.amount,
      row.currency,
      row.note,
    ]),
  ]
    .map((cells) => cells.join('\t'))
    .join('\r\n');
}

/** A domestic card purchase, booked a day or so after it happened. */
export function khPurchase({
  booked,
  paid,
  id,
  partner,
  amount,
}: {
  booked: string;
  /** `YYYY/MM/DD`, the day of the purchase. */
  paid: string;
  id: string;
  partner: string;
  /** Positive, in forint. */
  amount: number;
}): KhRow {
  return {
    booked,
    id,
    type: 'Vásárlás belföldi kereskedőnél',
    partner,
    amount: String(-amount),
    currency: 'HUF',
    note: `Ref.: ${id} ${paid} ${partner},HUN`,
  };
}

/** Picks an export on the import page. */
export async function chooseExport(page: Page, content: string, name = 'kh-export.csv') {
  await page.locator('input[type=file]').setInputFiles({
    name,
    mimeType: 'text/csv',
    buffer: Buffer.from(content, 'utf8'),
  });
}
