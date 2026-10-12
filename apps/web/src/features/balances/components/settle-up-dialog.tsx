import type { Balances, HouseholdDetail, TransactionPerson } from '@splinance/shared';
import { revalidateLogic, useForm } from '@tanstack/react-form';
import { toast } from 'sonner';
import { firstError } from '@/components/form/first-error';
import { FormError } from '@/components/form/form-error';
import { TextField } from '@/components/form/text-field';
import { RouteDialog } from '@/components/route-dialog';
import { SegmentedControl } from '@/components/segmented-control';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { HeroAmountInput } from '@/features/transactions/components/amount-inputs';
import { formatMoney } from '@/features/transactions/money';
import { errorMessage } from '@/lib/query-client';
import { cn } from '@/lib/utils';
import { pairBalance } from '../debts';
import {
  newSettlementValues,
  parseSettlementInput,
  remainingHint,
  settlementDefaults,
  settlementFormSchema,
} from '../form';
import { useCreateSettlement } from '../hooks';

/**
 * Who the viewer can settle with: the other active members, plus anyone who left but
 * still has an open debt with the viewer.
 */
function settleCandidates(
  household: HouseholdDetail,
  balances: Balances,
  viewerId: string,
): TransactionPerson[] {
  const people = new Map<string, TransactionPerson>();
  for (const member of household.members) {
    if (member.userId !== viewerId) people.set(member.userId, member);
  }
  for (const debt of balances.debts) {
    for (const person of [debt.from, debt.to]) {
      const involved = debt.from.userId === viewerId || debt.to.userId === viewerId;
      if (involved && person.userId !== viewerId && !people.has(person.userId)) {
        people.set(person.userId, person);
      }
    }
  }
  return [...people.values()];
}

/** The person to start with: the one asked for, else the viewer's largest debt, else anyone. */
function initialCounterpart(
  candidates: TransactionPerson[],
  balances: Balances,
  viewerId: string,
  requested: string | undefined,
): TransactionPerson | undefined {
  const byId = (id: string | undefined) => candidates.find((person) => person.userId === id);
  const largest = balances.debts.find(
    (debt) => debt.from.userId === viewerId || debt.to.userId === viewerId,
  );
  const fromLargest =
    largest && (largest.from.userId === viewerId ? largest.to.userId : largest.from.userId);
  return byId(requested) ?? byId(fromLargest) ?? candidates[0];
}

/**
 * Records a payment made outside the app between the viewer and someone else. Prefilled
 * with the whole debt; any amount works, and a live hint says what is left afterwards.
 */
export function SettleUpDialog({
  household,
  balances,
  viewerId,
  requestedUserId,
  onClose,
}: {
  household: HouseholdDetail;
  balances: Balances;
  viewerId: string;
  requestedUserId: string | undefined;
  onClose: () => void;
}) {
  const currency = balances.currency;
  const candidates = settleCandidates(household, balances, viewerId);
  const start = initialCounterpart(candidates, balances, viewerId, requestedUserId);

  return (
    <RouteDialog title="Settle up" onClose={onClose}>
      {start ? (
        <SettleUpForm
          householdId={household.id}
          balances={balances}
          viewerId={viewerId}
          candidates={candidates}
          start={start}
          currency={currency}
          onClose={onClose}
        />
      ) : (
        <p className="text-muted-foreground">
          Invite someone to {household.name} first: payments are between two people.
        </p>
      )}
    </RouteDialog>
  );
}

