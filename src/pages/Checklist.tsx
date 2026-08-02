import { useMemo, useState } from 'react';
import { useBudget } from '../store/BudgetContext';
import {
  activeExpenses,
  checklistKey,
  checklistProgress,
  monthKey,
  monthlyValue,
} from '../lib/calc';
import { formatMoney } from '../lib/money';
import { seriesColor } from '../lib/palette';
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  Meter,
  PageHeader,
  StatTile,
} from '../components/ui';
import { IconCheck } from '../components/icons';

function shiftMonth(month: string, delta: number): string {
  const [year, index] = month.split('-').map(Number);
  const date = new Date(year, index - 1 + delta, 1);
  return monthKey(date);
}

function monthLabel(month: string): string {
  const [year, index] = month.split('-').map(Number);
  return new Date(year, index - 1, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

export default function Checklist() {
  const { data, conversion, toggleChecklist, setChecklistBulk } = useBudget();
  const currency = conversion.target;
  const [month, setMonth] = useState(() => monthKey(new Date()));

  const expenses = useMemo(() => activeExpenses(data), [data]);
  const progress = checklistProgress(data, month, conversion);
  const fraction = progress.total > 0 ? progress.paid / progress.total : 0;

  const groups = useMemo(() => {
    const buckets: Array<{ id: string; title: string; color: string; items: typeof expenses }> = [
      ...data.people.map((person) => ({
        id: person.id,
        title: `${person.fullName}’s bills`,
        color: seriesColor(person.slot),
        items: expenses.filter((expense) => expense.owner === person.id),
      })),
      {
        id: 'shared',
        title: 'Shared household',
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
        title="Monthly check"
        subtitle="Tick each bill off as it clears. This is the month-end grid from the spreadsheet, one month at a time instead of seven columns of TRUE and FALSE."
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
          <Button onClick={() => setMonth(monthKey(new Date()))}>Back to this month</Button>
        )}
      </div>

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Ticked off"
          value={`${progress.paid} / ${progress.total}`}
          tone={fraction >= 1 ? 'good' : undefined}
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
          label="Still to pay"
          value={formatMoney(progress.outstanding, currency)}
          tone={progress.outstanding > 0 ? undefined : 'good'}
        />
        <StatTile
          label="Already paid"
          value={formatMoney(
            expenses.reduce(
              (total, expense) =>
                data.checklist[checklistKey(expense.id, month)]
                  ? total + monthlyValue(expense, conversion)
                  : total,
              0,
            ),
            currency,
          )}
        />
      </div>

      {expenses.length === 0 ? (
        <Card>
          <EmptyState
            title="No active expenses"
            body="Add expenses and they will appear here to tick off each month."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((group) => {
            const keys = group.items.map((expense) => checklistKey(expense.id, month));
            const allPaid = keys.every((key) => data.checklist[key]);
            const groupTotal = group.items.reduce(
              (total, expense) => total + monthlyValue(expense, conversion),
              0,
            );

            return (
              <Card key={group.id} padded={false}>
                <CardHeader
                  inset
                  title={group.title}
                  subtitle={`${group.items.length} bills · ${formatMoney(groupTotal, currency)}`}
                  action={
                    <Button onClick={() => setChecklistBulk(keys, !allPaid)}>
                      {allPaid ? 'Untick all' : 'Tick all'}
                    </Button>
                  }
                />
                <ul>
                  {group.items.map((expense) => {
                    const key = checklistKey(expense.id, month);
                    const paid = Boolean(data.checklist[key]);
                    return (
                      <li key={expense.id} className="border-t border-hairline">
                        <label className="flex cursor-pointer items-center gap-3 px-5 py-3 transition hover:bg-sunken sm:px-6">
                          <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
                            <input
                              type="checkbox"
                              checked={paid}
                              onChange={() => toggleChecklist(key)}
                              className="peer h-5 w-5 appearance-none rounded-md border border-axis transition checked:border-transparent checked:bg-good"
                            />
                            <IconCheck
                              className="pointer-events-none absolute h-3.5 w-3.5 text-white opacity-0 peer-checked:opacity-100"
                              strokeWidth={2.6}
                            />
                          </span>
                          <span
                            aria-hidden
                            className="h-6 w-1 shrink-0 rounded-full"
                            style={{ background: group.color }}
                          />
                          <span className="min-w-0 flex-1">
                            <span
                              className={`block truncate text-sm font-medium ${
                                paid ? 'text-muted line-through' : 'text-ink'
                              }`}
                            >
                              {expense.label}
                            </span>
                            {expense.account && (
                              <span className="block truncate text-xs text-muted">
                                {expense.account}
                              </span>
                            )}
                          </span>
                          <span
                            className={`tnum shrink-0 text-sm font-medium ${
                              paid ? 'text-muted' : 'text-ink'
                            }`}
                          >
                            {formatMoney(monthlyValue(expense, conversion), currency)}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
