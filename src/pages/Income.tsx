import { useMemo, useState } from 'react';
import { newId, useBudget } from '../store/BudgetContext';
import type { CurrencyCode, Frequency, IncomeKind, IncomeSource, PersonId } from '../types';
import {
  amountIn,
  gigAverage,
  ledgerSources,
  monthlyIncome,
  monthlyValue,
  weeklyLedger,
} from '../lib/calc';
import { FREQUENCIES, FREQUENCY_LABEL, formatMoney, toMonthly } from '../lib/money';
import { seriesColor } from '../lib/palette';
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  EstimateMark,
  Field,
  Modal,
  NumberInput,
  PageHeader,
  Select,
  StatTile,
  TextInput,
} from '../components/ui';
import { ChartFrame, DataTable, StackedColumns } from '../components/charts';
import { IconPlus } from '../components/icons';

const KINDS: IncomeKind[] = ['salary', 'support', 'gig', 'other'];
const KIND_LABEL: Record<IncomeKind, string> = {
  salary: 'Salary',
  support: 'Support',
  gig: 'Gig work',
  other: 'Other',
};

export default function Income() {
  const { data, conversion, addIncome, updateIncome, removeIncome } = useBudget();
  const currency = conversion.target;
  const [editing, setEditing] = useState<IncomeSource | null>(null);

  const sources = useMemo(() => ledgerSources(data.ledger), [data.ledger]);
  const weekly = useMemo(() => weeklyLedger(data.ledger, conversion, 8), [data.ledger, conversion]);

  const total = monthlyIncome(data, undefined, conversion);

  return (
    <div className="rise">
      <PageHeader
        title="Money in"
        subtitle="Money coming in. Everything is shown as a monthly amount so you can compare it."
        action={
          <Button
            variant="primary"
            onClick={() =>
              setEditing({
                id: newId('inc'),
                personId: data.people[0]?.id ?? 'will',
                label: '',
                amount: 0,
                currency: data.people[0]?.currency ?? 'USD',
                frequency: 'monthly',
                kind: 'salary',
                active: true,
                verified: true,
              })
            }
          >
            <IconPlus /> Add money in
          </Button>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile label="Both of you, per month" value={formatMoney(total, currency)} />
        {data.people.map((person) => (
          <StatTile
            key={person.id}
            label={`${person.name}, per month`}
            accent={seriesColor(person.slot)}
            value={formatMoney(monthlyIncome(data, person.id, conversion), currency)}
            detail={person.country}
          />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {data.people.map((person) => {
          const rows = data.income.filter((source) => source.personId === person.id);
          const gig = gigAverage(data, person.id, conversion);
          return (
            <Card key={person.id}>
              <CardHeader
                title={`${person.name}’s money in`}
                subtitle={person.currency === 'USD' ? 'Paid in dollars' : 'Paid in rand'}
              />

              {/* Gig work has no set amount, so it is worked out from the daily
                  list rather than typed in. Showing it here keeps the card a
                  complete picture of what the person earns. */}
              {gig && (
                <ul className="mb-3 flex flex-col">
                  {gig.bySource.map((source) => (
                    <li
                      key={source.label}
                      className="flex items-center gap-3 border-b border-hairline py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{source.label}</p>
                        <p className="text-xs text-muted">
                          Changes daily · earned on {source.days} of {gig.days} days
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="tnum text-sm font-medium text-ink">
                          {formatMoney(source.perMonth, currency)}
                        </p>
                        <p className="text-xs text-muted">average</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {rows.length === 0 && !gig ? (
                <EmptyState
                  title="Nothing here yet"
                  body={`Press "Add money in" to put in ${person.name}’s salary.`}
                />
              ) : (
                <ul className="flex flex-col">
                  {rows.map((source) => (
                    <li
                      key={source.id}
                      className="flex items-center gap-3 border-b border-hairline py-3 last:border-0"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">
                          {source.label || 'Untitled'}
                          {!source.verified && <EstimateMark />}
                        </p>
                        <p className="text-xs text-muted">
                          {KIND_LABEL[source.kind]} · {FREQUENCY_LABEL[source.frequency]}
                          {!source.active && ' · paused'}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        {source.frequency === 'once' ? (
                          <>
                            <p className="tnum text-sm font-medium text-ink">
                              {formatMoney(source.amount, source.currency)}
                            </p>
                            <p className="text-xs text-muted">one-off</p>
                          </>
                        ) : (
                          <>
                            <p className="tnum text-sm font-medium text-ink">
                              {formatMoney(monthlyValue(source, conversion), currency)}
                            </p>
                            {source.currency !== currency && (
                              <p className="tnum text-xs text-muted">
                                {formatMoney(
                                  toMonthly(source.amount, source.frequency),
                                  source.currency,
                                )}
                              </p>
                            )}
                          </>
                        )}
                      </div>
                      <Button variant="ghost" onClick={() => setEditing(source)}>
                        Edit
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          );
        })}
      </div>

      <GigSummary />

      <div className="mt-4">
        <ChartFrame
          title="Gig money, per week"
          subtitle="Your daily earnings added up week by week."
          legend={sources.map((source, index) => ({
            label: source,
            color: seriesColor(4 + index),
          }))}
          table={
            <DataTable
              columns={['Week of', ...sources, 'Total']}
              rows={weekly.map((point) => [
                point.label,
                ...sources.map((source) => formatMoney(point.bySource[source] ?? 0, currency)),
                formatMoney(point.total, currency),
              ])}
            />
          }
        >
          <StackedColumns
            currency={currency}
            height={260}
            points={weekly.map((point) => ({
              label: point.label,
              segments: sources.map((source, index) => ({
                key: source,
                value: point.bySource[source] ?? 0,
                color: seriesColor(4 + index),
              })),
            }))}
          />
        </ChartFrame>
      </div>

      <LedgerCard />

      {editing && (
        <IncomeEditor
          source={editing}
          isNew={!data.income.some((item) => item.id === editing.id)}
          onClose={() => setEditing(null)}
          onSave={(next) => {
            if (data.income.some((item) => item.id === next.id)) {
              updateIncome(next.id, next);
            } else {
              addIncome(next);
            }
            setEditing(null);
          }}
          onDelete={() => {
            removeIncome(editing.id);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

/* -- gig summary ---------------------------------------------------------- */

/** DoorDash and Lyft pay a different amount every day, so there is no monthly
 *  amount to type in. This card shows what the daily list works out to and how
 *  it got there, so the number on the Overview page is never a mystery. */
function GigSummary() {
  const { data, conversion } = useBudget();
  const currency = conversion.target;
  const gig = gigAverage(data, undefined, conversion);
  if (!gig) return null;

  const fmt = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

  return (
    <Card className="mt-4">
      <CardHeader
        title="Money that changes every day"
        subtitle="DoorDash and Lyft pay a different amount each day, so there is no set amount. The app works out the average from your daily list."
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Average per month"
          value={formatMoney(gig.perMonth, currency)}
          detail="This is what counts towards your budget"
        />
        <StatTile label="Average per day" value={formatMoney(gig.perDay, currency)} />
        <StatTile
          label="Total in the list"
          value={formatMoney(gig.total, currency)}
          detail={`${gig.days} days`}
        />
      </div>

      <ul className="mb-4 flex flex-col">
        {gig.bySource.map((source) => (
          <li
            key={source.label}
            className="flex items-center gap-3 border-b border-hairline py-3 last:border-0"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{source.label}</p>
              <p className="text-xs text-muted">
                {formatMoney(source.total, currency)} over {source.days} days
              </p>
            </div>
            <p className="tnum shrink-0 text-sm font-medium text-ink">
              {formatMoney(source.perMonth, currency)}
              <span className="ml-1 text-xs font-normal text-muted">a month</span>
            </p>
          </li>
        ))}
      </ul>

      <p className="rounded-lg bg-sunken p-3 text-sm text-ink-2">
        Worked out from {fmt(gig.from)} to {fmt(gig.to)} — {gig.days} days in all. Days you earned
        nothing are counted too, otherwise the average would come out too high. Add more days below
        and this updates by itself.
      </p>
    </Card>
  );
}

/* -- daily ledger --------------------------------------------------------- */

function LedgerCard() {
  const { data, conversion, addLedgerEntry, removeLedgerEntry } = useBudget();
  const [showAll, setShowAll] = useState(false);
  const [draft, setDraft] = useState({
    date: new Date().toISOString().slice(0, 10),
    personId: data.people[0]?.id ?? 'will',
    label: 'DoorDash',
    amount: '',
  });

  const entries = useMemo(
    () => [...data.ledger].sort((a, b) => b.date.localeCompare(a.date)),
    [data.ledger],
  );
  const visible = showAll ? entries : entries.slice(0, 12);

  const person = data.people.find((p) => p.id === draft.personId);

  const submit = () => {
    const amount = Number(draft.amount);
    if (!Number.isFinite(amount) || amount <= 0 || !draft.label.trim()) return;
    addLedgerEntry({
      id: newId('led'),
      date: draft.date,
      personId: draft.personId,
      label: draft.label.trim(),
      amount,
      currency: person?.currency ?? 'USD',
      type: 'income',
    });
    setDraft((current) => ({ ...current, amount: '' }));
  };

  return (
    <Card className="mt-4">
      <CardHeader
        title="Daily earnings"
        subtitle="Every day you worked. Add a day here and every total on this page updates."
      />

      <form
        className="mb-5 grid gap-3 sm:grid-cols-[auto_1fr_1fr_auto] sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Field label="Date">
          {(id) => (
            <TextInput
              id={id}
              type="date"
              value={draft.date}
              onChange={(event) => setDraft({ ...draft, date: event.target.value })}
            />
          )}
        </Field>
        <Field label="Source">
          {(id) => (
            <TextInput
              id={id}
              value={draft.label}
              placeholder="DoorDash"
              onChange={(event) => setDraft({ ...draft, label: event.target.value })}
            />
          )}
        </Field>
        <Field label={`Amount (${person?.currency ?? 'USD'})`}>
          {(id) => (
            <NumberInput
              id={id}
              min="0"
              value={draft.amount}
              placeholder="0.00"
              onChange={(event) => setDraft({ ...draft, amount: event.target.value })}
            />
          )}
        </Field>
        <Button variant="primary" type="submit" className="h-[38px]">
          Add
        </Button>
      </form>

      {entries.length === 0 ? (
        <EmptyState title="Nothing here yet" body="Fill in the date, where it came from and the amount, then press Add." />
      ) : (
        <>
          <ul className="flex flex-col">
            {visible.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center gap-3 border-b border-hairline py-2.5 last:border-0"
              >
                <span className="tnum w-24 shrink-0 text-sm text-ink-2">
                  {new Date(`${entry.date}T00:00:00`).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{entry.label}</span>
                <span className="tnum shrink-0 text-sm font-medium text-ink">
                  {formatMoney(entry.amount, entry.currency, { round: false })}
                </span>
                {entry.currency !== conversion.target && (
                  <span className="tnum hidden w-24 shrink-0 text-right text-xs text-muted sm:block">
                    {formatMoney(
                      amountIn(entry.amount, entry.currency, conversion),
                      conversion.target,
                    )}
                  </span>
                )}
                <Button
                  variant="ghost"
                  aria-label={`Delete ${entry.label} on ${entry.date}`}
                  onClick={() => removeLedgerEntry(entry.id)}
                >
                  ✕
                </Button>
              </li>
            ))}
          </ul>
          {entries.length > 12 && (
            <Button className="mt-4" onClick={() => setShowAll(!showAll)}>
              {showAll ? 'Show fewer' : `Show all ${entries.length}`}
            </Button>
          )}
        </>
      )}
    </Card>
  );
}

/* -- editor --------------------------------------------------------------- */

function IncomeEditor({
  source,
  isNew,
  onSave,
  onClose,
  onDelete,
}: {
  source: IncomeSource;
  isNew: boolean;
  onSave: (next: IncomeSource) => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  const { data } = useBudget();
  const [draft, setDraft] = useState(source);

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? 'Add money in' : 'Edit money in'}
      footer={
        <>
          {!isNew && (
            <Button variant="danger" onClick={onDelete} className="mr-auto">
              Delete
            </Button>
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => onSave({ ...draft, verified: true })}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Description">
          {(id) => (
            <TextInput
              id={id}
              autoFocus
              value={draft.label}
              placeholder="Salary"
              onChange={(event) => setDraft({ ...draft, label: event.target.value })}
            />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Who earns it">
            {(id) => (
              <Select
                id={id}
                value={draft.personId}
                onChange={(event) => {
                  const personId = event.target.value as PersonId;
                  const person = data.people.find((p) => p.id === personId);
                  setDraft({
                    ...draft,
                    personId,
                    currency: person?.currency ?? draft.currency,
                  });
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
          <Field label="Type">
            {(id) => (
              <Select
                id={id}
                value={draft.kind}
                onChange={(event) =>
                  setDraft({ ...draft, kind: event.target.value as IncomeKind })
                }
              >
                {KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {KIND_LABEL[kind]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Amount">
            {(id) => (
              <NumberInput
                id={id}
                min="0"
                value={draft.amount}
                onChange={(event) => setDraft({ ...draft, amount: Number(event.target.value) })}
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
          <Field label="How often">
            {(id) => (
              <Select
                id={id}
                value={draft.frequency}
                onChange={(event) =>
                  setDraft({ ...draft, frequency: event.target.value as Frequency })
                }
              >
                {FREQUENCIES.map((frequency) => (
                  <option key={frequency} value={frequency}>
                    {FREQUENCY_LABEL[frequency]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        <p className="rounded-lg bg-sunken p-3 text-sm text-ink-2">
          {draft.frequency === 'once' ? (
            <>
              A one-off of{' '}
              <strong className="tnum font-semibold text-ink">
                {formatMoney(draft.amount, draft.currency)}
              </strong>
              . It is kept on the list but adds nothing to the monthly total, because it does not
              come in every month.
            </>
          ) : (
            <>
              That is{' '}
              <strong className="tnum font-semibold text-ink">
                {formatMoney(toMonthly(draft.amount, draft.frequency), draft.currency)}
              </strong>{' '}
              a month.
            </>
          )}
        </p>

        <label className="flex items-center gap-2 text-sm text-ink-2">
          <input
            type="checkbox"
            checked={draft.active}
            onChange={(event) => setDraft({ ...draft, active: event.target.checked })}
          />
          Count this in the totals
        </label>
      </div>
    </Modal>
  );
}