function SettleUpForm({
  householdId,
  balances,
  viewerId,
  candidates,
  start,
  currency,
  onClose,
}: {
  householdId: string;
  balances: Balances;
  viewerId: string;
  candidates: TransactionPerson[];
  start: TransactionPerson;
  currency: Balances['currency'];
  onClose: () => void;
}) {
  const create = useCreateSettlement();
  const form = useForm({
    defaultValues: newSettlementValues(
      start.userId,
      pairBalance(balances.debts, viewerId, start.userId),
      currency,
    ),
    validationLogic: revalidateLogic(),
    validators: { onDynamic: settlementFormSchema(viewerId, currency) },
    onSubmit: async ({ value }) => {
      try {
        await create.mutateAsync({
          householdId,
          input: parseSettlementInput(value, viewerId, currency),
        });
        toast.success('Payment recorded');
        onClose();
      } catch {
        // Rendered from the mutation error below.
      }
    },
  });

  return (
    <form
      noValidate
      className="min-w-0 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <FormError message={create.error ? errorMessage(create.error) : undefined} />

      <form.Subscribe selector={(state) => state.values}>
        {(values) => {
          const person =
            candidates.find((candidate) => candidate.userId === values.counterpartId) ?? start;
          const balance = pairBalance(balances.debts, viewerId, person.userId);
          const hint = remainingHint(balance, values, person, currency);
          const name = person.displayName;

          return (
            <>
              {candidates.length > 1 && (
                <div className="space-y-1.5">
                  <p className="text-sm font-medium">With</p>
                  <SegmentedControl
                    label="With"
                    value={values.counterpartId}
                    onChange={(userId) => {
                      // A different person: start from their balance again.
                      const defaults = settlementDefaults(
                        userId,
                        pairBalance(balances.debts, viewerId, userId),
                        currency,
                      );
                      form.setFieldValue('counterpartId', defaults.counterpartId);
                      form.setFieldValue('direction', defaults.direction);
                      form.setFieldValue('amount', defaults.amount);
                      create.reset();
                    }}
                    options={candidates.map((candidate) => ({
                      value: candidate.userId,
                      label: candidate.displayName,
                    }))}
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <form.Field name="direction">
                  {(field) => (
                    <SegmentedControl
                      label="Who paid"
                      value={field.state.value}
                      onChange={field.handleChange}
                      options={[
                        { value: 'they-paid', label: `${name} paid you` },
                        { value: 'you-paid', label: `You paid ${name}` },
                      ]}
                    />
                  )}
                </form.Field>
                <p className="text-muted-foreground text-sm">
                  {balance > 0
                    ? `${name} owes you ${formatMoney(balance, currency)}`
                    : balance < 0
                      ? `You owe ${name} ${formatMoney(-balance, currency)}`
                      : `You and ${name} are all square`}
                </p>
              </div>

              <form.Field name="amount">
                {(field) => {
                  const error = firstError(field.state.meta.errors);
                  return (
                    <div className="space-y-1.5">
                      <Label htmlFor="settle-amount" className="sr-only">
                        Amount
                      </Label>
                      <HeroAmountInput
                        id="settle-amount"
                        value={field.state.value}
                        onChange={field.handleChange}
                        onBlur={field.handleBlur}
                        currency={currency}
                        error={error}
                        autoFocus={false}
                      />
                      {error ? (
                        <p
                          id="settle-amount-error"
                          className="text-destructive text-center text-sm"
                        >
                          {error}
                        </p>
                      ) : (
                        hint && (
                          <p
                            aria-live="polite"
                            className={cn(
                              'text-center text-sm',
                              hint.square ? 'text-positive' : 'text-muted-foreground',
                            )}
                          >
                            {hint.text}
                          </p>
                        )
                      )}
                    </div>
                  );
                }}
              </form.Field>
            </>
          );
        }}
      </form.Subscribe>

      <div className="grid grid-cols-2 gap-3">
        <form.Field name="settledOn">
          {(field) => <TextField field={field} required label="Date" type="date" />}
        </form.Field>
        <form.Field name="note">
          {(field) => (
            <TextField field={field} label="Note" placeholder="Cash, Revolut" maxLength={200} />
          )}
        </form.Field>
      </div>

      <p className="text-muted-foreground text-xs">
        Records a payment made outside Splinance. No money moves here.
      </p>

      <div className="flex justify-end pt-2">
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" size="lg" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Record payment'}
            </Button>
          )}
        </form.Subscribe>
      </div>
    </form>
  );
}
