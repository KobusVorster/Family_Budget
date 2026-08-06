import type {
  BudgetData,
  CurrencyCode,
  Debt,
  Expense,
  ExpenseCategory,
  IncomeSource,
  LedgerEntry,
  Person,
  PersonId,
} from '../types';
import { convert, toMonthly } from './money';

/** Everything a view needs to turn a stored amount into a comparable one. */
export interface Conversion {
  usdZarRate: number;
  /** The currency totals are reported in. */
  target: CurrencyCode;
}

export function amountIn(
  amount: number,
  from: CurrencyCode,
  { usdZarRate, target }: Conversion,
): number {
  return convert(amount, from, target, usdZarRate);
}

/** Monthly cost of a recurring line, converted to the reporting currency. */
export function monthlyValue(
  item: { amount: number; currency: CurrencyCode; frequency: Expense['frequency'] },
  conversion: Conversion,
): number {
  return amountIn(toMonthly(item.amount, item.frequency), item.currency, conversion);
}

/* -- income --------------------------------------------------------------- */

export function activeIncome(data: BudgetData, personId?: PersonId): IncomeSource[] {
  return data.income.filter(
    (source) => source.active && (personId === undefined || source.personId === personId),
  );
}

/** Average days in a month (365.25 / 12). */
export const DAYS_PER_MONTH = 365.25 / 12;

export interface GigAverage {
  /** First and last day in the log. */
  from: string;
  to: string;
  /** Calendar days the log covers, including days that earned nothing. */
  days: number;
  total: number;
  perDay: number;
  perMonth: number;
  bySource: Array<{ label: string; total: number; perMonth: number; days: number }>;
}

/** Turn a daily earnings log into a monthly figure.
 *
 *  Gig work pays a different amount every day, so there is no number to type
 *  in. The average is taken over every calendar day the log covers — including
 *  the days that earned nothing, because a day off is part of the average.
 *  Counting only the days that made money would overstate the month. */
