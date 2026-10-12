import { describe, expect, it } from 'vitest';
import { decimalToMinor } from './amounts';
import { readDelimited } from './csv';
import { isOneOf, nameKey } from './names';
import { parseStatement, StatementError, type StatementRow } from './index';

// Hand-made fixtures in the banks' layouts. Names, accounts and amounts are invented.

const REVOLUT_HU = [
  'Típus,Termék,Kezdés dátuma,Teljesítés dátuma,Leírás,Összeg,Díj,Pénznem,State,Egyenleg',
  'Kártyás fizetés,Folyószámla,2026-08-31 15:50:42,2026-09-01 14:09:24,Lidl,-2306.00,0.00,HUF,ELVÉGEZVE,652.04',
  'Feltöltés,Folyószámla,2026-09-01 15:26:40,2026-09-01 15:26:43,Apple Pay összegű feltöltés a(z) *1234 eszközödön,5000.00,0.00,HUF,ELVÉGEZVE,5652.04',
  'Átutalás,Folyószámla,2026-09-04 10:13:27,2026-09-04 10:13:29,Átutalás tőle: ANNA KOVACS,618.96,0.00,HUF,ELVÉGEZVE,6271.00',
  'Átutalás,Folyószámla,2026-09-10 11:28:40,2026-09-10 11:28:41,Átutalás tőle: PÉTER SZABÓ,50000.00,0.00,HUF,ELVÉGEZVE,56271.00',
  'Feltöltés,Folyószámla,2026-09-12 12:03:36,2026-09-12 12:03:36,Fizetés a következő személytől: MINTA ZRT.,3950.00,0.00,HUF,ELVÉGEZVE,60221.00',
  'Kártyás fizetés,Folyószámla,2026-09-07 15:12:15,2026-09-08 13:36:00,Chef Kebab,-2190.00,0.00,HUF,ELVÉGEZVE,58031.00',
  'Kártyás fizetés,Folyószámla,2026-09-07 15:12:15,2026-09-08 13:36:00,Chef Kebab,-2190.00,0.00,HUF,ELVÉGEZVE,55841.00',
  'Kártyás fizetés,Folyószámla,2026-09-08 09:00:00,2026-09-08 09:00:05,"Bistro, Corner",-1500.00,25.00,HUF,ELVÉGEZVE,54316.00',
  'Kártyás fizetés,Folyószámla,2026-09-09 10:00:00,,Pending Shop,-990.00,0.00,HUF,PENDING,',
  'Kártyás fizetés,Folyószámla,2026-09-09 11:00:00,,Declined Shop,-500.00,0.00,HUF,REVERTED,',
  'ATM,Folyószámla,2026-09-11 08:00:00,2026-09-11 08:00:01,ATM Corvin,-20000.00,0.00,HUF,ELVÉGEZVE,34316.00',
  'Kártyás fizetés,Folyószámla,2026-09-12 08:00:00,2026-09-12 08:00:01,Cafe Wien,-4.50,0.00,EUR,ELVÉGEZVE,10.00',
  '',
].join('\r\n');

const REVOLUT_EN = [
  'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance',
  'Card Payment,Current,2026-09-02 18:01:00,2026-09-03 10:00:00,Tesco,-1857.00,0.00,HUF,COMPLETED,100.00',
  'Topup,Current,2026-09-03 09:00:00,2026-09-03 09:00:01,Top-up by *1234,10000.00,0.00,HUF,COMPLETED,10100.00',
].join('\n');

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
  'tranzakciót indító tényleges fizető fél neve ',
];

/** One K&H row; unlisted trailing cells stay empty like in the export. */
const kh = (cells: string[]) => [...cells, '', '', ''].join('\t');

