import { useMemo } from 'react';
import { useBudget } from '../store/BudgetContext';
import { activeExpenses, monthlyValue, settleShared, shareFor } from '../lib/calc';
import { FREQUENCY_LABEL, convert, formatMoney, formatPercent } from '../lib/money';
import { seriesColor } from '../lib/palette';
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  HeroFigure,
  MoneyInput,
  PageHeader,
  StatTile,
} from '../components/ui';
import { ChartFrame, DataTable, ShareBar } from '../components/charts';

export default function Shared() {
  const { data, conversion, updateSettings, updateExpense } = useBudget();
  const currency = conversion.target;

  const shared = useMemo(
    () => activeExpenses(data).filter((expense) => expense.owner === 'shared'),
    [data],
  );
  const settlement = useMemo(() => settleShared(data, conversion), [data, conversion]);

  const total = shared.reduce((sum, expense) => sum + monthlyValue(expense, conversion), 0);

  /* What actually leaves the US each month for South Africa: the shared lines
     Will pays that are priced in rand. */
  const sentToSA = shared
    .filter((expense) => expense.paidBy === 'will' && expense.currency === 'ZAR')
    .reduce((sum, expense) => sum + monthlyValue(expense, conversion), 0);
  const sentToSAInRand = convert(sentToSA, currency, 'ZAR', data.settings.usdZarRate);

  const { saTotalRent, saRentFromDaddy, saRentExpenseId } = data.settings;
  const willRentPortion = Math.max(0, saTotalRent - saRentFromDaddy);

  const setRent = (patch: { saTotalRent?: number; saRentFromDaddy?: number }) => {
    const nextTotal = patch.saTotalRent ?? saTotalRent;
    const nextDaddy = patch.saRentFromDaddy ?? saRentFromDaddy;
    updateSettings(patch);
    // Keep the shared rent bill in step automatically, so the total and Daddy's
    // share can never disagree with what Will is recorded as paying.
    if (data.expenses.some((expense) => expense.id === saRentExpenseId)) {
      updateExpense(saRentExpenseId, { amount: Math.max(0, nextTotal - nextDaddy), verified: true });
    }
  };

  return (
    <div className="rise">
      <PageHeader
        title="Shared"
        subtitle="Bills for the South African house that you both share. This page works out who owes who."
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <Card className="flex flex-col justify-between gap-6">
          <HeroFigure
            label="Shared bills, per month"
            value={formatMoney(total, currency)}
            caption={
              settlement.transfer ? (
                <>
                  <strong className="font-semibold text-ink">
                    {settlement.transfer.from.name} owes {settlement.transfer.to.name}{' '}
                    {formatMoney(settlement.transfer.amount, currency)}
                  </strong>{' '}
                  a month.
                </>
              ) : (
                'Nobody owes anybody. Each of you pays your own share.'
              )
            }
          />
          <div className="border-t border-hairline pt-4">
            <p className="text-sm text-ink-2">Sent to South Africa each month</p>
            <p className="tnum mt-0.5 text-lg font-semibold">
              {formatMoney(sentToSA, currency)}
              {currency !== 'ZAR' && (
                <span className="ml-2 text-sm font-normal text-muted">
                  ≈ {formatMoney(sentToSAInRand, 'ZAR')}
                </span>
              )}
            </p>
          </div>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2">
          {settlement.lines.map((line) => (
            <StatTile
              key={line.person.id}
              label={line.person.name}
              accent={seriesColor(line.person.slot)}
              value={formatMoney(line.paid, currency)}
              detail={
                <>
                  pays · should pay {formatMoney(line.owes, currency)}
                  <br />
                  {Math.abs(line.balance) < 0.01
                    ? 'All square'
                    : line.balance > 0
                      ? `Is owed ${formatMoney(line.balance, currency)}`
                      : `Owes ${formatMoney(-line.balance, currency)}`}
                </>
              }
              tone={line.balance > 0.01 ? 'good' : undefined}
            />
          ))}
        </div>
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="South African rent"
            subtitle="Type the full rent and what Daddy pays. Will’s share works itself out."
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full rent each month (R)">
              {(id) => (
                <MoneyInput
                  id={id}
                  min="0"
                  value={saTotalRent}
                  onValueChange={(value) => setRent({ saTotalRent: value })}
                />
              )}
            </Field>
            <Field label="What Daddy pays (R)">
              {(id) => (
                <MoneyInput
                  id={id}
                  min="0"
                  max={saTotalRent}
                  value={saRentFromDaddy}
                  onValueChange={(value) => setRent({ saRentFromDaddy: value })}
                />
              )}
            </Field>
          </div>

          <div className="mt-5">
            <ShareBar
              currency="ZAR"
              slices={[
                { label: 'Will pays', value: willRentPortion, color: seriesColor(1) },
                { label: 'Daddy pays', value: saRentFromDaddy, color: seriesColor(4) },
              ]}
            />
          </div>

          <p className="mt-4 rounded-lg bg-sunken p-3 text-sm text-ink-2">
            Will pays{' '}
            <strong className="tnum font-semibold text-ink">
              {formatMoney(willRentPortion, 'ZAR')}
            </strong>{' '}
            ≈{' '}
            <strong className="tnum font-semibold text-ink">
              {formatMoney(
                convert(willRentPortion, 'ZAR', 'USD', data.settings.usdZarRate),
                'USD',
              )}
            </strong>{' '}
            each month.
          </p>
        </Card>

        <ChartFrame
          title="Who should pay what"
          subtitle="Each person’s share of the shared bills."
          table={
            <DataTable
              columns={['Person', 'Should pay', 'Pays', 'Difference']}
              rows={settlement.lines.map((line) => [
                line.person.fullName,
                formatMoney(line.owes, currency),
                formatMoney(line.paid, currency),
                formatMoney(line.balance, currency, { signed: true }),
              ])}
            />
          }
        >
          <ShareBar
            currency={currency}
            slices={settlement.lines.map((line) => ({
              label: `${line.person.name}’s share`,
              value: line.owes,
              color: seriesColor(line.person.slot),
            }))}
          />
        </ChartFrame>
      </div>

      <Card padded={false}>
        <CardHeader
          inset
          title="Shared bills"
          subtitle={`${shared.length} bill${shared.length === 1 ? '' : 's'} · ${formatMoney(total, currency)} a month`}
          action={
            <Button variant="ghost" onClick={() => (window.location.hash = 'expenses')}>
              Edit these
            </Button>
          }
        />
        {shared.length === 0 ? (
          <EmptyState
            title="No shared bills yet"
            body="On the Money out page, set a bill’s owner to Shared and it will show up here."
          />
        ) : (
          <ul className="flex flex-col">
            {shared.map((expense) => {
              const payer = data.people.find((person) => person.id === expense.paidBy);
              return (
                <li
                  key={expense.id}
                  className="border-t border-hairline px-5 py-4 sm:px-6"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="truncate text-sm font-medium text-ink">{expense.label}</p>
                    <p className="tnum shrink-0 text-sm font-medium text-ink">
                      {formatMoney(monthlyValue(expense, conversion), currency, { round: 'auto' })}
                    </p>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    {FREQUENCY_LABEL[expense.frequency]} · paid by {payer?.name ?? '—'}
                    {expense.currency !== currency &&
                      ` · ${formatMoney(expense.amount, expense.currency)} ${FREQUENCY_LABEL[
                        expense.frequency
                      ].toLowerCase()}`}
                  </p>
                  <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                    {data.people.map((person) => {
                      const share = shareFor(expense, person.id);
                      if (share <= 0) return null;
                      return (
                        <li key={person.id} className="flex items-center gap-1.5 text-xs text-ink-2">
                          <span
                            aria-hidden
                            className="h-2 w-2 rounded-full"
                            style={{ background: seriesColor(person.slot) }}
                          />
                          {person.name} pays {formatPercent(share)} ·{' '}
                          <span className="tnum">
                            {formatMoney(monthlyValue(expense, conversion) * share, currency)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