export function gigAverage(
  data: BudgetData,
  personId: PersonId | undefined,
  conversion: Conversion,
): GigAverage | null {
  const entries = data.ledger.filter(
    (entry) =>
      entry.type === 'income' && (personId === undefined || entry.personId === personId),
  );
  if (entries.length === 0) return null;

  const dates = entries.map((entry) => entry.date).sort();
  const from = dates[0];
  const to = dates[dates.length - 1];
  const days =
    Math.round(
      (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
    ) + 1;
  const span = Math.max(1, days);

  const totals = new Map<string, { total: number; days: Set<string> }>();
  let total = 0;

  for (const entry of entries) {
    const value = amountIn(entry.amount, entry.currency, conversion);
    total += value;
    const bucket = totals.get(entry.label) ?? { total: 0, days: new Set<string>() };
    bucket.total += value;
    bucket.days.add(entry.date);
    totals.set(entry.label, bucket);
  }

  return {
    from,
    to,
    days: span,
    total,
    perDay: total / span,
    perMonth: (total / span) * DAYS_PER_MONTH,
    bySource: [...totals.entries()]
      .map(([label, bucket]) => ({
        label,
        total: bucket.total,
        perMonth: (bucket.total / span) * DAYS_PER_MONTH,
        days: bucket.days.size,
      }))
      .sort((a, b) => b.total - a.total),
  };
}

/** Everything a person earns in a month: their fixed lines, plus the average
 *  of whatever their daily log shows. */
export function monthlyIncome(
  data: BudgetData,
  personId: PersonId | undefined,
  conversion: Conversion,
): number {
  const fixed = activeIncome(data, personId).reduce(
    (total, source) => total + monthlyValue(source, conversion),
    0,
  );
  return fixed + (gigAverage(data, personId, conversion)?.perMonth ?? 0);
}

/* -- expenses ------------------------------------------------------------- */

export function activeExpenses(data: BudgetData): Expense[] {
  return data.expenses.filter((expense) => expense.active);
}

/** The fraction of a shared expense a person is on the hook for. Personal
 *  expenses are borne entirely by their owner. */
export function shareFor(expense: Expense, personId: PersonId): number {
  if (expense.owner === 'shared') return expense.split?.[personId] ?? 0;
  return expense.owner === personId ? 1 : 0;
}

/** What a person's expenses cost them per month: their own lines in full, plus
 *  their agreed share of everything shared. */
export function monthlyBurden(
  data: BudgetData,
  personId: PersonId,
  conversion: Conversion,
): number {
  return activeExpenses(data).reduce((total, expense) => {
    const share = shareFor(expense, personId);
    return share === 0 ? total : total + monthlyValue(expense, conversion) * share;
  }, 0);
}

/** What actually leaves a person's accounts each month — which is a different
 *  number from what they bear, and the gap is the settlement. */
export function monthlyOutflow(
  data: BudgetData,
  personId: PersonId,
  conversion: Conversion,
): number {
  return activeExpenses(data)
    .filter((expense) => expense.paidBy === personId)
    .reduce((total, expense) => total + monthlyValue(expense, conversion), 0);
}

export function monthlyShared(data: BudgetData, conversion: Conversion): number {
  return activeExpenses(data)
    .filter((expense) => expense.owner === 'shared')
    .reduce((total, expense) => total + monthlyValue(expense, conversion), 0);
}

/* -- per-person summary --------------------------------------------------- */

export interface PersonSummary {
  person: Person;
  income: number;
  /** Own expenses plus share of shared. */
  burden: number;
  /** Own expenses only, ignoring anything shared. */
  personal: number;
  /** Their share of the shared block. */
  sharedShare: number;
  /** What leaves their accounts. */
  outflow: number;
  /** income − burden. Negative means they cannot cover their own life. */
  net: number;
  /** Fraction of income already committed. */
  committed: number;
}

export function summarise(
  data: BudgetData,
  person: Person,
  conversion: Conversion,
): PersonSummary {
  const income = monthlyIncome(data, person.id, conversion);
  const burden = monthlyBurden(data, person.id, conversion);
  const personal = activeExpenses(data)
    .filter((expense) => expense.owner === person.id)
    .reduce((total, expense) => total + monthlyValue(expense, conversion), 0);
  const sharedShare = burden - personal;

  return {
    person,
    income,
    burden,
    personal,
    sharedShare,
    outflow: monthlyOutflow(data, person.id, conversion),
    net: income - burden,
    committed: income > 0 ? burden / income : 0,
  };
}

export interface HouseholdSummary {
  income: number;
  expenses: number;
  net: number;
  shared: number;
  people: PersonSummary[];
}

export function summariseHousehold(
  data: BudgetData,
  conversion: Conversion,
): HouseholdSummary {
  const people = data.people.map((person) => summarise(data, person, conversion));
  const income = people.reduce((total, entry) => total + entry.income, 0);
  const expenses = activeExpenses(data).reduce(
    (total, expense) => total + monthlyValue(expense, conversion),
    0,
  );

  return {
    income,
    expenses,
    net: income - expenses,
    shared: monthlyShared(data, conversion),
    people,
  };
}

/* -- settlement ----------------------------------------------------------- */

export interface SettlementLine {
  person: Person;
  paid: number;
  owes: number;
  /** paid − owes. Positive means the household owes them. */
  balance: number;
}

export interface Settlement {
  lines: SettlementLine[];
  /** Who should pay whom, and how much, to square the month up. */
  transfer: { from: Person; to: Person; amount: number } | null;
}

/** Settle the shared block only. Personal expenses never enter it — each
 *  person's own life is their own business. */
export function settleShared(data: BudgetData, conversion: Conversion): Settlement {
  const shared = activeExpenses(data).filter((expense) => expense.owner === 'shared');

  const lines: SettlementLine[] = data.people.map((person) => {
    const paid = shared
      .filter((expense) => expense.paidBy === person.id)
      .reduce((total, expense) => total + monthlyValue(expense, conversion), 0);
    const owes = shared.reduce(
      (total, expense) => total + monthlyValue(expense, conversion) * shareFor(expense, person.id),
      0,
    );
    return { person, paid, owes, balance: paid - owes };
  });

  // With two people the settlement is a single transfer from whoever is behind
  // to whoever is ahead. Anything under a cent is rounding, not a debt.
  const creditor = lines.find((line) => line.balance > 0.01);
  const debtor = lines.find((line) => line.balance < -0.01);

  return {
    lines,
    transfer:
      creditor && debtor
        ? {
            from: debtor.person,
            to: creditor.person,
            amount: Math.min(creditor.balance, -debtor.balance),
          }
        : null,
  };
}

/* -- categories ----------------------------------------------------------- */

export interface CategorySlice {
  category: ExpenseCategory;
  amount: number;
  share: number;
}

export function categoryBreakdown(
  expenses: Expense[],
  conversion: Conversion,
): CategorySlice[] {
  const totals = new Map<ExpenseCategory, number>();
  for (const expense of expenses) {
    if (!expense.active) continue;
    totals.set(
      expense.category,
      (totals.get(expense.category) ?? 0) + monthlyValue(expense, conversion),
    );
  }

  const grand = [...totals.values()].reduce((total, value) => total + value, 0);

  return [...totals.entries()]
    .map(([category, amount]) => ({
      category,
      amount,
      share: grand > 0 ? amount / grand : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
}

/* -- debts ---------------------------------------------------------------- */

export interface DebtSummary {
  debt: Debt;
  paid: number;
  remaining: number;
  /** 0-1. */
  progress: number;
  scheduledRemaining: number;
  /** ISO date of the last payment still to come, when there is a plan. */
  payoffDate: string | null;
  paymentsLeft: number;
  nextPayment: { date: string; amount: number } | null;
}

/** What is left on a loan: what was borrowed, minus every payment ticked off.
 *  Nothing else is deducted. */
export function summariseDebt(debt: Debt): DebtSummary {
  const paid = debt.payments
    .filter((payment) => payment.paid)
    .reduce((total, payment) => total + payment.amount, 0);

  const remaining = Math.max(0, debt.principal - paid);
  const outstanding = debt.payments
    .filter((payment) => !payment.paid)
    .sort((a, b) => a.date.localeCompare(b.date));
  const scheduledRemaining = outstanding.reduce((total, payment) => total + payment.amount, 0);
  const next = outstanding[0] ?? null;

  return {
    debt,
    paid,
    remaining,
    progress: debt.principal > 0 ? Math.min(1, paid / debt.principal) : 1,
    scheduledRemaining,
    payoffDate: outstanding.length > 0 ? outstanding[outstanding.length - 1].date : null,
    paymentsLeft: outstanding.length,
    nextPayment: next ? { date: next.date, amount: next.amount } : null,
  };
}

export function summariseDebts(data: BudgetData, personId?: PersonId): DebtSummary[] {
  return data.debts
    .filter((debt) => personId === undefined || debt.personId === personId)
    .map((debt) => summariseDebt(debt));
}

/** Total still owed, in the reporting currency. */
export function totalDebtRemaining(
  data: BudgetData,
  conversion: Conversion,
  personId?: PersonId,
): number {
  return summariseDebts(data, personId).reduce(
    (total, summary) => total + amountIn(summary.remaining, summary.debt.currency, conversion),
    0,
  );
}

export interface DebtSplit {
  total: number;
  byPerson: Array<{ person: Person; total: number; native: number; currency: CurrencyCode }>;
}

/** Debt in one currency for the headline, plus each person's share in the
 *  currency they actually owe it in. */
export function debtSplit(data: BudgetData, conversion: Conversion): DebtSplit {
  const byPerson = data.people.map((person) => {
    const native = summariseDebts(data, person.id).reduce(
      (total, summary) => total + summary.remaining,
      0,
    );
    return {
      person,
      total: amountIn(native, person.currency, conversion),
      native,
      currency: person.currency,
    };
  });

  return {
    total: byPerson.reduce((total, entry) => total + entry.total, 0),
    byPerson,
  };
}

/* -- savings -------------------------------------------------------------- */

export interface SavingsSummary {
  total: number;
  byPerson: Array<{ person: Person; total: number }>;
}

export function summariseSavings(data: BudgetData, conversion: Conversion): SavingsSummary {
  const byPerson = data.people.map((person) => ({
    person,
    total: data.savings
      .filter((entry) => entry.personId === person.id)
      .reduce((total, entry) => total + amountIn(entry.amount, entry.currency, conversion), 0),
  }));

  return { total: byPerson.reduce((total, entry) => total + entry.total, 0), byPerson };
}

/* -- what to pay next ------------------------------------------------------ */

export interface DueItem {
  id: string;
  label: string;
  who: string;
  /** ISO date it is due. */
  due: string;
  /** Days from today. Negative means overdue. */
  daysAway: number;
  amount: number;
  currency: CurrencyCode;
  /** Where pressing it should take you. */
  page: 'checklist' | 'debt';
  kind: 'Bill' | 'Loan';
  /** Something has been paid towards it, but not all of it. */
  partPaid?: boolean;
}

/** Everything still to be paid, soonest first.
 *
 *  Two things land here: bills not yet ticked off for this month, and loan
 *  payments still due. A bill with no due day set is treated as due at the end
 *  of the month, so it sorts last rather than disappearing. */
export function whatToPayNext(
  data: BudgetData,
  conversion: Conversion,
  today: Date = new Date(),
): DueItem[] {
  const items: DueItem[] = [];
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const month = monthKey(today);
  const daysBetween = (iso: string) =>
    Math.round(
      (new Date(`${iso}T00:00:00`).getTime() - startOfToday.getTime()) / 86_400_000,
    );

  const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

  for (const expense of activeExpenses(data)) {
    if (expense.frequency === 'once') continue;
    // A part-paid bill stays on the list, showing only what is still owed.
    const status = billStatus(data, expense, month);
    if (status.state === 'paid') continue;

    const day = Math.min(expense.dueDay ?? lastDayOfMonth, lastDayOfMonth);
    const due = new Date(today.getFullYear(), today.getMonth(), day);
    const iso = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(
      due.getDate(),
    ).padStart(2, '0')}`;

    items.push({
      id: expense.id,
      label: expense.label || 'Untitled',
      who:
        expense.owner === 'shared'
          ? 'Shared'
          : (data.people.find((person) => person.id === expense.owner)?.name ?? ''),
      due: iso,
      daysAway: daysBetween(iso),
      amount: amountIn(status.remaining, expense.currency, conversion),
      currency: conversion.target,
      page: 'checklist',
      kind: 'Bill',
      partPaid: status.state === 'part',
    });
  }

  for (const summary of summariseDebts(data)) {
    if (!summary.nextPayment) continue;
    items.push({
      id: summary.debt.id,
      label: summary.debt.label || 'Untitled loan',
      who: data.people.find((person) => person.id === summary.debt.personId)?.name ?? '',
      due: summary.nextPayment.date,
      daysAway: daysBetween(summary.nextPayment.date),
      amount: amountIn(summary.nextPayment.amount, summary.debt.currency, conversion),
      currency: conversion.target,
      page: 'debt',
      kind: 'Loan',
    });
  }

  return items.sort((a, b) => a.due.localeCompare(b.due));
}

/* -- ledger --------------------------------------------------------------- */

export interface LedgerPoint {
  /** ISO date of the first day in the bucket. */
  date: string;
  label: string;
  total: number;
  /** Per source, so the stack keeps its identity colours. */
  bySource: Record<string, number>;
}

export type LedgerPeriod = 'day' | 'week' | 'month' | 'year';

/** How many buckets each view shows by default, and what each one is called.
 *  Daily is capped well below the others: sixty bars side by side is a smear,
 *  not a chart. */
export const PERIOD_SIZE: Record<LedgerPeriod, number> = {
  day: 30,
  week: 12,
  month: 12,
  year: 5,
};

export const PERIOD_LABEL: Record<LedgerPeriod, string> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
  year: 'Year',
};

/** Which bucket a date falls in, and what to call it. */
function bucketFor(iso: string, period: LedgerPeriod): { key: string; label: string } {
  const date = new Date(`${iso}T00:00:00`);

  if (period === 'day') {
    return {
      key: iso,
      label: date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }),
    };
  }

  if (period === 'week') {
    // Weeks start on Monday.
    const start = new Date(date);
    start.setDate(start.getDate() - ((date.getDay() + 6) % 7));
    return {
      key: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(
        start.getDate(),
      ).padStart(2, '0')}`,
      label: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    };
  }

  if (period === 'month') {
    return {
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      label: date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
    };
  }

  return { key: String(date.getFullYear()), label: String(date.getFullYear()) };
}

/** Add the daily earnings log up by day, week, month or year.
 *
 *  Only income is counted, and only the most recent `count` buckets are
 *  returned, newest last. */
export function ledgerSeries(
  entries: LedgerEntry[],
  conversion: Conversion,
  period: LedgerPeriod = 'week',
  count = PERIOD_SIZE[period],
): LedgerPoint[] {
  const income = entries.filter((entry) => entry.type === 'income');
  if (income.length === 0) return [];

  const buckets = new Map<string, LedgerPoint>();

  for (const entry of income) {
    const { key, label } = bucketFor(entry.date, period);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { date: key, label, total: 0, bySource: {} };
      buckets.set(key, bucket);
    }
    const value = amountIn(entry.amount, entry.currency, conversion);
    bucket.total += value;
    bucket.bySource[entry.label] = (bucket.bySource[entry.label] ?? 0) + value;
  }

  return [...buckets.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-Math.max(1, count));
}

/** Weeks, the old way. Kept so callers that only ever wanted weeks stay
 *  readable. */
export function weeklyLedger(
  entries: LedgerEntry[],
  conversion: Conversion,
  weeks = 8,
): LedgerPoint[] {
  return ledgerSeries(entries, conversion, 'week', weeks);
}

export function ledgerSources(entries: LedgerEntry[]): string[] {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (entry.type === 'income') seen.add(entry.label);
  }
  return [...seen].sort();
}