const KH = [
  KH_HEADER.join('\t'),
  kh([
    '2026.10.12',
    'MSV2CF.SAO-10-12-2026000000000001-1',
    'Vásárlás belföldi kereskedőnél',
    '10400000000000000000000',
    'KOVÁCS ANNA',
    '',
    'Pizza Place',
    '-9550',
    'HUF',
    'Ref.: MSV2000000000001 544537******0000 KOVÁCS ANNA 26.13 EUR 9550 HUF 2026/10/10 Pizza Place,HUN',
  ]),
  kh([
    '2026.10.12',
    '544537******0',
    'bankkártya tranzakció foglalás',
    '10400000000000000000000',
    'KOVÁCS ANNA',
    '',
    'Selecta SAS           Le Bourget      FR',
    '-773.00',
    '',
    '',
  ]),
  kh([
    '2026.10.07',
    'MSV4F.SAO-10-07-2026000000000002-1',
    'Vásárlás külföldi kereskedőnél',
    '10400000000000000000000',
    'KOVÁCS ANNA',
    '',
    'Revolut 1234',
    '-12320',
    'HUF',
    'Ref.: MSV4000000000002 544537******0000 KOVÁCS ANNA 33.43 EUR 12320 HUF 2026/10/06 Revolut 1234,IRL',
  ]),
  kh([
    '2026.10.02',
    'BNK26275AAAAAAAA',
    'Azonnali Forint átutalás jóváírás',
    '10400000000000000000000',
    'Kovács Anna',
    'HU00111111110000000000000000',
    'MINTA KFT',
    '420165',
    'HUF',
    '2026.09. havi bér',
  ]),
  kh([
    '2026.09.30',
    'AAACT26273000000000',
    'Kamat',
    '10400000000000000000000',
    'KOVÁCS ANNA',
    '',
    '',
    '2',
    'HUF',
    'Ref.: AAACT26273000000000',
  ]),
  kh([
    '2026.09.28',
    'MSK2C.SAO-09-28-2026000000000003-1',
    'Készpénzfelvét K&H ATM-ből',
    '10400000000000000000000',
    'KOVÁCS ANNA',
    '',
    'BEKE U 9.',
    '-135000',
    'HUF',
    'Ref.: MSK2000000000003 544537******0000 KOVÁCS ANNA 135000 HUF 135000 HUF 2026/09/24 BEKE U 9.,HUN',
  ]),
  kh([
    '2026.09.28',
    'BNK262700BBBBBBB',
    'Azonnali Forint átutalás jóváírás',
    '10400000000000000000000',
    'Anna Kovács',
    'HU00222222220000000000000000',
    'Anna Kovacs',
    '10500',
    'HUF',
    'A Revolutról küldve',
  ]),
  kh([
    '2026.09.14',
    'AAACT26257CCCCCCCC',
    'Azonnali Forint átutalás díj bankon kívül',
    '10400000000000000000000',
    'KOVÁCS ANNA',
    '',
    '',
    '-230',
    'HUF',
    'Ref.: AAACT26257CCCCCCCC Tranz.ref.: BNK26257DDDDDDDD',
  ]),
  kh([
    '2026.09.14',
    'AAACT26257EEEEEEEE',
    'Tranzakciós költség',
    '10400000000000000000000',
    'KOVÁCS ANNA',
    '',
    '',
    '-339',
    'HUF',
    'Ref.: AAACT26257EEEEEEEE Tranz.ref.: BNK26254NOTINFILE',
  ]),
  kh([
    '2026.09.14',
    'BNK26257DDDDDDDD',
    'Azonnali Forint átutalás bankon kívül',
    '10400000000000000000000',
    'KOVÁCS ANNA',
    'HU00333333330000000000000000',
    'Nagy Béla ',
    '-25000',
    'HUF',
    'Streaming',
  ]),
  '',
].join('\r\n');

const byDescription = (rows: StatementRow[], description: string) => {
  const row = rows.find((r) => r.description === description);
  if (!row) throw new Error(`No row "${description}"`);
  return row;
};

describe('readDelimited', () => {
  it('reads quotes, doubled quotes, line breaks in quotes and CRLF', () => {
    const text =
      String.fromCharCode(0xfeff) + 'a,b,c\r\n"x, y","say ""hi""","two\nlines"\r\nlast,,\r\n\r\n';
    expect(readDelimited(text, ',')).toEqual([
      { line: 1, cells: ['a', 'b', 'c'] },
      { line: 2, cells: ['x, y', 'say "hi"', 'two\nlines'] },
      { line: 4, cells: ['last', '', ''] },
    ]);
  });

  it('reads tab separated text without a final line break', () => {
    expect(readDelimited('a\tb\n1\t2', '\t')).toEqual([
      { line: 1, cells: ['a', 'b'] },
      { line: 2, cells: ['1', '2'] },
    ]);
  });
});

