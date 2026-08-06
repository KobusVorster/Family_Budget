import { useMemo, useState } from 'react';
import { newId, useBudget } from '../store/BudgetContext';
import type { CurrencyCode, Debt, PlanEvery, PlanUnit, RepaymentPlan } from '../types';
import { summariseDebt, summariseDebts, totalDebtRemaining } from '../lib/calc';
import type { DebtPayment } from '../types';
import { formatMoney, formatPercent } from '../lib/money';
import { seriesColor } from '../lib/palette';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  EstimateMark,
  Field,
  Meter,
  Modal,
  MoneyInput,
  NumberInput,
  PageHeader,
  SegmentedControl,
  Select,
  StatTile,
  TextInput,
} from '../components/ui';
import { ChartFrame, DataTable, RankedBars } from '../components/charts';
import { IconPlus } from '../components/icons';

/* -- repayment schedules --------------------------------------------------- */

type Every = PlanEvery;
type CustomUnit = PlanUnit;

const EVERY_LABEL: Record<Every, string> = {
  once: 'Once off',
  daily: 'Every day',
  weekly: 'Every week',
  biweekly: 'Every 2 weeks',
  monthly: 'Every month',
  quarterly: 'Every 3 months',
  custom: 'Something else',
};

const EVERY_OPTIONS: Every[] = [
  'monthly',
  'weekly',
  'biweekly',
  'daily',
  'quarterly',
  'once',
  'custom',
];

/** Turn "R5,000 every 2 weeks, 12 times, starting the 3rd" into dated lines.
 *
 *  Day and week steps add days, so they land on the same weekday every time.
 *  Month steps move the month and keep the day of the month, clamping to the
 *  last day so the 31st does not skip February. */
