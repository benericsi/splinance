import {
  type DemoPerson,
  type DemoStory,
  type DemoTransaction,
  demoParseOptions,
  importInputSchema,
  type ImportRow,
  parseStatement,
  renderDemoBankFiles,
  type TransactionInput,
} from '@splinance/shared';
import { setBudget } from '../budgets/budgets.service';
import { listCategories } from '../categories/categories.service';
import { createHousehold } from '../households/households.service';
import { createImport } from '../imports/imports.service';
import { withoutActivity } from '../notifications/activity';
import { syncNotifications } from '../notifications/sync';
import { acceptInvite, createInvite } from '../invites/invites.service';
import { confirmSuggestion, createSeries } from '../recurring/recurring.service';
import { createRule } from '../rules/rules.service';
import { createSettlement } from '../settlements/settlements.service';
import { createTransaction } from '../transactions/transactions.service';

/** User ids of the story's two roles. */
export type DemoPeople = Record<DemoPerson, string>;

/**
 * Turns a demo story into a real household, only through the services the routes use: the
 * partner joins with an invite, bank history arrives as monthly imports of the story's
 * exports (read by `parseStatement`, like the import page does), the rest is entered by
 * hand. Splits, the deferred split-sum check, audit entries, fingerprints and balances
 * therefore hold exactly as for real users. Each call is its own database transaction;
 * the caller deletes the sandbox if one fails.
 */
export async function seedDemo(story: DemoStory, people: DemoPeople): Promise<string> {
  const household = await createHousehold(people.you, { name: story.householdName });
  const householdId = household.id;
  const scopeOf = (person: DemoPerson) => ({ userId: people[person], householdId });

  const { token } = await createInvite(scopeOf('you'));
  await acceptInvite({ userId: people.partner, token });

  const categoryIds = new Map(
    (await listCategories(scopeOf('you'))).map((c) => [`${c.kind}:${c.name}`, c.id]),
  );
  const categoryId = (kind: DemoTransaction['kind'], name: string): string => {
    const id = categoryIds.get(`${kind}:${name}`);
    if (!id) throw new Error(`Demo story names an unknown ${kind} category "${name}"`);
    return id;
  };

  for (const rule of story.rules) {
    await createRule(scopeOf('you'), {
      pattern: rule.pattern,
      categoryId: categoryId('expense', rule.category),
      markShared: rule.markShared,
    });
  }
  for (const budget of story.budgets) {
    await setBudget(
      { ...scopeOf('you'), categoryId: categoryId('expense', budget.category) },
      { amount: budget.amount, from: budget.from },
    );
  }

  const toInput = (t: DemoTransaction): TransactionInput => {
    const base = {
      kind: t.kind,
      amount: t.amount,
      occurredOn: t.occurredOn,
      description: t.description,
      categoryId: t.category === null ? null : categoryId(t.kind, t.category),
    };
    if (t.share.visibility === 'private') return { ...base, visibility: 'private' };
    const { split } = t.share;
    return {
      ...base,
      visibility: 'shared',
      paidBy: people[t.person],
      split:
        split.method === 'equal'
          ? { method: 'equal', userIds: [people.you, people.partner] }
          : split.method === 'percentage'
            ? {
                method: 'percentage',
                shares: [
                  { userId: people.you, basisPoints: split.you },
                  { userId: people.partner, basisPoints: 10_000 - split.you },
                ],
              }
            : {
                method: 'fixed',
                shares: [
                  { userId: people.you, amount: split.you },
                  { userId: people.partner, amount: t.amount - split.you },
                ],
              },
    };
  };

  // A year of the partner's changes would bury the visitor's bell: the history goes in
  // without activity notifications, except what the partner did in the last few days (this
  // month's import, recent dinners and payments), which reads like a real week.
  const recentFrom = daysBefore(story.today, RECENT_ACTIVITY_DAYS);
  const thisMonth = story.today.slice(0, 7);
  const quietly = <T>(loud: boolean, work: () => Promise<T>) =>
    loud ? work() : withoutActivity(work);

  const transactionsById = new Map(story.transactions.map((t) => [t.id, t]));
  const rowsById = new Map(story.bankRows.map((row) => [row.id, row]));

  // Each person imports their bank export once a month. Rows that are not spending (own
  // transfers, cash, payments between the two) are left out, as the review would.
  for (const file of renderDemoBankFiles(story)) {
    const parsed = parseStatement(file.text, demoParseOptions(file.person));
    const rows: ImportRow[] = [];
    for (const parsedRow of parsed.rows) {
      const rowId = file.lines.find((line) => line.line === parsedRow.line)?.rowId;
      const ref = rowsById.get(rowId ?? '')?.ref;
      if (!ref || !('transaction' in ref)) continue;
      const transaction = transactionsById.get(ref.transaction);
      if (!transaction || !parsedRow.fingerprint) {
        throw new Error(`${file.fileName} line ${String(parsedRow.line)} does not match the story`);
      }
      rows.push({
        fingerprint: parsedRow.fingerprint,
        counterparty: parsedRow.counterparty,
        transaction: toInput(transaction),
      });
    }
    if (rows.length === 0) continue;
    // The same contract the import route enforces.
    const input = importInputSchema.parse({ source: file.source, fileName: file.fileName, rows });
    await quietly(file.person === 'partner' && file.month === thisMonth, () =>
      createImport(scopeOf(file.person), input),
    );
  }

  for (const transaction of story.transactions) {
    if (transaction.source === 'manual') {
      const loud = transaction.person === 'partner' && transaction.occurredOn >= recentFrom;
      await quietly(loud, () =>
        createTransaction(scopeOf(transaction.person), toInput(transaction)),
      );
    }
  }

  for (const settlement of story.settlements) {
    const loud = settlement.from === 'partner' && settlement.settledOn >= recentFrom;
    await quietly(loud, () =>
      createSettlement(scopeOf(settlement.from), {
        fromUserId: people[settlement.from],
        toUserId: people[settlement.to],
        amount: settlement.amount,
        settledOn: settlement.settledOn,
        note: settlement.note,
      }),
    );
  }

  // Recurring payments last: detection and matching look at the transactions above. Dates
  // follow the story's day, not the server's.
  const options = { today: story.today };
  for (const confirmed of story.recurring.confirmed) {
    await confirmSuggestion(
      scopeOf(confirmed.person),
      { scope: confirmed.scope, key: confirmed.key },
      options,
    );
  }
  for (const added of story.recurring.added) {
    await createSeries(
      scopeOf(added.person),
      {
        name: added.name,
        pattern: added.pattern,
        cadence: added.cadence,
        amount: added.amount,
        amountVaries: false,
        anchorOn: added.anchorOn,
        startsOn: null,
        categoryId: categoryId('expense', added.category),
        scope: added.scope,
        remind: true,
      },
      options,
    );
  }

  // The bell's renewals and budget alerts, as of the story's day.
  await syncNotifications(householdId, { today: story.today });

  return householdId;
}

/** How far back the partner's changes notify the visitor in a fresh demo. */
const RECENT_ACTIVITY_DAYS = 3;

function daysBefore(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}