describe('names', () => {
  it('ignores word order, case and accents', () => {
    expect(nameKey('KOVÁCS ANNA')).toBe(nameKey('Anna Kovacs'));
    expect(isOneOf('anna kovács', ['Kovács Anna'])).toBe(true);
    expect(isOneOf('Kovács-Nagy Anna', ['Kovács Anna'])).toBe(false);
    expect(isOneOf('', [''])).toBe(false);
  });
});

describe('decimalToMinor', () => {
  it('reads amounts as text into minor units', () => {
    expect(decimalToMinor('-2306.00', 'HUF')).toEqual({ minor: -2306, rounded: false });
    expect(decimalToMinor('420165', 'HUF')).toEqual({ minor: 420_165, rounded: false });
    expect(decimalToMinor('-4.5', 'EUR')).toEqual({ minor: -450, rounded: false });
    expect(decimalToMinor('12.34', 'USD')).toEqual({ minor: 1234, rounded: false });
  });

  it('rounds fillér half away from zero and says so', () => {
    expect(decimalToMinor('618.96', 'HUF')).toEqual({ minor: 619, rounded: true });
    expect(decimalToMinor('-618.50', 'HUF')).toEqual({ minor: -619, rounded: true });
    expect(decimalToMinor('618.49', 'HUF')).toEqual({ minor: 618, rounded: true });
  });

  it('refuses anything else', () => {
    expect(decimalToMinor('1,5', 'HUF')).toBeUndefined();
    expect(decimalToMinor('', 'HUF')).toBeUndefined();
    expect(decimalToMinor('abc', 'HUF')).toBeUndefined();
  });
});

describe('Revolut', () => {
  const { source, accountHolder, rows } = parseStatement(REVOLUT_HU, {
    ownNames: ['Kovács Anna'],
    currency: 'HUF',
  });

  it('is recognized by its header', () => {
    expect(source).toBe('revolut');
    expect(accountHolder).toBeNull();
  });

  it('reads a card payment on the day it started', () => {
    expect(byDescription(rows, 'Lidl')).toEqual({
      line: 2,
      fingerprint: 'revolut:Folyószámla|2026-08-31 15:50:42|-2306.00|Lidl#0',
      occurredOn: '2026-08-31',
      kind: 'expense',
      amount: 2306,
      currency: 'HUF',
      description: 'Lidl',
      counterparty: 'Lidl',
      flags: [],
    });
  });

  it('marks top-ups from own cards and transfers from own names', () => {
    expect(rows[1]?.flags).toEqual(['own-transfer']);
    const fromSelf = byDescription(rows, 'Átutalás tőle: ANNA KOVACS');
    expect(fromSelf).toMatchObject({ kind: 'income', amount: 619, counterparty: 'ANNA KOVACS' });
    expect(fromSelf.flags).toEqual(['own-transfer', 'rounded']);
  });

  it('keeps money from other people as income', () => {
    expect(byDescription(rows, 'Átutalás tőle: PÉTER SZABÓ')).toMatchObject({
      kind: 'income',
      amount: 50_000,
      counterparty: 'PÉTER SZABÓ',
      flags: [],
    });
    // A "top-up" type that is really a payment from someone (no card number).
    expect(byDescription(rows, 'Fizetés a következő személytől: MINTA ZRT.')).toMatchObject({
      counterparty: 'MINTA ZRT.',
      flags: [],
    });
  });

  it('gives identical rows their own fingerprints', () => {
    const kebabs = rows.filter((r) => r.description === 'Chef Kebab');
    expect(kebabs.map((r) => r.fingerprint?.slice(-2))).toEqual(['#0', '#1']);
  });

  it('adds fees, flags pending, cash and other currencies, drops cancelled rows', () => {
    expect(byDescription(rows, 'Bistro, Corner').amount).toBe(1525);
    expect(byDescription(rows, 'Pending Shop').flags).toEqual(['pending']);
    expect(rows.some((r) => r.description === 'Declined Shop')).toBe(false);
    expect(byDescription(rows, 'ATM Corvin').flags).toEqual(['cash-withdrawal']);
    expect(byDescription(rows, 'Cafe Wien')).toMatchObject({
      amount: 450,
      currency: 'EUR',
      flags: ['other-currency'],
    });
  });

  it('reads the English export too', () => {
    const english = parseStatement(REVOLUT_EN);
    expect(english.source).toBe('revolut');
    expect(english.rows.map((r) => [r.description, r.amount, r.flags])).toEqual([
      ['Tesco', 1857, []],
      ['Top-up by *1234', 10_000, ['own-transfer']],
    ]);
  });
});

