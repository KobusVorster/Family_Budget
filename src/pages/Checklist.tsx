import { useMemo, useState } from 'react';
import { useBudget } from '../store/BudgetContext';
import type { Expense } from '../types';
import {
  activeExpenses,
  amountIn,
  billStatus,
  checklistKey,
  checklistProgress,
  monthKey,
} from '../lib/calc';
import { formatMoney } from '../lib/money';
import { seriesColor } from '../lib/palette';
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Meter,
  Modal,
  MoneyInput,
  PageHeader,
  StatTile,
} from '../components/ui';
import { IconCheck } from '../components/icons';

function shiftMonth(month: string, delta: number): string {
  const [year, index] = month.split('-').map(Number);
  return monthKey(new Date(year, index - 1 + delta, 1));
}

function monthLabel(month: string): string {
  const [year, index] = month.split('-').map(Number);
  return new Date(year, index - 1, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

export default function Checklist() {
  const { data, conversion, setPaidAmount, setChecklistBulk } = useBudget();
  const currency = conversion.target;
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [paying, setPaying] = useState<Expense | null>(null);

  const expenses = useMemo(() => activeExpenses(data), [data]);
  const progress = checklistProgress(data, month, conversion);
  const fraction = progress.total > 0 ? progress.paid / progress.total : 0;

  const groups = useMemo(() => {
    const buckets = [
      ...data.people.map((person) => ({
        id: person.id,
        title: `${person.name}’s bills`,
        color: seriesColor(person.slot),
        items: expenses.filter((expense) => expense.owner === person.id),
      })),
      {
        id: 'shared',
        title: 'Shared bills',
        color: seriesColor(3),
        items: expenses.filter((expense) => expense.owner === 'shared'),
      },
    ];
    return buckets.filter((bucket) => bucket.items.length > 0);
  }, [data.people, expenses]);

  const isCurrentMonth = month === monthKey(new Date());

  return (
    <div className="rise">
      <PageHeader
        title="Checklist"
        subtitle="Tick a bill off when it is paid in full, or press the amount to record a part payment. Use the arrows to change month."
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center gap-1 rounded-lg border border-hairline bg-surface p-0.5">
          <Button variant="ghost" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">
            ‹
          </Button>
          <span className="min-w-[9.5rem] text-center text-sm font-medium">{monthLabel(month)}</span>
          <Button variant="ghost" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month">
            ›
          </Button>
        </div>
        {!isCurrentMonth && (
          <Button onClick={() => setMonth(monthKey(new Date()))}>Go to this month</Button>
        )}
      </div>

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Paid"
          value={`${progress.paid} / ${progress.total}`}
          tone={fraction >= 1 ? 'good' : undefined}
          detail={progress.part > 0 ? `${progress.part} part paid` : undefined}
        >
          <div className="mt-3">
            <Meter
              value={fraction}
              tone={fraction >= 1 ? 'good' : 'warning'}
              label={`${progress.paid} of ${progress.total} paid`}
            />
          </div>
        </StatTile>
        <StatTile
          label="Left to pay"
          value={formatMoney(progress.outstanding, currency, { round: 'auto' })}
          tone={progress.outstanding > 0 ? undefined : 'good'}
        />
        <StatTile
          label="Paid so far"
          value={formatMoney(progress.settled, currency, { round: 'auto' })}
        />
      </div>

      {expenses.length === 0 ? (
        <Card>
          <EmptyState
            title="No bills yet"
            body="Add bills on the Money out page and they will show up here."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((group) => {
            const statuses = group.items.map((expense) => ({
              expense,
              status: billStatus(data, expense, month),
            }));
            const allPaid = statuses.every((entry) => entry.status.state === 'paid');
            const groupLeft = statuses.reduce(
              (total, entry) =>
                total + amountIn(entry.status.remaining, entry.expense.currency, conversion),
              0,
            );

            return (
              <Card key={group.id} padded={false}>
                <CardHeader
                  inset
                  title={group.title}
                  subtitle={
                    allPaid
                      ? `${group.items.length} bills · all paid`
                      : `${group.items.length} bills · ${formatMoney(groupLeft, currency, { round: 'auto' })} left`
                  }
                  action={
                    <Button
                      onClick={() =>
                        setChecklistBulk(
                          statuses.map((entry) => ({
                            key: checklistKey(entry.expense.id, month),
                            amount: allPaid ? 0 : entry.status.due,
                          })),
                        )
                      }
                    >
                      {allPaid ? 'Untick all' : 'Tick all'}
                    </Button>
                  }
                />
                <ul>
                  {statuses.map(({ expense, status }) => {
                    const key = checklistKey(expense.id, month);
                    const done = status.state === 'paid';
                    const part = status.state === 'part';

                    return (
                      <li
                        key={expense.id}
                        className="flex items-center gap-3 border-t border-hairline px-5 py-3 sm:px-6"
                      >
                        <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
                          <input
                            type="checkbox"
                            checked={done}
                            aria-label={`${expense.label} paid in full`}
                            onChange={() => setPaidAmount(key, done ? 0 : status.due)}
                            className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border border-axis transition checked:border-transparent checked:bg-good"
                          />
                          <IconCheck
                            className="pointer-events-none absolute h-3.5 w-3.5 text-white opacity-0 peer-checked:opacity-100"
                            strokeWidth={2.6}
                          />
                        </span>

                        <span
                          aria-hidden
                          className="h-8 w-1 shrink-0 rounded-full"
                          style={{ background: group.color }}
                        />

                        <div className="min-w-0 flex-1">
                          <p
                            className={`truncate text-sm font-medium ${
                              done ? 'text-muted line-through' : 'text-ink'
                            }`}
                          >
                            {expense.label}
                          </p>
                          {part ? (
                            <p className="truncate text-xs" style={{ color: 'var(--color-muted)' }}>
                              {formatMoney(status.paid, expense.currency, { round: 'auto' })} of{' '}
                              {formatMoney(status.due, expense.currency, { round: 'auto' })} paid ·{' '}
                              <strong className="font-semibold text-ink">
                                {formatMoney(status.remaining, expense.currency, {
                                  round: 'auto',
                                })}{' '}
                                left
                              </strong>
                            </p>
                          ) : (
                            expense.account && (
                              <p className="truncate text-xs text-muted">{expense.account}</p>
                            )
                          )}
                          {part && (
                            <div className="mt-1.5 max-w-56">
                              <Meter value={status.progress} tone="warning" height={4} />
                            </div>
                          )}
                        </div>

                        {/* The amount doubles as the button for a part payment,
                            so there is no extra control cluttering the row. */}
                        <button
                          type="button"
                          onClick={() => setPaying(expense)}
                          title="Record a part payment"
                          className="shrink-0 rounded-lg px-2 py-1 text-right transition hover:bg-sunken"
                        >
                          <span
                            className={`tnum block text-sm font-medium ${
                              done ? 'text-muted' : 'text-ink'
                            }`}
                          >
                            {formatMoney(
                              amountIn(
                                part ? status.remaining : status.due,
                                expense.currency,
                                conversion,
                              ),
                              currency,
                              { round: 'auto' },
                            )}
                          </span>
                          <span className="block text-[0.7rem] text-muted">
                            {done ? 'paid' : part ? 'left' : 'pay part'}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            );
          })}
        </div>
      )}

      {paying && (
        <PartPayment
          expense={paying}
          month={month}
          onClose={() => setPaying(null)}
          onSave={(amount) => {
            setPaidAmount(checklistKey(paying.id, month), amount);
            setPaying(null);
          }}
        />
      )}
    </div>
  );
}

/* -- part payment ---------------------------------------------------------- */

function PartPayment({
  expense,
  month,
  onSave,
  onClose,
}: {
  expense: Expense;
  month: string;
  onSave: (amount: number) => void;
  onClose: () => void;
}) {
  const { data } = useBudget();
  const status = billStatus(data, expense, month);
  const [paid, setPaid] = useState(status.paid);

  const remaining = Math.max(0, status.due - paid);
  const money = (value: number) => formatMoney(value, expense.currency, { round: 'auto' });

  return (
    <Modal
      open
      onClose={onClose}
      title={expense.label || 'Bill'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => onSave(paid)}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <dl className="grid grid-cols-2 gap-3 rounded-lg bg-sunken p-3 text-sm">
          <div>
            <dt className="text-ink-2">Due this month</dt>
            <dd className="tnum mt-0.5 font-semibold text-ink">{money(status.due)}</dd>
          </div>
          <div>
            <dt className="text-ink-2">Still to pay</dt>
            <dd className="tnum mt-0.5 font-semibold text-ink">{money(remaining)}</dd>
          </div>
        </dl>

        <Field
          label={`Paid so far (${expense.currency})`}
          hint="Type what you have actually paid towards this bill this month."
        >
          {(id) => <MoneyInput id={id} value={paid} onValueChange={setPaid} />}
        </Field>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setPaid(status.due)}>Paid in full</Button>
          <Button onClick={() => setPaid(Math.round(status.due * 50) / 100)}>Half</Button>
          <Button onClick={() => setPaid(0)}>Nothing yet</Button>
        </div>

        {paid > status.due + 0.005 && (
          <p className="text-sm" style={{ color: 'var(--color-critical-text)' }}>
            That is {money(paid - status.due)} more than the bill. Fine if you overpaid — it will
            just show as paid in full.
          </p>
        )}
      </div>
    </Modal>
  );
}