/* -- data health ---------------------------------------------------------- */

export interface ReviewItem {
  id: string;
  label: string;
  /** Whose line it is. */
  who: string;
  /** The page it lives on, so the app can send you straight there. */
  page: 'income' | 'expenses' | 'debt';
  /** Must read exactly as the menu reads, or the instruction sends someone
   *  looking for a page name that is not on screen. */
  pageName: string;
  amount: number;
  currency: CurrencyCode;
}

/** Every amount that is still a guess. Each one carries the page it lives on,
 *  so the list can say exactly where to go and not just that something is
 *  wrong. */
export function reviewQueue(data: BudgetData): ReviewItem[] {
  const items: ReviewItem[] = [];
  const nameOf = (id: PersonId) => data.people.find((person) => person.id === id)?.name ?? '';

  for (const source of data.income) {
    if (!source.verified) {
      items.push({
        id: source.id,
        label: source.label,
        who: nameOf(source.personId),
        page: 'income',
        pageName: 'Money in',
        amount: source.amount,
        currency: source.currency,
      });
    }
  }
  for (const expense of data.expenses) {
    if (!expense.verified) {
      items.push({
        id: expense.id,
        label: expense.label,
        who: expense.owner === 'shared' ? 'Shared' : nameOf(expense.owner),
        page: 'expenses',
        pageName: 'Money out',
        amount: expense.amount,
        currency: expense.currency,
      });
    }
  }
  for (const debt of data.debts) {
    if (!debt.verified) {
      items.push({
        id: debt.id,
        label: debt.label,
        who: nameOf(debt.personId),
        page: 'debt',
        pageName: 'Debt',
        amount: debt.principal,
        currency: debt.currency,
      });
    }
  }

  return items;
}

