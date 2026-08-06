import { useMemo, useState } from 'react';
import { newId, useBudget } from '../store/BudgetContext';
import type { CurrencyCode, Saving } from '../types';
import {
  activeExpenses,
  categoryBreakdown,
  checklistProgress,
  debtSplit,
  monthKey,
  reviewQueue,
  summariseDebts,
  summariseHousehold,
  summariseSavings,
  whatToPayNext,
  type DueItem,
} from '../lib/calc';
import { formatMoney, formatPercent } from '../lib/money';
import { loadTone, seriesColor } from '../lib/palette';
import {
  Banner,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  HeroFigure,
  Meter,
  Modal,
  MoneyInput,
  Select,
  StatTile,
  TextInput,
} from '../components/ui';
import { ChartFrame, DataTable, RankedBars, ShareBar } from '../components/charts';
import GigChart from '../components/GigChart';
import { IconPlus } from '../components/icons';

export default function Dashboard() {
  const { data, conversion } = useBudget();
  const currency = conversion.target;

  const household = useMemo(() => summariseHousehold(data, conversion), [data, conversion]);
  const categories = useMemo(
    () => categoryBreakdown(activeExpenses(data), conversion),
    [data, conversion],
  );
  const debts = useMemo(() => summariseDebts(data), [data]);
  const split = useMemo(() => debtSplit(data, conversion), [data, conversion]);
  const due = useMemo(() => whatToPayNext(data, conversion), [data, conversion]);
  const estimates = useMemo(() => reviewQueue(data).length, [data]);

  const thisMonth = monthKey(new Date());
  const netTone = household.net < 0 ? 'critical' : 'good';
  const thinMargin = household.net >= 0 && household.net < household.income * 0.05;
  const activeDebts = debts.filter((debt) => debt.remaining > 0);

  return (
    <div className="rise">
      {data.settings.dataMode === 'sample' && estimates > 0 && (
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

      {/* 1. What to pay ------------------------------------------------- */}
      <WhatToPay items={due} currency={currency} />

      {/* 2. Savings ----------------------------------------------------- */}
      <SavingsCard />

      {/* 3. Debt -------------------------------------------------------- */}
      <Card className="mb-4">
        <CardHeader
          title="Debt"
          subtitle={`${activeDebts.length} loan${activeDebts.length === 1 ? '' : 's'} still to pay.`}
          action={
            <Button variant="ghost" onClick={() => (window.location.hash = 'debt')}>
              Open
            </Button>
          }
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <StatTile label="Both of you owe" value={formatMoney(split.total, currency)} href="#debt" />
          {split.byPerson.map((entry) => (
            <StatTile
              key={entry.person.id}
              href="#debt"
              label={entry.person.country === 'United States' ? 'United States' : 'South Africa'}
              accent={seriesColor(entry.person.slot)}
              value={formatMoney(entry.native, entry.currency)}
              detail={
                entry.currency === currency
                  ? entry.person.name
                  : `${entry.person.name} · ${formatMoney(entry.total, currency)}`
              }
            />
          ))}
        </div>

        {activeDebts.length > 0 && (
          <ul className="mt-5 grid gap-4 border-t border-hairline pt-5 sm:grid-cols-2">
            {activeDebts.map((summary) => {
              const person = data.people.find((p) => p.id === summary.debt.personId);
              return (
                <li key={summary.debt.id}>
                  <a href="#debt" className="block rounded-lg transition hover:bg-sunken">
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
                    {summary.paymentsLeft > 0
                      ? `${summary.paymentsLeft} payments to go`
                      : 'no payment plan set'}
                  </p>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* 4. Everything else --------------------------------------------- */}
      <div className="mb-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <Card className="flex flex-col justify-between gap-6">
          <HeroFigure
            label="Left over each month"
            value={formatMoney(household.net, currency)}
            tone={netTone}
            caption={
              <>
                <a href="#income" className="underline underline-offset-2 hover:text-ink">
                  {formatMoney(household.income, currency)} in
                </a>
                .{' '}
                <a href="#expenses" className="underline underline-offset-2 hover:text-ink">
                  {formatMoney(household.expenses, currency)} out
                </a>
                .{' '}
                {/* Split out so that spending logged twice — once as a bill and
                    again day by day — shows up instead of hiding in one total. */}
                {household.spending > 0 && (
                  <>
                    That is {formatMoney(household.bills, currency)} of bills plus{' '}
                    {formatMoney(household.spending, currency)} day to day.{' '}
                  </>
                )}
                {household.net < 0
                  ? 'You spend more than you earn.'
                  : thinMargin
                    ? 'Not much spare.'
                    : 'You have money spare.'}
              </>
            }
          />
          <div className="grid grid-cols-2 gap-4 border-t border-hairline pt-4 text-sm">
            <a href="#shared" className="group rounded-lg transition hover:bg-sunken">
              <span className="flex items-center gap-1 text-ink-2">
                Shared bills
                <span aria-hidden className="text-muted group-hover:text-ink">
                  ›
                </span>
              </span>
              <span className="tnum mt-0.5 block text-lg font-semibold">
                {formatMoney(household.shared, currency)}
              </span>
            </a>
            <a href="#income" className="group rounded-lg transition hover:bg-sunken">
              <span className="flex items-center gap-1 text-ink-2">
                Money in
                <span aria-hidden className="text-muted group-hover:text-ink">
                  ›
                </span>
              </span>
              <span className="tnum mt-0.5 block text-lg font-semibold">
                {formatMoney(household.income, currency)}
              </span>
            </a>
          </div>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2">
          {household.people.map((summary) => (
            <StatTile
              key={summary.person.id}
              href="#expenses"
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
                  tone={loadTone(summary.committed)}
                  label={`Bills use ${formatPercent(summary.committed)} of what ${summary.person.name} earns`}
                />
                <p className="mt-1.5 text-xs text-muted">
                  {summary.income > 0
                    ? `Bills use ${formatPercent(summary.committed)} of what ${summary.person.name} earns`
                    : 'No money in yet'}
                </p>
              </div>
            </StatTile>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartFrame
          title="Where the money goes"
          subtitle="Every bill, as a monthly amount."
          action={
            <a
              href="#expenses"
              className="rounded-lg border border-hairline px-2.5 py-1 text-xs font-medium text-ink-2 transition hover:bg-sunken hover:text-ink"
            >
              Open
            </a>
          }
          table={
            <DataTable
              columns={['Group', 'Per month', 'Share']}
              rows={categories.map((slice) => [
                slice.category,
                formatMoney(slice.amount, currency),
                formatPercent(slice.share),
              ])}
            />
          }
        >
          {categories.length === 0 ? (
            <EmptyState
              title="No bills yet"
              body="Add your bills on the Money out page and they will show up here."
              action={
                <Button variant="primary" onClick={() => (window.location.hash = 'expenses')}>
                  Add a bill
                </Button>
              }
            />
          ) : (
            <RankedBars
              currency={currency}
              items={categories.map((slice) => ({
                label: slice.category,
                value: slice.amount,
                meta: `${formatPercent(slice.share)} of all spending`,
              }))}
            />
          )}
        </ChartFrame>

        <div className="flex flex-col gap-4">
          <ChartFrame
            title="Who spends what"
            subtitle="Own bills next to shared bills."
            action={
              <a
                href="#expenses"
                className="rounded-lg border border-hairline px-2.5 py-1 text-xs font-medium text-ink-2 transition hover:bg-sunken hover:text-ink"
              >
                Open
              </a>
            }
            table={
              <DataTable
                columns={['Who', 'Per month']}
                rows={[
                  ...household.people.map((summary) => [
                    `${summary.person.name} — own bills`,
                    formatMoney(summary.personal, currency),
                  ]),
                  ['Shared bills', formatMoney(household.shared, currency)],
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

          <GigChart
            entries={data.ledger}
            conversion={conversion}
            title="Will’s gig money"
            height={220}
            action={
              <a
                href="#income"
                className="rounded-lg border border-hairline px-2.5 py-1 text-xs font-medium text-ink-2 transition hover:bg-sunken hover:text-ink"
              >
                Open
              </a>
            }
          />
        </div>
      </div>

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

/* -- what to pay ----------------------------------------------------------- */

function dueLabel(item: DueItem): string {
  if (item.daysAway < 0) {
    const late = Math.abs(item.daysAway);
    return `${late} day${late === 1 ? '' : 's'} late`;
  }
  if (item.daysAway === 0) return 'Due today';
  if (item.daysAway === 1) return 'Due tomorrow';
  return `In ${item.daysAway} days`;
}

/** The first thing on the page: what needs paying, soonest at the top.
 *  Pressing a row goes to the page where it can be dealt with. */
function WhatToPay({ items, currency }: { items: DueItem[]; currency: CurrencyCode }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? items : items.slice(0, 6);
  const overdue = items.filter((item) => item.daysAway < 0).length;
  const total = items.reduce((sum, item) => sum + item.amount, 0);

  return (
    <Card className="mb-4" padded={false}>
      <CardHeader
        inset
        title="What to pay"
        subtitle={
          items.length === 0
            ? 'Nothing due. Everything for this month is ticked off.'
            : overdue > 0
              ? `${items.length} to pay · ${overdue} already late`
              : `${items.length} to pay · ${formatMoney(total, currency)} in total`
        }
      />

      {items.length === 0 ? (
        <div className="px-5 pb-6 sm:px-6">
          <EmptyState
            title="Nothing to pay"
            body="Add bills on the Money out page, or a loan on the Debt page, and the next one due shows up here."
          />
        </div>
      ) : (
        <>
          <ul>
            {visible.map((item) => {
              const late = item.daysAway < 0;
              const soon = item.daysAway >= 0 && item.daysAway <= 3;
              return (
                <li key={`${item.kind}-${item.id}`} className="border-t border-hairline">
                  <a
                    href={`#${item.page}`}
                    className="flex items-center gap-3 px-5 py-3 transition hover:bg-sunken sm:px-6"
                  >
                    <span
                      aria-hidden
                      className="h-8 w-1 shrink-0 rounded-full"
                      style={{
                        background: late
                          ? 'var(--color-critical)'
                          : soon
                            ? 'var(--color-warning)'
                            : 'var(--color-axis)',
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">
                        {item.label}
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {item.partPaid ? 'Part paid' : item.kind} · {item.who} ·{' '}
                        {new Date(`${item.due}T00:00:00`).toLocaleDateString('en-US', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="tnum block text-sm font-medium text-ink">
                        {formatMoney(item.amount, currency, { round: 'auto' })}
                      </span>
                      <span
                        className="block text-xs"
                        style={{
                          color: late
                            ? 'var(--color-critical-text)'
                            : 'var(--color-muted)',
                        }}
                      >
                        {dueLabel(item)}
                      </span>
                    </span>
                    <span aria-hidden className="shrink-0 text-muted">
                      ›
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
          {items.length > 6 && (
            <div className="border-t border-hairline px-5 py-4 sm:px-6">
              <Button onClick={() => setShowAll(!showAll)}>
                {showAll ? 'Show fewer' : `Show all ${items.length}`}
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

/* -- savings --------------------------------------------------------------- */

function SavingsCard() {
  const { data, conversion, addSaving, updateSaving, removeSaving } = useBudget();
  const currency = conversion.target;
  const savings = summariseSavings(data, conversion);
  const [editing, setEditing] = useState<Saving | null>(null);

  return (
    <Card className="mb-4">
      <CardHeader
        title="Saved"
        subtitle="What each of you has put away."
        action={
          <Button
            variant="primary"
            onClick={() =>
              setEditing({
                id: newId('sav'),
                personId: data.people[0]?.id ?? 'will',
                label: '',
                amount: 0,
                currency: data.people[0]?.currency ?? 'USD',
              })
            }
          >
            <IconPlus /> Add savings
          </Button>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatTile label="Saved together" value={formatMoney(savings.total, currency)} />
        {savings.byPerson.map((entry) => (
          <StatTile
            key={entry.person.id}
            label={entry.person.name}
            accent={seriesColor(entry.person.slot)}
            value={formatMoney(entry.total, currency)}
          />
        ))}
      </div>

      {data.savings.length === 0 ? (
        <p className="text-sm text-ink-2">
          Nothing saved yet. Press <strong className="text-ink">Add savings</strong> to put in an
          account and what is in it.
        </p>
      ) : (
        <ul className="flex flex-col">
          {data.savings.map((saving) => {
            const person = data.people.find((entry) => entry.id === saving.personId);
            return (
              <li
                key={saving.id}
                className="flex items-center gap-3 border-b border-hairline py-3 last:border-0"
              >
                <span
                  aria-hidden
                  className="h-8 w-1 shrink-0 rounded-full"
                  style={{ background: seriesColor(person?.slot ?? 1) }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {saving.label || 'Untitled'}
                  </p>
                  <p className="text-xs text-muted">{person?.name}</p>
                </div>
                <p className="tnum shrink-0 text-sm font-medium text-ink">
                  {formatMoney(saving.amount, saving.currency, { round: 'auto' })}
                </p>
                <Button variant="ghost" onClick={() => setEditing(saving)}>
                  Edit
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <SavingEditor
          saving={editing}
          isNew={!data.savings.some((item) => item.id === editing.id)}
          onClose={() => setEditing(null)}
          onSave={(next) => {
            if (data.savings.some((item) => item.id === next.id)) updateSaving(next.id, next);
            else addSaving(next);
            setEditing(null);
          }}
          onDelete={() => {
            removeSaving(editing.id);
            setEditing(null);
          }}
        />
      )}
    </Card>
  );
}

function SavingEditor({
  saving,
  isNew,
  onSave,
  onDelete,
  onClose,
}: {
  saving: Saving;
  isNew: boolean;
  onSave: (next: Saving) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const { data } = useBudget();
  const [draft, setDraft] = useState(saving);

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? 'Add savings' : 'Edit savings'}
      footer={
        <>
          {!isNew && (
            <Button variant="danger" onClick={onDelete} className="mr-auto">
              Delete
            </Button>
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => onSave(draft)}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="What is it">
          {(id) => (
            <TextInput
              id={id}
              value={draft.label}
              placeholder="Emergency fund"
              onChange={(event) => setDraft({ ...draft, label: event.target.value })}
            />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Whose is it">
            {(id) => (
              <Select
                id={id}
                value={draft.personId}
                onChange={(event) => {
                  const personId = event.target.value;
                  const person = data.people.find((p) => p.id === personId);
                  setDraft({ ...draft, personId, currency: person?.currency ?? draft.currency });
                }}
              >
                {data.people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.fullName}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="How much">
            {(id) => (
              <MoneyInput
                id={id}
                min="0"
                value={draft.amount}
                onValueChange={(amount) => setDraft({ ...draft, amount })}
              />
            )}
          </Field>
          <Field label="Currency">
            {(id) => (
              <Select
                id={id}
                value={draft.currency}
                onChange={(event) =>
                  setDraft({ ...draft, currency: event.target.value as CurrencyCode })
                }
              >
                <option value="USD">USD</option>
                <option value="ZAR">ZAR</option>
              </Select>
            )}
          </Field>
        </div>
      </div>
    </Modal>
  );
}

/* -- month progress -------------------------------------------------------- */

function MonthProgress({ month }: { month: string }) {
  const { data, conversion } = useBudget();
  const progress = checklistProgress(data, month, conversion);
  const fraction = progress.total > 0 ? progress.paid / progress.total : 0;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-sm text-ink-2">
          {progress.paid} of {progress.total} paid
          {progress.part > 0 && ` · ${progress.part} part paid`}
        </span>
        <span className="tnum text-sm font-medium text-ink">
          {formatMoney(progress.outstanding, conversion.target, { round: 'auto' })} left to pay
        </span>
      </div>
      <Meter value={fraction} tone={fraction >= 1 ? 'good' : 'warning'} label="Month progress" />
    </div>
  );
}
