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
  /** Principal less anything that went straight to clearing an earlier loan. */
  opening: number;
  offset: number;
  paid: number;
  remaining: number;
  /** 0-1. */
  progress: number;
  scheduledRemaining: number;
  /** ISO date of the last scheduled instalment, when there is a plan. */
  payoffDate: string | null;
  monthsLeft: number;
  nextPayment: { date: string; amount: number } | null;
}

export function summariseDebt(debt: Debt, all: Debt[]): DebtSummary {
  const paid = debt.payments
    .filter((payment) => payment.paid)
    .reduce((total, payment) => total + payment.amount, 0);

  // The offset is whatever is still owed on the debt this one consolidated —
  // read live, so paying down the old loan moves this loan's opening balance
  // with it.
  let offset = 0;
  if (debt.offsetFromDebtId) {
    const source = all.find((entry) => entry.id === debt.offsetFromDebtId);
    if (source) {
      const sourcePaid = source.payments
        .filter((payment) => payment.paid)
        .reduce((total, payment) => total + payment.amount, 0);
      offset = Math.max(0, source.principal - sourcePaid);
    }
  }

  const opening = Math.max(0, debt.principal - offset);
  const remaining = Math.max(0, opening - paid);
  const outstanding = debt.payments.filter((payment) => !payment.paid);
  const scheduledRemaining = outstanding.reduce((total, payment) => total + payment.amount, 0);
  const next = outstanding[0] ?? null;

  return {
    debt,
    opening,
    offset,
    paid,
    remaining,
    progress: opening > 0 ? Math.min(1, paid / opening) : 1,
    scheduledRemaining,
    payoffDate: outstanding.length > 0 ? outstanding[outstanding.length - 1].date : null,
    monthsLeft: outstanding.length,
    nextPayment: next ? { date: next.date, amount: next.amount } : null,
  };
}

export function summariseDebts(data: BudgetData, personId?: PersonId): DebtSummary[] {
  return data.debts
    .filter((debt) => personId === undefined || debt.personId === personId)
    .map((debt) => summariseDebt(debt, data.debts));
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

/* -- ledger --------------------------------------------------------------- */

export interface LedgerPoint {
  /** ISO date of the first day in the bucket. */
  date: string;
  label: string;
  total: number;
  /** Per source, so the stack keeps its identity colours. */
  bySource: Record<string, number>;
}

/** Roll daily entries up into weeks. Daily gig income is too noisy to read as a
 *  line; weekly is where the pattern shows. */
export function weeklyLedger(
  entries: LedgerEntry[],
  conversion: Conversion,
  weeks = 8,
): LedgerPoint[] {
  const income = entries.filter((entry) => entry.type === 'income');
  if (income.length === 0) return [];

  const buckets = new Map<string, LedgerPoint>();

  for (const entry of income) {
    const date = new Date(`${entry.date}T00:00:00`);
    // Week starts on Monday.
    const offset = (date.getDay() + 6) % 7;
    const start = new Date(date);
    start.setDate(start.getDate() - offset);
    const key = start.toISOString().slice(0, 10);

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        date: key,
        label: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        total: 0,
        bySource: {},
      };
      buckets.set(key, bucket);
    }

    const value = amountIn(entry.amount, entry.currency, conversion);
    bucket.total += value;
    bucket.bySource[entry.label] = (bucket.bySource[entry.label] ?? 0) + value;
  }

  return [...buckets.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-weeks);
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

export interface ChecklistProgress {
  paid: number;
  total: number;
  outstanding: number;
}

export function checklistProgress(
  data: BudgetData,
  month: string,
  conversion: Conversion,
): ChecklistProgress {
  const expenses = activeExpenses(data);
  let paid = 0;
  let outstanding = 0;

  for (const expense of expenses) {
    if (data.checklist[checklistKey(expense.id, month)]) {
      paid += 1;
    } else {
      outstanding += monthlyValue(expense, conversion);
    }
  }

  return { paid, total: expenses.length, outstanding };
}
