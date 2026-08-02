import { useMemo, useState } from 'react';
import { newId, useBudget } from '../store/BudgetContext';
import type { CurrencyCode, Expense, ExpenseCategory, Frequency, Owner } from '../types';
import { categoryBreakdown, monthlyValue } from '../lib/calc';
import { FREQUENCIES, FREQUENCY_LABEL, formatMoney, formatPercent, toMonthly } from '../lib/money';
import { CATEGORIES, seriesColor } from '../lib/palette';
import {
  Badge,
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
      { value: 'all' as Scope, label: 'Everything' },
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
        title="Expenses"
        subtitle="Every committed cost, normalised to a monthly figure so weekly, fortnightly and monthly bills are directly comparable."
        action={
          <Button variant="primary" onClick={() => setEditing(blank())}>
            <IconPlus /> Add expense
          </Button>
        }
      />

      {/* One filter row above everything it scopes — never inside a card. */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <SegmentedControl label="Whose expenses" value={scope} onChange={setScope} options={scopeOptions} />
        <p className="text-sm text-ink-2">
          {filtered.filter((expense) => expense.active).length} active ·{' '}
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
          label="Biggest category"
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
          title="By category"
          subtitle="One colour for the whole set — the bar length already carries the size, so tinting by amount would say the same thing twice."
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
            title="Nothing in this view"
            body="Add an expense, or switch the filter above to see another slice."
            action={
              <Button variant="primary" onClick={() => setEditing(blank())}>
                Add expense
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
                subtitle={`${group.items.length} line${group.items.length === 1 ? '' : 's'}`}
                action={
                  <span className="tnum text-sm font-semibold text-ink">
                    {formatMoney(group.total, currency)}
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
          {expense.owner === 'shared'
            ? ` · shared, paid by ${payer?.name ?? '—'}`
            : ` · ${owner?.name ?? '—'}`}
          {expense.account ? ` · ${expense.account}` : ''}
          {!expense.active && ' · paused'}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="tnum text-sm font-medium text-ink">
          {formatMoney(monthlyValue(expense, conversion), currency)}
        </p>
        {(expense.currency !== currency || expense.frequency !== 'monthly') && (
          <p className="tnum text-xs text-muted">
            {formatMoney(expense.amount, expense.currency, { round: expense.amount >= 100 })}{' '}
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
      title={isNew ? 'Add expense' : 'Edit expense'}
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
              autoFocus
              value={draft.label}
              placeholder="Car insurance"
              onChange={(event) => setDraft({ ...draft, label: event.target.value })}
            />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Whose expense">
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
          <Field label="Category">
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
          That works out to{' '}
          <strong className="tnum font-semibold text-ink">
            {formatMoney(toMonthly(draft.amount, draft.frequency), draft.currency)}
          </strong>{' '}
          a month.
        </p>

        {isShared && (
          <div className="rounded-lg border border-hairline p-4">
            <p className="mb-3 text-sm font-medium text-ink">Who carries this cost</p>
            <div className="grid gap-3">
              {data.people.map((person) => (
                <Field key={person.id} label={`${person.fullName}’s share (%)`}>
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
                The shares add up to {Math.round(splitTotal * 100)}%. They need to make 100%.
              </p>
            )}
            <div className="mt-4">
              <Field label="Paid from whose account">
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
                Who pays and who carries the cost are different questions — the gap between them is
                the settlement on the Shared page.
              </p>
            </div>
          </div>
        )}

        <Field label="Account or card" hint="Optional — helps when reconciling a statement.">
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
          Counting this towards the budget
        </label>

        {!isNew && !expense.verified && (
          <Badge tone="warning">Saving marks this as checked against your sheet</Badge>
        )}
      </div>
    </Modal>
  );
}
