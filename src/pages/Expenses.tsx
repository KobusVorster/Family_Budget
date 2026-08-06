import { useMemo, useState } from 'react';
import { newId, useBudget } from '../store/BudgetContext';
import type { CurrencyCode, Expense, ExpenseCategory, Frequency, Owner } from '../types';
import { MIN_LOG_DAYS, categoryBreakdown, monthlyValue, spendAverage } from '../lib/calc';
import { FREQUENCIES, FREQUENCY_LABEL, formatMoney, formatPercent, toMonthly } from '../lib/money';
import { CATEGORIES, seriesColor } from '../lib/palette';
import {
  AmountList,
  Badge,
  Banner,
  Button,
  Card,
  CardHeader,
  EmptyState,
  EstimateMark,
  Field,
  Modal,
  NumberInput,
  PageHeader,
  SegmentedControl,
  Select,
  StatTile,
  TextInput,
  newAmountPart,
  sumParts,
  type AmountPart,
} from '../components/ui';
import { ChartFrame, DataTable, RankedBars } from '../components/charts';
import { IconPlus } from '../components/icons';

type Scope = 'all' | 'shared' | string;

export default function Expenses() {
  const { data, conversion, addExpense, updateExpense, removeExpense } = useBudget();
  const currency = conversion.target;
  const [scope, setScope] = useState<Scope>('all');
  const [editing, setEditing] = useState<Expense | null>(null);

  const scopeOptions = useMemo(
    () => [
      { value: 'all' as Scope, label: 'All' },
      ...data.people.map((person) => ({ value: person.id as Scope, label: person.name })),
      { value: 'shared' as Scope, label: 'Shared' },
    ],
    [data.people],
  );

  const filtered = useMemo(
    () => data.expenses.filter((expense) => scope === 'all' || expense.owner === scope),
    [data.expenses, scope],
  );

  const categories = useMemo(
    () => categoryBreakdown(filtered, conversion),
    [filtered, conversion],
  );

  const monthlyTotal = filtered
    .filter((expense) => expense.active)
    .reduce((total, expense) => total + monthlyValue(expense, conversion), 0);

  const grouped = useMemo(() => {
    const map = new Map<ExpenseCategory, Expense[]>();
    for (const expense of filtered) {
      const list = map.get(expense.category) ?? [];
      list.push(expense);
      map.set(expense.category, list);
    }
    return [...map.entries()]
      .map(([category, items]) => ({
        category,
        items: items.sort(
          (a, b) => monthlyValue(b, conversion) - monthlyValue(a, conversion),
        ),
        total: items
          .filter((item) => item.active)
          .reduce((sum, item) => sum + monthlyValue(item, conversion), 0),
      }))
      .sort((a, b) => b.total - a.total);
  }, [filtered, conversion]);

  const blank = (): Expense => ({
    id: newId('exp'),
    label: '',
    category: 'Living',
    amount: 0,
    currency: data.people[0]?.currency ?? 'USD',
    frequency: 'monthly',
    owner: scope === 'all' ? (data.people[0]?.id ?? 'will') : scope,
    paidBy: scope === 'shared' || scope === 'all' ? (data.people[0]?.id ?? 'will') : scope,
    split:
      scope === 'shared'
        ? Object.fromEntries(data.people.map((person) => [person.id, 1 / data.people.length]))
        : undefined,
    active: true,
    verified: true,
  });

  return (
    <div className="rise">
      <PageHeader
        title="Money out"
        subtitle="Every bill you pay. Shown as a monthly amount so weekly and monthly bills can be compared."
        action={
          <Button variant="primary" onClick={() => setEditing(blank())}>
            <IconPlus /> Add a bill
          </Button>
        }
      />

      {/* One filter row above everything it scopes — never inside a card. */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <SegmentedControl label="Whose expenses" value={scope} onChange={setScope} options={scopeOptions} />
        <p className="text-sm text-ink-2">
          {filtered.filter((expense) => expense.active).length} bills ·{' '}
          <strong className="tnum font-semibold text-ink">
            {formatMoney(monthlyTotal, currency)}
          </strong>{' '}
          a month
        </p>
      </div>

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatTile label="Per month" value={formatMoney(monthlyTotal, currency)} />
        <StatTile label="Per year" value={formatMoney(monthlyTotal * 12, currency, { compact: true })} />
        <StatTile
          label="Biggest group"
          value={categories[0]?.category ?? '—'}
          detail={
            categories[0]
              ? `${formatMoney(categories[0].amount, currency)} · ${formatPercent(categories[0].share)}`
              : undefined
          }
        />
      </div>

      <div className="mb-4">
        <ChartFrame
          title="By group"
          subtitle="Biggest first."
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
            currency={currency}
            items={categories.map((slice) => ({
              label: slice.category,
              value: slice.amount,
              meta: formatPercent(slice.share),
            }))}
          />
        </ChartFrame>
      </div>

      {grouped.length === 0 ? (
        <Card>
          <EmptyState
            title="Nothing here"
            body="Press the button below to add a bill, or change the filter at the top."
            action={
              <Button variant="primary" onClick={() => setEditing(blank())}>
                Add a bill
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {grouped.map((group) => (
            <Card key={group.category} padded={false}>
              <CardHeader
                inset
                title={group.category}
                subtitle={`${group.items.length} bill${group.items.length === 1 ? '' : 's'}`}
                action={
                  <span className="tnum text-sm font-semibold text-ink">
                    {formatMoney(group.total, currency, { round: 'auto' })}
                  </span>
                }
              />
              <ul className="flex flex-col">
                {group.items.map((expense) => (
                  <ExpenseRow
                    key={expense.id}
                    expense={expense}
                    onEdit={() => setEditing(expense)}
                  />
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}

      <SpendingCard />

      {editing && (
        <ExpenseEditor
          expense={editing}
          isNew={!data.expenses.some((item) => item.id === editing.id)}
          onClose={() => setEditing(null)}
          onSave={(next) => {
            if (data.expenses.some((item) => item.id === next.id)) {
              updateExpense(next.id, next);
            } else {
              addExpense(next);
            }
            setEditing(null);
          }}
          onDelete={() => {
            removeExpense(editing.id);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

/* -- day-to-day spending -------------------------------------------------- */

/** Money that goes out in a different amount every day — food, fuel, the shops.
 *
 *  The mirror of Daily earnings on the Money in page, and it works the same
 *  way: log the days, and the average across every calendar day covered becomes
 *  the monthly figure. A bill cannot describe this, because there is no set
 *  amount to type in. */
function SpendingCard() {
  const { data, conversion, addLedgerEntry, removeLedgerEntry } = useBudget();
  const currency = conversion.target;
  const [showAll, setShowAll] = useState(false);
  const [draft, setDraft] = useState({
    date: new Date().toISOString().slice(0, 10),
    personId: data.people[0]?.id ?? 'will',
    label: '',
  });
  const [parts, setParts] = useState<AmountPart[]>(() => [newAmountPart()]);

  const entries = useMemo(
    () =>
      data.ledger
        .filter((entry) => entry.type === 'expense')
        .sort((a, b) => b.date.localeCompare(a.date)),
    [data.ledger],
  );
  const visible = showAll ? entries : entries.slice(0, 12);

  const person = data.people.find((p) => p.id === draft.personId);
  const average = spendAverage(data, undefined, conversion);
  const total = sumParts(parts);

  const submit = () => {
    if (!Number.isFinite(total) || total <= 0 || !draft.label.trim()) return;
    addLedgerEntry({
      id: newId('led'),
      date: draft.date,
      personId: draft.personId,
      label: draft.label.trim(),
      amount: total,
      currency: person?.currency ?? 'USD',
      type: 'expense',
    });
    setParts([newAmountPart()]);
  };

  return (
    <Card className="mt-4">
      <CardHeader
        title="Day-to-day spending"
        subtitle="What you actually spent, day by day. For the things with no set amount — food, fuel, the shops. Your bills above are separate."
      />

      {average && (
        <>
          {!average.enough && (
            <Banner
              title={`Not counted yet — ${average.days} ${average.days === 1 ? 'day' : 'days'} logged of ${MIN_LOG_DAYS}`}
            >
              Working out a month from a day or two would multiply it by about thirty and throw
              your totals right off. Keep logging and it starts counting at {MIN_LOG_DAYS} days.
            </Banner>
          )}
          <div className="mb-5 grid gap-4 sm:grid-cols-3">
            <StatTile
              label="Average per month"
              value={formatMoney(average.perMonth, currency)}
              detail={average.enough ? 'Counted on top of your bills' : 'Not counted yet'}
            />
            <StatTile label="Average per day" value={formatMoney(average.perDay, currency)} />
            <StatTile
              label="Total in the list"
              value={formatMoney(average.total, currency)}
              detail={`${average.days} ${average.days === 1 ? 'day' : 'days'}`}
            />
          </div>
        </>
      )}

      <form
        className="mb-5 grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-end">
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
          <Field label="What was it">
            {(id) => (
              <TextInput
                id={id}
                value={draft.label}
                placeholder="Groceries"
                onChange={(event) => setDraft({ ...draft, label: event.target.value })}
              />
            )}
          </Field>
        </div>

        {data.people.length > 1 && (
          <Field label="Who spent it">
            {(id) => (
              <Select
                id={id}
                value={draft.personId}
                onChange={(event) => setDraft({ ...draft, personId: event.target.value })}
              >
                {data.people.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.fullName}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}

        <AmountList
          label={`Amount (${person?.currency ?? 'USD'})`}
          parts={parts}
          onChange={setParts}
          currency={person?.currency ?? 'USD'}
          hint="Several shops in one day? Press “Add another amount” for each one and they are added together."
        />

        <Button
          variant="primary"
          type="submit"
          className="justify-self-start"
          disabled={total <= 0 || !draft.label.trim()}
        >
          {parts.filter((part) => part.value > 0).length > 1 ? 'Add them all up' : 'Add'}
        </Button>
      </form>

      {entries.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          body="Fill in the date, what it was and the amount, then press Add. Only put things here that your bills above do not already cover, or it counts twice."
        />
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
          <p className="mt-4 rounded-lg bg-sunken p-3 text-sm text-ink-2">
            This is counted on top of your bills. If a bill above already covers the same
            spending — a “Daily food” or “Fuel” line, say — turn that bill off or delete it, or
            the same money is counted twice.
          </p>
        </>
      )}
    </Card>
  );
}

/* Card header + list need matching padding when the card itself is unpadded. */
function ExpenseRow({ expense, onEdit }: { expense: Expense; onEdit: () => void }) {
  const { data, conversion } = useBudget();
  const currency = conversion.target;
  const owner =
    expense.owner === 'shared'
      ? null
      : data.people.find((person) => person.id === expense.owner);
  const payer = data.people.find((person) => person.id === expense.paidBy);

  return (
    <li className="flex items-center gap-3 border-t border-hairline px-5 py-3 sm:px-6">
      <span
        aria-hidden
        className="h-8 w-1 shrink-0 rounded-full"
        style={{
          background: expense.owner === 'shared' ? seriesColor(3) : seriesColor(owner?.slot ?? 1),
        }}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">
          {expense.label || 'Untitled'}
          {!expense.verified && <EstimateMark />}
        </p>
        <p className="truncate text-xs text-muted">
          {FREQUENCY_LABEL[expense.frequency]}
          {expense.dueDay ? ` · due on the ${expense.dueDay}` : ''}
          {expense.owner === 'shared'
            ? ` · shared, paid by ${payer?.name ?? '—'}`
            : ` · ${owner?.name ?? '—'}`}
          {expense.account ? ` · ${expense.account}` : ''}
          {!expense.active && ' · paused'}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="tnum text-sm font-medium text-ink">
          {formatMoney(monthlyValue(expense, conversion), currency, { round: 'auto' })}
        </p>
        {(expense.currency !== currency || expense.frequency !== 'monthly') && (
          <p className="tnum text-xs text-muted">
            {formatMoney(expense.amount, expense.currency, { round: 'auto' })}{' '}
            {expense.frequency !== 'monthly' ? FREQUENCY_LABEL[expense.frequency].toLowerCase() : ''}
          </p>
        )}
      </div>
      <Button variant="ghost" onClick={onEdit}>
        Edit
      </Button>
    </li>
  );
}

/* -- editor --------------------------------------------------------------- */

function ExpenseEditor({
  expense,
  isNew,
  onSave,
  onClose,
  onDelete,
}: {
  expense: Expense;
  isNew: boolean;
  onSave: (next: Expense) => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  const { data } = useBudget();
  const [draft, setDraft] = useState(expense);
  const isShared = draft.owner === 'shared';

  /* The amount can be built out of several separate amounts — a shop split
     over three slips, say. One box holds whatever the bill is already set to;
     press "Add another amount" for each extra one and the total is saved. */
  const [parts, setParts] = useState<AmountPart[]>(() => [newAmountPart(expense.amount)]);
  const setAmountParts = (next: AmountPart[]) => {
    setParts(next);
    setDraft((current) => ({ ...current, amount: sumParts(next) }));
  };

  const setOwner = (owner: Owner) => {
    setDraft((current) => ({
      ...current,
      owner,
      // A personal expense is always paid by its owner; a shared one keeps
      // whoever was already paying.
      paidBy: owner === 'shared' ? current.paidBy : owner,
      split:
        owner === 'shared'
          ? (current.split ??
            Object.fromEntries(data.people.map((person) => [person.id, 1 / data.people.length])))
          : undefined,
    }));
  };

  const setSplit = (personId: string, percent: number) => {
    setDraft((current) => {
      const next = { ...(current.split ?? {}) };
      next[personId] = Math.max(0, Math.min(100, percent)) / 100;
      // With two people the other side is whatever is left, so the pair always
      // adds to 100% and nobody has to do the arithmetic.
      const others = data.people.filter((person) => person.id !== personId);
      if (others.length === 1) next[others[0].id] = 1 - next[personId];
      return { ...current, split: next };
    });
  };

  const splitTotal = isShared
    ? data.people.reduce((sum, person) => sum + (draft.split?.[person.id] ?? 0), 0)
    : 1;

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? 'Add a bill' : 'Edit bill'}
      footer={
        <>
          {!isNew && (
            <Button variant="danger" onClick={onDelete} className="mr-auto">
              Delete
            </Button>
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={Math.abs(splitTotal - 1) > 0.001}
            onClick={() => onSave({ ...draft, verified: true })}
          >
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
              value={draft.label}
              placeholder="Car insurance"
              onChange={(event) => setDraft({ ...draft, label: event.target.value })}
            />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Who pays for it">
            {(id) => (
              <Select
                id={id}
                value={draft.owner}
                onChange={(event) => setOwner(event.target.value as Owner)}
              >
                {data.people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.fullName}
                  </option>
                ))}
                <option value="shared">Shared</option>
              </Select>
            )}
          </Field>
          <Field label="Group">
            {(id) => (
              <Select
                id={id}
                value={draft.category}
                onChange={(event) =>
                  setDraft({ ...draft, category: event.target.value as ExpenseCategory })
                }
              >
                {CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        {/* The amount gets its own row. With several boxes stacked it needs the
            full width, and squeezing it into a third of the dialog wrapped the
            "Add another amount" button onto two lines. */}
        <AmountList
          label="Amount"
          parts={parts}
          onChange={setAmountParts}
          currency={draft.currency}
          hint="Paid in more than one go? Press “Add another amount” for each one."
        />

        <div className="grid gap-4 sm:grid-cols-2">
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
          That is{' '}
          <strong className="tnum font-semibold text-ink">
            {formatMoney(toMonthly(draft.amount, draft.frequency), draft.currency, {
              round: 'auto',
            })}
          </strong>{' '}
          a month.
        </p>

        {isShared && (
          <div className="rounded-lg border border-hairline p-4">
            <p className="mb-3 text-sm font-medium text-ink">Who should pay for it</p>
            <div className="grid gap-3">
              {data.people.map((person) => (
                <Field key={person.id} label={`${person.name}’s share (%)`}>
                  {(id) => (
                    <NumberInput
                      id={id}
                      min="0"
                      max="100"
                      value={Math.round((draft.split?.[person.id] ?? 0) * 100)}
                      onChange={(event) => setSplit(person.id, Number(event.target.value))}
                    />
                  )}
                </Field>
              ))}
            </div>
            {Math.abs(splitTotal - 1) > 0.001 && (
              <p className="mt-3 text-sm" style={{ color: 'var(--color-critical-text)' }}>
                The two shares add up to {Math.round(splitTotal * 100)}%. Change them so they add
                up to 100%.
              </p>
            )}
            <div className="mt-4">
              <Field label="Whose account it comes out of">
                {(id) => (
                  <Select
                    id={id}
                    value={draft.paidBy}
                    onChange={(event) => setDraft({ ...draft, paidBy: event.target.value })}
                  >
                    {data.people.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.fullName}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <p className="mt-2 text-xs text-muted">
                Who pays it and who should pay for it can be different. The Shared page works out
                who owes who.
              </p>
            </div>
          </div>
        )}

        <Field
          label="Day of the month it is due"
          hint="Optional. Used to sort the “What to pay” list on the Overview page. Leave blank if it has no set day."
        >
          {(id) => (
            <NumberInput
              id={id}
              min="1"
              max="31"
              placeholder="e.g. 25"
              value={draft.dueDay ?? ''}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  dueDay: event.target.value ? Number(event.target.value) : undefined,
                })
              }
            />
          )}
        </Field>

        <Field label="Account or card" hint="Optional. Handy when checking a bank statement.">
          {(id) => (
            <TextInput
              id={id}
              value={draft.account ?? ''}
              placeholder="Checking"
              onChange={(event) => setDraft({ ...draft, account: event.target.value })}
            />
          )}
        </Field>

        <label className="flex items-center gap-2 text-sm text-ink-2">
          <input
            type="checkbox"
            checked={draft.active}
            onChange={(event) => setDraft({ ...draft, active: event.target.checked })}
          />
          Count this in the totals
        </label>

        {!isNew && !expense.verified && (
          <Badge tone="warning">Saving removes the "guess" mark</Badge>
        )}
      </div>
    </Modal>
  );
}
