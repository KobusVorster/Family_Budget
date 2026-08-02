import { useMemo, useState } from 'react';
import { newId, useBudget } from '../store/BudgetContext';
import type { CurrencyCode, Debt } from '../types';
import { summariseDebt, summariseDebts, totalDebtRemaining } from '../lib/calc';
import { formatMoney, formatPercent } from '../lib/money';
import { seriesColor } from '../lib/palette';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  EstimateMark,
  Field,
  Meter,
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

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function Debts() {
  const { data, conversion, addDebt } = useBudget();
  const currency = conversion.target;
  const [scope, setScope] = useState<string>('all');
  const [editing, setEditing] = useState<Debt | null>(null);

  const summaries = useMemo(
    () => summariseDebts(data, scope === 'all' ? undefined : scope),
    [data, scope],
  );

  const remaining = totalDebtRemaining(data, conversion, scope === 'all' ? undefined : scope);
  const active = summaries.filter((summary) => summary.remaining > 0);
  const cleared = summaries.filter((summary) => summary.remaining <= 0);

  const nextDue = active
    .filter((summary) => summary.nextPayment)
    .sort((a, b) => (a.nextPayment!.date < b.nextPayment!.date ? -1 : 1))[0];

  return (
    <div className="rise">
      <PageHeader
        title="Debt"
        subtitle="Every loan and card, how much is left, and when it will be paid off."
        action={
          <Button
            variant="primary"
            onClick={() =>
              setEditing({
                id: newId('debt'),
                label: '',
                personId: data.people[0]?.id ?? 'will',
                lender: '',
                currency: data.people[0]?.currency ?? 'USD',
                principal: 0,
                payments: [],
                verified: true,
              })
            }
          >
            <IconPlus /> Add a loan
          </Button>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <SegmentedControl
          label="Whose loan"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'all', label: 'Both' },
            ...data.people.map((person) => ({ value: person.id, label: person.name })),
          ]}
        />
      </div>

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatTile label="Left to pay" value={formatMoney(remaining, currency)} />
        <StatTile
          label="Loans still open"
          value={String(active.length)}
          detail={cleared.length > 0 ? `${cleared.length} paid off` : undefined}
        />
        <StatTile
          label="Next payment"
          value={nextDue ? formatMoney(nextDue.nextPayment!.amount, nextDue.debt.currency) : '—'}
          detail={
            nextDue ? `${nextDue.debt.label} · ${formatDate(nextDue.nextPayment!.date)}` : undefined
          }
        />
      </div>

      {active.length > 0 && (
        <div className="mb-4">
          <ChartFrame
            title="What is left, biggest first"
            subtitle="All in one currency so you can compare them."
            table={
              <DataTable
                columns={['Loan', 'Left to pay', 'Paid off']}
                rows={active.map((summary) => [
                  summary.debt.label,
                  formatMoney(summary.remaining, summary.debt.currency),
                  formatPercent(summary.progress),
                ])}
              />
            }
          >
            <RankedBars
              currency={currency}
              items={active.map((summary) => ({
                label: summary.debt.label,
                value:
                  summary.debt.currency === currency
                    ? summary.remaining
                    : summary.debt.currency === 'USD'
                      ? summary.remaining * data.settings.usdZarRate
                      : summary.remaining / data.settings.usdZarRate,
                meta: `${formatPercent(summary.progress)} paid off · ${formatMoney(
                  summary.remaining,
                  summary.debt.currency,
                )} left`,
              }))}
            />
          </ChartFrame>
        </div>
      )}

      {summaries.length === 0 ? (
        <Card>
          <EmptyState
            title="No loans here"
            body="Press \u201cAdd a loan\u201d to put one in."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {[...active, ...cleared].map((summary) => (
            <DebtCard key={summary.debt.id} debtId={summary.debt.id} onEdit={setEditing} />
          ))}
        </div>
      )}

      {editing && (
        <DebtEditor
          debt={editing}
          isNew={!data.debts.some((item) => item.id === editing.id)}
          onClose={() => setEditing(null)}
          onSaveNew={(next) => {
            addDebt(next);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

/* -- one debt ------------------------------------------------------------- */

function DebtCard({ debtId, onEdit }: { debtId: string; onEdit: (debt: Debt) => void }) {
  const { data, togglePayment, updateDebt, removeDebt } = useBudget();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ date: new Date().toISOString().slice(0, 10), amount: '' });

  const debt = data.debts.find((item) => item.id === debtId);
  if (!debt) return null;

  const summary = summariseDebt(debt, data.debts);
  const person = data.people.find((entry) => entry.id === debt.personId);
  const cleared = summary.remaining <= 0;

  const addPayment = () => {
    const amount = Number(draft.amount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    updateDebt(debt.id, {
      payments: [
        ...debt.payments,
        { id: newId('pay'), date: draft.date, amount, paid: true },
      ].sort((a, b) => a.date.localeCompare(b.date)),
    });
    setDraft({ ...draft, amount: '' });
    setAdding(false);
  };

  return (
    <Card padded={false}>
      <div className="p-5 sm:p-6">
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: seriesColor(person?.slot ?? 1) }}
              />
              {debt.label || 'Untitled debt'}
              {!debt.verified && <EstimateMark />}
            </h2>
            <p className="mt-1 text-sm text-ink-2">
              {person?.name} · {debt.lender || 'no lender set'}
              {cleared && ' · paid off'}
            </p>
          </div>
          <div className="text-right">
            <p className="tnum text-xl font-semibold">
              {formatMoney(summary.remaining, debt.currency)}
            </p>
            <p className="text-xs text-muted">left to pay</p>
          </div>
        </header>

        <Meter
          value={summary.progress}
          tone={cleared ? 'good' : 'good'}
          label={`${debt.label}: ${formatPercent(summary.progress)} paid off`}
        />

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-muted">Borrowed</dt>
            <dd className="tnum mt-0.5 font-medium">{formatMoney(debt.principal, debt.currency)}</dd>
          </div>
          {summary.offset > 0 && (
            <div>
              <dt className="text-muted">Paid off an older loan</dt>
              <dd className="tnum mt-0.5 font-medium">
                {formatMoney(summary.offset, debt.currency)}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-muted">Paid so far</dt>
            <dd className="tnum mt-0.5 font-medium">{formatMoney(summary.paid, debt.currency)}</dd>
          </div>
          <div>
            <dt className="text-muted">Payments left</dt>
            <dd className="tnum mt-0.5 font-medium">{summary.monthsLeft || '—'}</dd>
          </div>
          <div>
            <dt className="text-muted">Paid off on</dt>
            <dd className="mt-0.5 font-medium">
              {summary.payoffDate ? formatDate(summary.payoffDate) : '—'}
            </dd>
          </div>
        </dl>

        {summary.offset > 0 && (
          <p className="mt-4 rounded-lg bg-sunken p-3 text-sm text-ink-2">
            {formatMoney(debt.principal, debt.currency)} was borrowed.{' '}
            {formatMoney(summary.offset, debt.currency)} of it paid off the older loan, so only{' '}
            <strong className="tnum font-semibold text-ink">
              {formatMoney(summary.opening, debt.currency)}
            </strong>{' '}
            has to be paid back. This updates by itself as the older loan goes down.
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => setOpen(!open)} aria-expanded={open}>
            {open ? 'Hide payments' : `Payments (${debt.payments.length})`}
          </Button>
          <Button onClick={() => setAdding(true)}>Add a payment</Button>
          <Button variant="ghost" onClick={() => onEdit(debt)}>
            Edit
          </Button>
          <Button
            variant="ghost"
            className="ml-auto"
            onClick={() => {
              if (window.confirm(`Delete "${debt.label}" and all its payments? This cannot be undone.`)) {
                removeDebt(debt.id);
              }
            }}
          >
            Delete
          </Button>
        </div>
      </div>

      {open && (
        <div className="border-t border-hairline">
          {debt.payments.length === 0 ? (
            <EmptyState
              title="No payments yet"
              body="Press \u201cAdd a payment\u201d, or press Edit to set up a monthly payment plan."
            />
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {debt.payments.map((payment) => (
                <li
                  key={payment.id}
                  className="flex items-center gap-3 border-b border-hairline px-5 py-2.5 last:border-0 sm:px-6"
                >
                  <input
                    type="checkbox"
                    checked={payment.paid}
                    onChange={() => togglePayment(debt.id, payment.id)}
                    aria-label={`Mark ${formatMoney(payment.amount, debt.currency)} on ${formatDate(payment.date)} as paid`}
                    className="h-4 w-4 shrink-0"
                  />
                  <span className="tnum flex-1 text-sm text-ink-2">{formatDate(payment.date)}</span>
                  <span
                    className={`tnum text-sm font-medium ${payment.paid ? 'text-ink' : 'text-muted'}`}
                  >
                    {formatMoney(payment.amount, debt.currency)}
                  </span>
                  {!payment.paid && <Badge>due</Badge>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title={`Add a payment — ${debt.label}`}
        footer={
          <>
            <Button onClick={() => setAdding(false)}>Cancel</Button>
            <Button variant="primary" onClick={addPayment}>
              Add payment
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
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
          <Field label={`Amount (${debt.currency})`}>
            {(id) => (
              <NumberInput
                id={id}
                min="0"
                autoFocus
                value={draft.amount}
                onChange={(event) => setDraft({ ...draft, amount: event.target.value })}
              />
            )}
          </Field>
        </div>
      </Modal>
    </Card>
  );
}

/* -- editor --------------------------------------------------------------- */

function DebtEditor({
  debt,
  isNew,
  onSaveNew,
  onClose,
}: {
  debt: Debt;
  isNew: boolean;
  onSaveNew: (next: Debt) => void;
  onClose: () => void;
}) {
  const { data, updateDebt } = useBudget();
  const [draft, setDraft] = useState(debt);
  const [plan, setPlan] = useState({ start: new Date().toISOString().slice(0, 10), amount: '', count: '' });

  const save = () => {
    let next = draft;

    // Optionally lay down a repayment plan in one go, which is what most of
    // these loans actually are.
    const amount = Number(plan.amount);
    const count = Number(plan.count);
    if (Number.isFinite(amount) && amount > 0 && Number.isFinite(count) && count > 0) {
      const start = new Date(`${plan.start}T00:00:00`);
      const payments = Array.from({ length: Math.min(120, Math.round(count)) }, (_, index) => {
        const date = new Date(start);
        date.setMonth(date.getMonth() + index);
        return {
          id: newId('pay'),
          date: date.toISOString().slice(0, 10),
          amount,
          paid: date <= new Date(),
        };
      });
      next = { ...next, payments: [...next.payments, ...payments] };
    }

    if (isNew) onSaveNew(next);
    else {
      updateDebt(next.id, next);
      onClose();
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? 'Add a loan' : 'Edit loan'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>
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
              autoFocus
              value={draft.label}
              placeholder="Car loan"
              onChange={(event) => setDraft({ ...draft, label: event.target.value })}
            />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Whose debt">
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
          <Field label="Who lent it">
            {(id) => (
              <TextInput
                id={id}
                value={draft.lender}
                placeholder="FNB"
                onChange={(event) => setDraft({ ...draft, lender: event.target.value })}
              />
            )}
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Total borrowed">
            {(id) => (
              <NumberInput
                id={id}
                min="0"
                value={draft.principal}
                onChange={(event) => setDraft({ ...draft, principal: Number(event.target.value) })}
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

        <Field
          label="Did this loan pay off another loan?"
          hint="Pick the older loan and the amount left to pay updates by itself."
        >
          {(id) => (
            <Select
              id={id}
              value={draft.offsetFromDebtId ?? ''}
              onChange={(event) =>
                setDraft({ ...draft, offsetFromDebtId: event.target.value || undefined })
              }
            >
              <option value="">No, this is all new borrowing</option>
              {data.debts
                .filter((item) => item.id !== draft.id)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
            </Select>
          )}
        </Field>

        <fieldset className="rounded-lg border border-hairline p-4">
          <legend className="px-1 text-sm font-medium text-ink">
            Monthly payment plan (optional)
          </legend>
          <p className="mb-3 text-xs text-muted">
            Sets up all the payments at once. Any dated before today is ticked as paid.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="First payment on">
              {(id) => (
                <TextInput
                  id={id}
                  type="date"
                  value={plan.start}
                  onChange={(event) => setPlan({ ...plan, start: event.target.value })}
                />
              )}
            </Field>
            <Field label="Amount each time">
              {(id) => (
                <NumberInput
                  id={id}
                  min="0"
                  value={plan.amount}
                  onChange={(event) => setPlan({ ...plan, amount: event.target.value })}
                />
              )}
            </Field>
            <Field label="How many payments">
              {(id) => (
                <NumberInput
                  id={id}
                  min="0"
                  max="120"
                  value={plan.count}
                  onChange={(event) => setPlan({ ...plan, count: event.target.value })}
                />
              )}
            </Field>
          </div>
        </fieldset>
      </div>
    </Modal>
  );
}
