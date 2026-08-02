export type CurrencyCode = 'USD' | 'ZAR';

/** How often a recurring amount lands. Everything is normalised to a monthly
 *  figure for comparison — see `lib/money.ts`. */
export type Frequency = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annual';

export type PersonId = string;

/** Who an expense belongs to. `shared` means the cost is split between people
 *  according to the expense's `split` map. */
export type Owner = PersonId | 'shared';

export interface Person {
  id: PersonId;
  name: string;
  fullName: string;
  /** The currency this person earns and spends in day to day. */
  currency: CurrencyCode;
  country: string;
  /** Categorical palette slot, 1-8. Fixed per person so a filter never
   *  repaints them. */
  slot: number;
  initials: string;
}

export type IncomeKind = 'salary' | 'support' | 'gig' | 'other';

export interface IncomeSource {
  id: string;
  personId: PersonId;
  label: string;
  amount: number;
  currency: CurrencyCode;
  frequency: Frequency;
  kind: IncomeKind;
  active: boolean;
  /** False while the amount is still a guess. Shown as "guess" in the UI and
   *  listed on the Settings page until someone types the real one. */
  verified: boolean;
  note?: string;
}

export type ExpenseCategory =
  | 'Housing'
  | 'Transport'
  | 'Debt'
  | 'Utilities'
  | 'Family'
  | 'Insurance'
  | 'Living'
  | 'Subscriptions';

export interface Expense {
  id: string;
  label: string;
  category: ExpenseCategory;
  amount: number;
  currency: CurrencyCode;
  frequency: Frequency;
  owner: Owner;
  /** Who actually moves the money. For shared expenses this is the person
   *  whose account it leaves, which is what drives the settlement. */
  paidBy: PersonId;
  /** Only meaningful when `owner === 'shared'`. Fractions per person, summing
   *  to 1. */
  split?: Record<PersonId, number>;
  account?: string;
  active: boolean;
  verified: boolean;
  note?: string;
}

export interface DebtPayment {
  id: string;
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  amount: number;
  note?: string;
  /** Scheduled-but-not-yet-made payments are the payoff plan; paid ones are
   *  history. */
  paid: boolean;
}

export interface Debt {
  id: string;
  label: string;
  personId: PersonId;
  lender: string;
  currency: CurrencyCode;
  /** Original amount borrowed. */
  principal: number;
  /** Set when this loan paid off an earlier one: part of the principal went
   *  straight to clearing that debt rather than to the borrower. Read live off
   *  the other debt's balance, so the two can never disagree. */
  offsetFromDebtId?: string;
  payments: DebtPayment[];
  verified: boolean;
  note?: string;
}

/** A single day's gig earnings or ad-hoc spend — the raw feed behind the
 *  variable side of Will's income. */
export interface LedgerEntry {
  id: string;
  date: string;
  personId: PersonId;
  label: string;
  amount: number;
  currency: CurrencyCode;
  type: 'income' | 'expense';
}

/** `${expenseId}:${YYYY-MM}` -> paid. Drives the monthly checklist. */
export type Checklist = Record<string, boolean>;

export interface Settings {
  /** How many ZAR one USD buys. Entered by hand and dated, because there is no
   *  live rate feed in the app. */
  usdZarRate: number;
  rateUpdatedAt: string;
  /** Which currency totals are reported in. Individual lines still show their
   *  own currency alongside, so nobody has to do the conversion in their head
   *  to recognise a number they entered. */
  displayCurrency: CurrencyCode;
  theme: 'light' | 'dark' | 'system';
  /** `sample` while the app is still showing the numbers it shipped with. Any
   *  edit flips it to `live` and retires the sample-data banner. */
  dataMode: 'sample' | 'live';

  /** The full monthly rent on the South African house. */
  saTotalRent: number;
  /** Daddy's contribution towards it. Will covers the difference, and the
   *  shared rent bill is derived from these two rather than typed in
   *  separately, so the three can never disagree. */
  saRentFromDaddy: number;
  /** The shared expense the rent split writes into. */
  saRentExpenseId: string;
}

export interface BudgetData {
  version: number;
  people: Person[];
  income: IncomeSource[];
  expenses: Expense[];
  debts: Debt[];
  ledger: LedgerEntry[];
  checklist: Checklist;
  settings: Settings;
}
