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
import { acceptInvite, createInvite } from '../invites/invites.service';
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
    await createImport(scopeOf(file.person), input);
  }

  for (const transaction of story.transactions) {
    if (transaction.source === 'manual') {
      await createTransaction(scopeOf(transaction.person), toInput(transaction));
    }
  }

  for (const settlement of story.settlements) {
    await createSettlement(scopeOf(settlement.from), {
      fromUserId: people[settlement.from],
      toUserId: people[settlement.to],
      amount: settlement.amount,
      settledOn: settlement.settledOn,
      note: settlement.note,
    });
  }

  return householdId;
}