describe('K&H', () => {
  const { source, accountHolder, rows } = parseStatement(KH, { currency: 'HUF' });

  it('is recognized by its header and names the account holder', () => {
    expect(source).toBe('kh');
    expect(accountHolder).toBe('KOVÁCS ANNA');
  });

  it('reads a card purchase on its purchase date, with the bank id as fingerprint', () => {
    expect(byDescription(rows, 'Pizza Place')).toEqual({
      line: 2,
      fingerprint: 'kh:MSV2CF.SAO-10-12-2026000000000001-1',
      occurredOn: '2026-10-10',
      kind: 'expense',
      amount: 9550,
      currency: 'HUF',
      description: 'Pizza Place',
      counterparty: 'Pizza Place',
      flags: [],
    });
  });

  it('flags card holds as pending, without a fingerprint', () => {
    expect(byDescription(rows, 'Selecta SAS Le Bourget FR')).toMatchObject({
      fingerprint: null,
      occurredOn: '2026-10-12',
      amount: 773,
      currency: 'HUF',
      flags: ['pending'],
    });
  });

  it('recognizes own transfers by the holder name and Revolut top-ups by card', () => {
    expect(byDescription(rows, 'Anna Kovacs · A Revolutról küldve').flags).toEqual([
      'own-transfer',
    ]);
    expect(byDescription(rows, 'Revolut 1234').flags).toEqual(['own-transfer']);
  });

  it('describes transfers with their message, fees and interest by their type', () => {
    expect(byDescription(rows, 'MINTA KFT · 2026.09. havi bér')).toMatchObject({
      kind: 'income',
      amount: 420_165,
      occurredOn: '2026-10-02',
      flags: [],
    });
    expect(byDescription(rows, 'Nagy Béla · Streaming')).toMatchObject({
      kind: 'expense',
      counterparty: 'Nagy Béla',
    });
    // A fee is named after the transfer it belongs to.
    expect(byDescription(rows, 'Bank fee · Nagy Béla')).toMatchObject({
      amount: 230,
      counterparty: null,
      flags: ['bank-fee'],
    });
    // Its transfer is in an earlier export: the type is all there is.
    expect(byDescription(rows, 'Tranzakciós költség').flags).toEqual(['bank-fee']);
    expect(byDescription(rows, 'Kamat')).toMatchObject({ kind: 'income', amount: 2 });
  });

  it('flags cash withdrawals', () => {
    expect(byDescription(rows, 'BEKE U 9.')).toMatchObject({
      occurredOn: '2026-09-24',
      flags: ['cash-withdrawal'],
    });
  });

  it('names missing columns', () => {
    const broken = KH.replace('partner elnevezése', 'partner');
    expect(() => parseStatement(broken)).toThrow('no "partner elnevezése" column');
  });
});

describe('parseStatement', () => {
  it('explains files it does not know', () => {
    expect(() => parseStatement('date;amount\n2026-01-01;5')).toThrow(StatementError);
    expect(() => parseStatement('')).toThrow('not a Revolut or K&H export');
  });

  it('points at the line of an unreadable row', () => {
    const bad = REVOLUT_EN.replace('-1857.00', 'lots');
    expect(() => parseStatement(bad)).toThrow('Line 2: Unreadable amount "lots"');
  });
});