/* -- checklist ------------------------------------------------------------ */

export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function checklistKey(expenseId: string, month: string): string {
  return `${expenseId}:${month}`;
}

/** What a bill costs this month, in its own currency. Part payments are
 *  recorded against this, not against the converted figure. */
export function dueThisMonth(expense: Expense): number {
  return toMonthly(expense.amount, expense.frequency);
}

/** Anything under half a cent is rounding, not money owed. */
const SETTLED = 0.005;

export interface BillStatus {
  due: number;
  paid: number;
  remaining: number;
  /** 0-1, for the little bar on the row. */
  progress: number;
  state: 'unpaid' | 'part' | 'paid';
}

/** Where a single bill stands this month, all in the bill's own currency. */
export function billStatus(data: BudgetData, expense: Expense, month: string): BillStatus {
  const due = dueThisMonth(expense);
  const paid = Math.max(0, data.checklist[checklistKey(expense.id, month)] ?? 0);
  const remaining = Math.max(0, due - paid);

  return {
    due,
    paid,
    remaining,
    progress: due > 0 ? Math.min(1, paid / due) : 1,
    state: remaining <= SETTLED ? 'paid' : paid > SETTLED ? 'part' : 'unpaid',
  };
}

export interface ChecklistProgress {
  /** Bills settled in full. */
  paid: number;
  /** Bills with something paid but not all of it. */
  part: number;
  total: number;
  /** Money still owed this month, in the reporting currency. */
  outstanding: number;
  /** Money already handed over this month, in the reporting currency. */
  settled: number;
}

export function checklistProgress(
  data: BudgetData,
  month: string,
  conversion: Conversion,
): ChecklistProgress {
  const expenses = activeExpenses(data);
  let paid = 0;
  let part = 0;
  let outstanding = 0;
  let settled = 0;

  for (const expense of expenses) {
    const status = billStatus(data, expense, month);
    if (status.state === 'paid') paid += 1;
    else if (status.state === 'part') part += 1;
    outstanding += amountIn(status.remaining, expense.currency, conversion);
    settled += amountIn(status.paid, expense.currency, conversion);
  }

  return { paid, part, total: expenses.length, outstanding, settled };
}
