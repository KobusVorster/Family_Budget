import { useMemo } from 'react';
import { useBudget } from '../store/BudgetContext';
import {
  activeExpenses,
  categoryBreakdown,
  checklistProgress,
  ledgerSources,
  monthKey,
  reviewQueue,
  summariseDebts,
  summariseHousehold,
  totalDebtRemaining,
  weeklyLedger,
} from '../lib/calc';
import { formatMoney, formatPercent } from '../lib/money';
import { loadTone, seriesColor } from '../lib/palette';
import {
  Banner,
  Button,
  Card,
  CardHeader,
  HeroFigure,
  Meter,
  StatTile,
} from '../components/ui';
import { ChartFrame, DataTable, RankedBars, ShareBar, StackedColumns } from '../components/charts';

export default function Dashboard() {
  const { data, conversion } = useBudget();
  const currency = conversion.target;

  const household = useMemo(() => summariseHousehold(data, conversion), [data, conversion]);
  const categories = useMemo(
    () => categoryBreakdown(activeExpenses(data), conversion),
    [data, conversion],
  );
  const debts = useMemo(() => summariseDebts(data), [data]);
  const debtTotal = useMemo(() => totalDebtRemaining(data, conversion), [data, conversion]);
  const estimates = useMemo(() => reviewQueue(data).length, [data]);

  const sources = useMemo(() => ledgerSources(data.ledger), [data.ledger]);
  const weekly = useMemo(() => weeklyLedger(data.ledger, conversion, 8), [data.ledger, conversion]);
  const columnPoints = useMemo(
    () =>
      weekly.map((point) => ({
        label: point.label,
        segments: sources.map((source, index) => ({
          key: source,
          value: point.bySource[source] ?? 0,
          // Slots 1 and 2 are reserved for Will and Liz across the whole app,
          // so gig sources start at slot 4.
          color: seriesColor(4 + index),
        })),
      })),
    [weekly, sources],
  );

  const thisMonth = monthKey(new Date());
  /* Only two tones may colour a figure. A thin-but-positive margin used to show
     amber here, but amber on the light surface measures 1.79:1 — unreadable at
     any size — so that case stays in plain ink and the caption says it. */
  const netTone = household.net < 0 ? 'critical' : 'good';
  const thinMargin = household.net >= 0 && household.net < household.income * 0.05;

  const activeDebts = debts.filter((debt) => debt.remaining > 0);
  const nearestPayoff = activeDebts
    .filter((debt) => debt.payoffDate)
    .sort((a, b) => (a.payoffDate! < b.payoffDate! ? -1 : 1))[0];

  return (
    <div className="rise">
      {data.settings.dataMode === 'sample' && (
        <Banner
          title={`${estimates} amounts are still guesses`}
          action={
            <Button variant="secondary" onClick={() => (window.location.hash = 'settings')}>
              See the list
            </Button>
          }
        >
          They are marked <strong className="font-semibold text-ink">guess</strong> where they show
          up. To fix one: open the page it is on, press Edit, type the real amount, press Save.
        </Banner>
      )}

      <div className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <Card className="flex flex-col justify-between gap-6">
          <HeroFigure
            label="Left over each month"
            value={formatMoney(household.net, currency)}
            tone={netTone}
            caption={
              <>
                {formatMoney(household.income, currency)} in. {formatMoney(household.expenses, currency)}{' '}
                out.{' '}
                {household.net < 0
                  ? 'You spend more than you earn.'
                  : thinMargin
                    ? 'Not much spare.'
                    : 'You have money spare.'}
              </>
            }
          />
          <dl className="grid grid-cols-2 gap-4 border-t border-hairline pt-4 text-sm">
            <div>
              <dt className="text-ink-2">Shared bills</dt>
              <dd className="tnum mt-0.5 text-lg font-semibold">
                {formatMoney(household.shared, currency)}
              </dd>
            </div>
            <div>
              <dt className="text-ink-2">Debt left</dt>
              <dd className="tnum mt-0.5 text-lg font-semibold">
                {formatMoney(debtTotal, currency)}
              </dd>
            </div>
          </dl>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2">
          {household.people.map((summary) => {
            const tone = loadTone(summary.committed);
            return (
              <StatTile
                key={summary.person.id}
                label={`${summary.person.name} — left over`}
                accent={seriesColor(summary.person.slot)}
                value={formatMoney(summary.net, currency)}
                tone={summary.net < 0 ? 'critical' : undefined}
                detail={
                  <>
                    {formatMoney(summary.income, currency)} in ·{' '}
                    {formatMoney(summary.burden, currency)} out
                  </>
                }
              >
                <div className="mt-3">
                  <Meter
                    value={summary.committed}
                    tone={tone}
                    label={`Bills use ${formatPercent(summary.committed)} of what ${summary.person.name} earns`}
                  />
                  <p className="mt-1.5 text-xs text-muted">
                    Bills use {formatPercent(summary.committed)} of what {summary.person.name} earns
                  </p>
                </div>
              </StatTile>
            );
          })}

          <StatTile
            label="Shared bills"
            accent={seriesColor(3)}
            value={formatMoney(household.shared, currency)}
            detail="Rent, Maggie, internet, Daddy, Liz top-up"
          />
          <StatTile
            label="Debt left to pay"
            value={formatMoney(debtTotal, currency)}
            detail={
              nearestPayoff
                ? `${nearestPayoff.debt.label} is paid off first, ${new Date(
                    `${nearestPayoff.payoffDate}T00:00:00`,
                  ).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
                : 'No payment plan set'
            }
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartFrame
          title="Where the money goes"
          subtitle="Every bill, as a monthly amount."
          table={
            <DataTable
              columns={['Category', 'Per month', 'Share']}
              rows={categories.map((slice) => [
                slice.category,
                formatMoney(slice.amount, currency),
                formatPercent(slice.share),
              ])}
            />
          }
        >
          <RankedBars
            items={categories.map((slice) => ({
              label: slice.category,
              value: slice.amount,
              meta: `${formatPercent(slice.share)} of all spending`,
            }))}
            currency={currency}
          />
        </ChartFrame>

        <div className="flex flex-col gap-4">
          <ChartFrame
            title="Who spends what"
            subtitle="Own bills next to shared bills."
            table={
              <DataTable
                columns={['Who', 'Per month']}
                rows={[
                  ...household.people.map((summary) => [
                    `${summary.person.name} — own bills`,
                    formatMoney(summary.personal, currency),
                  ]),
                  ['Shared', formatMoney(household.shared, currency)],
                ]}
              />
            }
          >
            <ShareBar
              currency={currency}
              slices={[
                ...household.people.map((summary) => ({
                  label: `${summary.person.name} — own bills`,
                  value: summary.personal,
                  color: seriesColor(summary.person.slot),
                })),
                { label: 'Shared bills', value: household.shared, color: seriesColor(3) },
              ]}
            />
          </ChartFrame>

          <ChartFrame
            title="Will’s gig money, per week"
            subtitle="DoorDash and Lyft added up week by week."
            legend={sources.map((source, index) => ({
              label: source,
              color: seriesColor(4 + index),
            }))}
            table={
              <DataTable
                columns={['Week of', ...sources, 'Total']}
                rows={weekly.map((point) => [
                  point.label,
                  ...sources.map((source) =>
                    formatMoney(point.bySource[source] ?? 0, currency),
                  ),
                  formatMoney(point.total, currency),
                ])}
              />
            }
          >
            <StackedColumns points={columnPoints} currency={currency} />
          </ChartFrame>
        </div>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Debt"
          subtitle={`${activeDebts.length} of ${debts.length} loans still to pay.`}
          action={
            <Button variant="ghost" onClick={() => (window.location.hash = 'debt')}>
              Open
            </Button>
          }
        />
        {activeDebts.length === 0 ? (
          <p className="text-sm text-ink-2">All loans are paid off.</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {activeDebts.map((summary) => {
              const person = data.people.find((p) => p.id === summary.debt.personId);
              return (
                <li key={summary.debt.id}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm font-medium text-ink">
                      {summary.debt.label}
                      <span className="ml-2 text-xs font-normal text-muted">{person?.name}</span>
                    </span>
                    <span className="tnum shrink-0 text-sm text-ink-2">
                      {formatMoney(summary.remaining, summary.debt.currency)} left
                    </span>
                  </div>
                  <Meter
                    value={summary.progress}
                    tone="good"
                    label={`${summary.debt.label}: ${formatPercent(summary.progress)} paid off`}
                  />
                  <p className="mt-1.5 text-xs text-muted">
                    {formatPercent(summary.progress)} paid off ·{' '}
                    {summary.monthsLeft > 0
                      ? `${summary.monthsLeft} payments to go`
                      : 'no payment plan set'}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="mt-4">
        <CardHeader
          title="This month"
          subtitle="Tick off each bill when you pay it."
          action={
            <Button variant="ghost" onClick={() => (window.location.hash = 'checklist')}>
              Open
            </Button>
          }
        />
        <MonthProgress month={thisMonth} />
      </Card>
    </div>
  );
}

function MonthProgress({ month }: { month: string }) {
  const { data, conversion } = useBudget();
  const progress = checklistProgress(data, month, conversion);
  const fraction = progress.total > 0 ? progress.paid / progress.total : 0;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-sm text-ink-2">
          {progress.paid} of {progress.total} paid
        </span>
        <span className="tnum text-sm font-medium text-ink">
          {formatMoney(progress.outstanding, conversion.target)} left to pay
        </span>
      </div>
      <Meter value={fraction} tone={fraction >= 1 ? 'good' : 'warning'} label="Month progress" />
    </div>
  );
}