export function buildSchedule(options: {
  start: string;
  count: number;
  amount: number;
  every: Every;
  customN: number;
  customUnit: CustomUnit;
  today?: Date;
}): DebtPayment[] {
  const { start, amount, every, customN, customUnit } = options;
  const today = options.today ?? new Date();
  const first = new Date(`${start}T00:00:00`);
  if (Number.isNaN(first.getTime()) || !(amount > 0)) return [];

  const count = every === 'once' ? 1 : Math.max(1, Math.min(500, Math.round(options.count)));
  const step: { days: number; months: number } =
    every === 'daily'
      ? { days: 1, months: 0 }
      : every === 'weekly'
        ? { days: 7, months: 0 }
        : every === 'biweekly'
          ? { days: 14, months: 0 }
          : every === 'monthly'
            ? { days: 0, months: 1 }
            : every === 'quarterly'
              ? { days: 0, months: 3 }
              : every === 'custom'
                ? customUnit === 'days'
                  ? { days: Math.max(1, customN), months: 0 }
                  : customUnit === 'weeks'
                    ? { days: Math.max(1, customN) * 7, months: 0 }
                    : { days: 0, months: Math.max(1, customN) }
                : { days: 0, months: 0 };

  const payments: DebtPayment[] = [];
  const dayOfMonth = first.getDate();

  for (let index = 0; index < count; index += 1) {
    let date: Date;
    if (step.months > 0) {
      date = new Date(first.getFullYear(), first.getMonth() + step.months * index, 1);
      const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      date.setDate(Math.min(dayOfMonth, lastDay));
    } else {
      date = new Date(first);
      date.setDate(date.getDate() + step.days * index);
    }

    payments.push({
      id: newId('pay'),
      date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
        date.getDate(),
      ).padStart(2, '0')}`,
      amount,
      paid: date <= today,
      fromPlan: true,
    });
  }

  return payments;
}

/** Re-lay a loan's payment lines from its plan.
 *
 *  The plan owns the lines it made, so switching from monthly to weekly
 *  replaces them instead of piling weekly lines on top of the monthly ones.
 *  Payments added one at a time are never touched, and a tick already made on a
 *  date the new plan also lands on is kept. */
export function applyPlan(debt: Debt, plan: RepaymentPlan, today?: Date): Debt {
  const rebuilt = buildSchedule({ ...plan, today });
  if (rebuilt.length === 0) return debt;

  const paidDates = new Set(
    debt.payments.filter((payment) => payment.fromPlan && payment.paid).map((p) => p.date),
  );
  const byHand = debt.payments.filter((payment) => !payment.fromPlan);

  return {
    ...debt,
    plan,
    payments: [
      ...byHand,
      ...rebuilt.map((payment) =>
        paidDates.has(payment.date) ? { ...payment, paid: true } : payment,
      ),
    ].sort((a, b) => a.date.localeCompare(b.date)),
  };
}

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
          value={
            nextDue
              ? formatMoney(nextDue.nextPayment!.amount, nextDue.debt.currency, { round: 'auto' })
              : '—'
          }
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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingPayment, setEditingPayment] = useState<DebtPayment | null>(null);
  const [draft, setDraft] = useState({ date: new Date().toISOString().slice(0, 10), amount: '' });

  const debt = data.debts.find((item) => item.id === debtId);
  if (!debt) return null;

  const summary = summariseDebt(debt);
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
              {formatMoney(summary.remaining, debt.currency, { round: 'auto' })}
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
            <dd className="tnum mt-0.5 font-medium">
              {formatMoney(debt.principal, debt.currency, { round: 'auto' })}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Paid so far</dt>
            <dd className="tnum mt-0.5 font-medium">
              {formatMoney(summary.paid, debt.currency, { round: 'auto' })}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Payments left</dt>
            <dd className="tnum mt-0.5 font-medium">{summary.paymentsLeft || '—'}</dd>
          </div>
          <div>
            <dt className="text-muted">Paid off on</dt>
            <dd className="mt-0.5 font-medium">
              {summary.payoffDate ? formatDate(summary.payoffDate) : '—'}
            </dd>
          </div>
        </dl>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => setOpen(!open)} aria-expanded={open}>
            {open ? 'Hide payments' : `Payments (${debt.payments.length})`}
          </Button>
          <Button onClick={() => setAdding(true)}>Add a payment</Button>
          <Button variant="ghost" onClick={() => onEdit(debt)}>
            Edit
          </Button>
          <Button variant="ghost" className="ml-auto" onClick={() => setConfirmDelete(true)}>
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
            <ul className="max-h-96 overflow-y-auto">
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
                    {formatMoney(payment.amount, debt.currency, { round: 'auto' })}
                  </span>
                  {!payment.paid && <Badge>due</Badge>}
                  <Button variant="ghost" onClick={() => setEditingPayment(payment)}>
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    aria-label={`Delete the payment on ${formatDate(payment.date)}`}
                    onClick={() =>
                      updateDebt(debt.id, {
                        payments: debt.payments.filter((item) => item.id !== payment.id),
                      })
                    }
                  >
                    ✕
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        danger
        title={`Delete "${debt.label || 'this loan'}"?`}
        confirmLabel="Delete the loan"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          removeDebt(debt.id);
          setConfirmDelete(false);
        }}
        body={
          <>
            This removes the loan and all {debt.payments.length} of its payments. It cannot be
            undone.
          </>
        }
      />

      {editingPayment && (
        <PaymentEditor
          payment={editingPayment}
          currency={debt.currency}
          onClose={() => setEditingPayment(null)}
          onSave={(next) => {
            updateDebt(debt.id, {
              payments: debt.payments
                .map((item) => (item.id === next.id ? next : item))
                .sort((a, b) => a.date.localeCompare(b.date)),
            });
            setEditingPayment(null);
          }}
          onDelete={() => {
            updateDebt(debt.id, {
              payments: debt.payments.filter((item) => item.id !== editingPayment.id),
            });
            setEditingPayment(null);
          }}
        />
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

/* -- one payment ---------------------------------------------------------- */

/** Change the date or the amount of a single payment, or remove it. */
function PaymentEditor({
  payment,
  currency,
  onSave,
  onDelete,
  onClose,
}: {
  payment: DebtPayment;
  currency: CurrencyCode;
  onSave: (next: DebtPayment) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(payment);
  const valid = Number.isFinite(draft.amount) && draft.amount > 0 && Boolean(draft.date);

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit payment"
      footer={
        <>
          <Button variant="danger" onClick={onDelete} className="mr-auto">
            Delete
          </Button>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!valid} onClick={() => onSave(draft)}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Due date">
          {(id) => (
            <TextInput
              id={id}
              type="date"
              value={draft.date}
              onChange={(event) => setDraft({ ...draft, date: event.target.value })}
            />
          )}
        </Field>
        <Field label={`Amount (${currency})`}>
          {(id) => (
            <MoneyInput
              id={id}
              min="0"
              value={draft.amount}
              onValueChange={(amount) => setDraft({ ...draft, amount })}
            />
          )}
        </Field>
      </div>

      <label className="mt-4 flex items-center gap-2 text-sm text-ink-2">
        <input
          type="checkbox"
          checked={draft.paid}
          onChange={(event) => setDraft({ ...draft, paid: event.target.checked })}
        />
        Already paid
      </label>
    </Modal>
  );
}

/** Says in words what the plan will create, so nobody has to press Save to
 *  find out. */
function SchedulePreview({
  plan,
  currency,
  replaces = false,
}: {
  plan: Parameters<typeof buildSchedule>[0];
  currency: CurrencyCode;
  /** True when saving will rebuild payment lines this plan made before. */
  replaces?: boolean;
}) {
  const payments = buildSchedule(plan);
  if (payments.length === 0) {
    return (
      <p className="mt-3 rounded-lg bg-sunken p-3 text-sm text-ink-2">
        <strong className="font-semibold text-ink">No payments will be made.</strong> Type an
        “Amount each time” above to set up a plan. Without it, “How often” does nothing — add
        payments one at a time instead.
      </p>
    );
  }

  const total = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const last = payments[payments.length - 1];

  return (
    <p className="mt-3 rounded-lg bg-sunken p-3 text-sm text-ink-2">
      {payments.length === 1 ? (
        <>
          One payment of{' '}
          <strong className="tnum font-semibold text-ink">
            {formatMoney(payments[0].amount, currency, { round: 'auto' })}
          </strong>{' '}
          on {formatDate(payments[0].date)}.
        </>
      ) : (
        <>
          <strong className="tnum font-semibold text-ink">{payments.length} payments</strong> of{' '}
          {formatMoney(payments[0].amount, currency, { round: 'auto' })}, from{' '}
          {formatDate(payments[0].date)} to{' '}
          {formatDate(last.date)} —{' '}
          <strong className="tnum font-semibold text-ink">
            {formatMoney(total, currency, { round: 'auto' })}
          </strong>{' '}
          in
          all.
        </>
      )}
      {replaces && (
        <span className="mt-2 block text-xs text-muted">
          Saving replaces the payments the old plan made. Payments you added one at a time stay.
        </span>
      )}
    </p>
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

  /* Seeded from the loan's saved plan, so re-opening Edit shows what was
     chosen last time. Before this the plan was throw-away state that always
     started at "every month", which read as the loan not saving. */
  const [plan, setPlan] = useState<RepaymentPlan>(
    () =>
      debt.plan ?? {
        start: new Date().toISOString().slice(0, 10),
        amount: 0,
        count: 12,
        every: 'monthly',
        customN: 2,
        customUnit: 'weeks',
      },
  );

  const planChanged = JSON.stringify(plan) !== JSON.stringify(debt.plan ?? null);
  const rebuilds = planChanged && buildSchedule(plan).length > 0;

  const save = () => {
    let next = draft;

    /* Remember the plan even when there is no amount yet, so picking "every
       week" and coming back later still says every week. Only the dated
       payment lines need an amount to be built. */
    if (planChanged) next = { ...next, plan };
    if (rebuilds) next = applyPlan(next, plan);

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
              <MoneyInput
                id={id}
                min="0"
                value={draft.principal}
                onValueChange={(principal) => setDraft({ ...draft, principal })}
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

        <fieldset className="rounded-lg border border-hairline p-4">
          <legend className="px-1 text-sm font-medium text-ink">
            Repayment plan (optional)
          </legend>
          <p className="mb-3 text-xs text-muted">
            Sets up all the payments at once. Any dated before today is ticked as paid. You can
            change or delete any single one afterwards.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="How often">
              {(id) => (
                <Select
                  id={id}
                  value={plan.every}
                  onChange={(event) => setPlan({ ...plan, every: event.target.value as Every })}
                >
                  {EVERY_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {EVERY_LABEL[option]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
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
          </div>

          {plan.every === 'custom' && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Repeat every">
                {(id) => (
                  <NumberInput
                    id={id}
                    min="1"
                    value={plan.customN}
                    onChange={(event) => setPlan({ ...plan, customN: Number(event.target.value) })}
                  />
                )}
              </Field>
              <Field label="Days, weeks or months">
                {(id) => (
                  <Select
                    id={id}
                    value={plan.customUnit}
                    onChange={(event) =>
                      setPlan({ ...plan, customUnit: event.target.value as CustomUnit })
                    }
                  >
                    <option value="days">Days</option>
                    <option value="weeks">Weeks</option>
                    <option value="months">Months</option>
                  </Select>
                )}
              </Field>
            </div>
          )}

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label={`Amount each time (${draft.currency})`}>
              {(id) => (
                <MoneyInput
                  id={id}
                  min="0"
                  value={plan.amount}
                  onValueChange={(amount) => setPlan({ ...plan, amount })}
                />
              )}
            </Field>
            {plan.every !== 'once' && (
              <Field label="How many payments">
                {(id) => (
                  <NumberInput
                    id={id}
                    min="1"
                    max="500"
                    value={plan.count}
                    onChange={(event) => setPlan({ ...plan, count: Number(event.target.value) })}
                  />
                )}
              </Field>
            )}
          </div>

          <SchedulePreview
            plan={plan}
            currency={draft.currency}
            replaces={rebuilds && draft.payments.some((payment) => payment.fromPlan)}
          />
        </fieldset>
      </div>
    </Modal>
  );
}
