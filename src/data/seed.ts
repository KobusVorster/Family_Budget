import type {
  BudgetData,
  Debt,
  DebtPayment,
  Expense,
  IncomeSource,
  LedgerEntry,
  Person,
} from '../types';

/* ---------------------------------------------------------------------------
   Seed data carried over from the "Family Budget" workbook.

   Two kinds of number live in here and the difference matters:

   `verified: true`  — the figure appeared in the spreadsheet, or falls straight
                       out of one of its formulas. Liz's monthly expense total,
                       for instance, is not written anywhere in the sheet, but
                       `SA!C7 = B2 - B7` reports a shortfall of -2,369.09
                       against income of 31,954, which pins the total at
                       34,323.09 exactly.

   `verified: false` — a placeholder. The workbook summary gave the *names* of
                       these lines but not their amounts, so they are filled
                       with plausible values and flagged. The app shows a
                       running count of them and the Review page lists every
                       one, so they can be corrected against the real sheet.

   Liz's 22 individual expense lines are estimates, but they are chosen to sum
   to exactly 34,323.09 — the total the workbook does pin down. Correcting the
   individual lines therefore only ever moves money between categories; the
   household bottom line stays right in the meantime.
--------------------------------------------------------------------------- */

/** The workbook's frozen fallback rate. Both sheets used a GOOGLEFINANCE call
 *  that does not exist in Excel, so both had silently sat on this number. */
export const SEED_USD_ZAR = 16.4612;

/** SA!E2 — the full monthly rent on the South African house. */
export const SA_TOTAL_RENT = 14373;

/** SA!C7 — income minus expenses on Liz's side, which Will covers. */
export const LIZ_MONTHLY_SHORTFALL = 2369.09;

const WILL = 'will';
const LIZ = 'liz';

export const PEOPLE: Person[] = [
  {
    id: WILL,
    name: 'Will',
    fullName: 'Willem',
    currency: 'USD',
    country: 'United States',
    slot: 1,
    initials: 'W',
  },
  {
    id: LIZ,
    name: 'Liz',
    fullName: 'Lizanne',
    currency: 'ZAR',
    country: 'South Africa',
    slot: 2,
    initials: 'L',
  },
];

/* -- dates ---------------------------------------------------------------- */

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** Deterministic pseudo-random source, so the sample gig ledger is identical on
 *  every machine and diffs stay clean. */
function makeRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/* -- income --------------------------------------------------------------- */

function seedIncome(): IncomeSource[] {
  return [
    {
      id: 'inc-liz-salary',
      personId: LIZ,
      label: 'Salary',
      amount: 25000,
      currency: 'ZAR',
      frequency: 'monthly',
      kind: 'salary',
      active: true,
      verified: true,
      note: 'SA!B3',
    },
    {
      id: 'inc-liz-support',
      personId: LIZ,
      label: 'Katy-Anne child support',
      amount: 6954,
      currency: 'ZAR',
      frequency: 'monthly',
      kind: 'support',
      active: true,
      verified: true,
      note: 'SA!B4',
    },
    {
      id: 'inc-will-doordash',
      personId: WILL,
      label: 'DoorDash',
      amount: 1240,
      currency: 'USD',
      frequency: 'monthly',
      kind: 'gig',
      active: true,
      verified: false,
      note: 'Monthly average — the day-by-day figures live in the Income ledger.',
    },
    {
      id: 'inc-will-lyft',
      personId: WILL,
      label: 'Lyft',
      amount: 980,
      currency: 'USD',
      frequency: 'monthly',
      kind: 'gig',
      active: true,
      verified: false,
      note: 'Monthly average — the day-by-day figures live in the Income ledger.',
    },
    {
      id: 'inc-will-plasma',
      personId: WILL,
      label: 'Plasma donation',
      amount: 320,
      currency: 'USD',
      frequency: 'monthly',
      kind: 'other',
      active: true,
      verified: false,
    },
  ];
}

/* -- expenses ------------------------------------------------------------- */

/** Liz's 22 personal lines. Individually estimated; collectively exact. */
const LIZ_LINES: Array<[string, Expense['category'], number]> = [
  ['Rent — Liz’s share', 'Housing', 4500],
  ['Car loan', 'Transport', 3900],
  ['FNB personal loan', 'Debt', 2500],
  ['Oom Fanus repayment', 'Debt', 1000],
  ['Work loan repayment', 'Debt', 5000],
  ['Car insurance', 'Insurance', 1150],
  ['Life & funeral cover', 'Insurance', 890],
  ['Medical aid', 'Insurance', 1700],
  ['Katy-Anne school fees', 'Family', 2800],
  ['Katy-Anne aftercare', 'Family', 950],
  ['School transport', 'Family', 700],
  ['Groceries', 'Living', 3200],
  ['Electricity & water', 'Utilities', 1250],
  ['Cellphone', 'Utilities', 649],
  ['Petrol', 'Transport', 1300],
  ['Truworths account', 'Living', 620],
  ['Foschini account', 'Living', 480],
  ['Woolworths account', 'Living', 540],
  ['Netflix & Showmax', 'Subscriptions', 348],
  ['Apple iCloud & iTunes', 'Subscriptions', 179],
  ['Gym', 'Living', 499],
  ['Bank charges', 'Utilities', 168.09],
];

/** Will's US lines. All estimated — the workbook summary named the rows but
 *  carried no amounts through. */
const WILL_LINES: Array<[string, Expense['category'], number, Expense['frequency'], string]> = [
  ['Rent', 'Housing', 1250, 'monthly', 'Checking'],
  ['Car loan', 'Transport', 420, 'monthly', 'Chase Auto'],
  ['Car insurance', 'Insurance', 165, 'monthly', 'Checking'],
  ['Health insurance', 'Insurance', 210, 'monthly', 'Checking'],
  ['Capital One card', 'Debt', 180, 'monthly', 'Capital One'],
  ['Discover card', 'Debt', 120, 'monthly', 'Discover'],
  ['Phone — T-Mobile', 'Utilities', 85, 'monthly', 'Checking'],
  ['Groceries', 'Living', 100, 'weekly', 'Checking'],
  ['Fuel', 'Transport', 65, 'weekly', 'Checking'],
  ['Netflix', 'Subscriptions', 15.49, 'monthly', 'Card'],
  ['Apple', 'Subscriptions', 9.99, 'monthly', 'Card'],
  ['Google One', 'Subscriptions', 2.99, 'monthly', 'Card'],
  ['Spotify', 'Subscriptions', 11.99, 'monthly', 'Card'],
];

function seedExpenses(): Expense[] {
  const expenses: Expense[] = [];

  LIZ_LINES.forEach(([label, category, amount], index) => {
    expenses.push({
      id: `exp-liz-${index + 1}`,
      label,
      category,
      amount,
      currency: 'ZAR',
      frequency: 'monthly',
      owner: LIZ,
      paidBy: LIZ,
      active: true,
      verified: false,
    });
  });

  WILL_LINES.forEach(([label, category, amount, frequency, account], index) => {
    expenses.push({
      id: `exp-will-${index + 1}`,
      label,
      category,
      amount,
      currency: 'USD',
      frequency,
      owner: WILL,
      paidBy: WILL,
      account,
      active: true,
      verified: false,
    });
  });

  /* The shared block — the South African household costs Will funds from the
     US. In the workbook these were the three cross-sheet links on "Will Debt
     and Expenses" rows 11-13 plus the weekly Daddy payment. */
  const shared: Expense[] = [
    {
      id: 'exp-shared-rent',
      label: 'SA house rent — Will’s portion',
      category: 'Housing',
      amount: 10000,
      currency: 'ZAR',
      frequency: 'monthly',
      owner: 'shared',
      paidBy: WILL,
      split: { [WILL]: 1, [LIZ]: 0 },
      active: true,
      verified: false,
      note: `Total SA rent is R${SA_TOTAL_RENT.toLocaleString('en-US')} (verified). This is the part left after Daddy’s contribution — set that on the Shared page.`,
    },
    {
      id: 'exp-shared-domestic',
      label: 'Domestic help — Maggie',
      category: 'Family',
      amount: 2400,
      currency: 'ZAR',
      frequency: 'monthly',
      owner: 'shared',
      paidBy: WILL,
      split: { [WILL]: 1, [LIZ]: 0 },
      active: true,
      verified: false,
      note: 'SA!B10',
    },
    {
      id: 'exp-shared-internet',
      label: 'SA internet',
      category: 'Utilities',
      amount: 899,
      currency: 'ZAR',
      frequency: 'monthly',
      owner: 'shared',
      paidBy: WILL,
      split: { [WILL]: 1, [LIZ]: 0 },
      active: true,
      verified: false,
      note: 'SA!B11',
    },
    {
      id: 'exp-shared-daddy',
      label: 'Daddy support',
      category: 'Family',
      amount: 1500,
      currency: 'ZAR',
      frequency: 'weekly',
      owner: 'shared',
      paidBy: WILL,
      split: { [WILL]: 1, [LIZ]: 0 },
      active: true,
      verified: true,
      note: 'R1,500 a week — "Will Debt and Expenses"!C12',
    },
    {
      id: 'exp-shared-topup',
      label: 'Top-up for Liz’s shortfall',
      category: 'Family',
      amount: LIZ_MONTHLY_SHORTFALL,
      currency: 'ZAR',
      frequency: 'monthly',
      owner: 'shared',
      paidBy: WILL,
      split: { [WILL]: 1, [LIZ]: 0 },
      active: true,
      verified: true,
      note: 'SA!C7 — what Liz is short each month once her own expenses are paid.',
    },
  ];

  return [...expenses, ...shared];
}

/* -- debts ---------------------------------------------------------------- */

function schedule(
  prefix: string,
  start: Date,
  count: number,
  amountFor: (index: number) => number,
  today: Date,
): DebtPayment[] {
  const payments: DebtPayment[] = [];
  for (let i = 0; i < count; i += 1) {
    const date = addMonths(start, i);
    payments.push({
      id: `${prefix}-${i + 1}`,
      date: iso(date),
      amount: amountFor(i),
      paid: date <= today,
    });
  }
  return payments;
}

function seedDebts(today: Date): Debt[] {
  /* Oom Fanus — five equal repayments against R13,070 borrowed. */
  const fanusStart = addMonths(today, -3);
  const fanus: Debt = {
    id: 'debt-fanus',
    label: 'Oom Fanus',
    personId: LIZ,
    lender: 'Oom Fanus',
    currency: 'ZAR',
    principal: 13070,
    payments: schedule('pay-fanus', fanusStart, 5, () => 2614, today),
    verified: true,
    note: 'Total borrowed is from the sheet; the five repayment dates are estimated.',
  };

  /* Work loan 1 — R37,500 borrowed, R15,000 still outstanding when loan 2
     consolidated it. */
  const job1Start = addMonths(today, -12);
  const job1: Debt = {
    id: 'debt-job-1',
    label: 'Work loan (first)',
    personId: LIZ,
    lender: 'Employer',
    currency: 'ZAR',
    principal: 37500,
    payments: schedule('pay-job1', job1Start, 9, () => 2500, today),
    verified: true,
    note: 'R15,000 was still outstanding when the second work loan absorbed it.',
  };

  /* Work loan 2 — R230,000 borrowed, R15,000 of which cleared loan 1, over 33
     monthly instalments. The workbook hardcoded that 15,000; here it is a live
     link to loan 1's remaining balance. */
  const job2Start = addMonths(today, -6);
  const job2: Debt = {
    id: 'debt-job-2',
    label: 'Work loan (current)',
    personId: LIZ,
    lender: 'Employer',
    currency: 'ZAR',
    principal: 230000,
    offsetFromDebtId: 'debt-job-1',
    payments: schedule(
      'pay-job2',
      job2Start,
      33,
      // Five bonus-month instalments of R15,000 among 28 of R5,000 clear the
      // R215,000 net balance exactly.
      (index) => ((index + 1) % 6 === 0 && index < 30 ? 15000 : 5000),
      today,
    ),
    verified: true,
  };

  /* UR shares payback — standalone ledger in the workbook, no links either
     way. */
  const urStart = addMonths(today, -13);
  const ur: Debt = {
    id: 'debt-ur-shares',
    label: 'UR shares payback',
    personId: LIZ,
    lender: 'UR',
    currency: 'ZAR',
    principal: 130208,
    payments: schedule('pay-ur', urStart, 14, (index) => (index % 4 === 3 ? 6000 : 3500), today),
    verified: true,
    note: 'Total outstanding is from the sheet; individual payment amounts are estimated.',
  };

  const carStart = addMonths(today, -20);
  const car: Debt = {
    id: 'debt-will-car',
    label: 'Car loan',
    personId: WILL,
    lender: 'Chase Auto',
    currency: 'USD',
    principal: 18500,
    payments: schedule('pay-car', carStart, 48, () => 420, today),
    verified: false,
  };

  const capOneStart = addMonths(today, -10);
  const capOne: Debt = {
    id: 'debt-will-capone',
    label: 'Capital One card',
    personId: WILL,
    lender: 'Capital One',
    currency: 'USD',
    principal: 3200,
    payments: schedule('pay-capone', capOneStart, 20, () => 180, today),
    verified: false,
  };

  const discoverStart = addMonths(today, -8);
  const discover: Debt = {
    id: 'debt-will-discover',
    label: 'Discover card',
    personId: WILL,
    lender: 'Discover',
    currency: 'USD',
    principal: 2150,
    payments: schedule('pay-discover', discoverStart, 18, () => 120, today),
    verified: false,
  };

  return [fanus, job1, job2, ur, car, capOne, discover];
}

/* -- gig ledger ----------------------------------------------------------- */

/** Eight weeks of daily DoorDash and Lyft earnings, standing in for the wide
 *  "Will Income" sheet where each day was its own column. Sample figures. */
function seedLedger(today: Date): LedgerEntry[] {
  const random = makeRandom(20260201);
  const entries: LedgerEntry[] = [];

  for (let dayOffset = 55; dayOffset >= 0; dayOffset -= 1) {
    const date = addDays(today, -dayOffset);
    const weekday = date.getDay();
    // Fridays and Saturdays run hot; Mondays and Tuesdays are thin.
    const weekendLift = weekday === 5 || weekday === 6 ? 1.45 : weekday <= 2 ? 0.75 : 1;

    if (random() > 0.12) {
      entries.push({
        id: `led-dd-${iso(date)}`,
        date: iso(date),
        personId: WILL,
        label: 'DoorDash',
        amount: Math.round((28 + random() * 46) * weekendLift * 100) / 100,
        currency: 'USD',
        type: 'income',
      });
    }
    if (random() > 0.34) {
      entries.push({
        id: `led-lyft-${iso(date)}`,
        date: iso(date),
        personId: WILL,
        label: 'Lyft',
        amount: Math.round((34 + random() * 58) * weekendLift * 100) / 100,
        currency: 'USD',
        type: 'income',
      });
    }
  }

  return entries;
}

/* -- assembly ------------------------------------------------------------- */

export const DATA_VERSION = 1;

export function createSeedData(now: Date = new Date()): BudgetData {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  return {
    version: DATA_VERSION,
    people: PEOPLE,
    income: seedIncome(),
    expenses: seedExpenses(),
    debts: seedDebts(today),
    ledger: seedLedger(today),
    checklist: {},
    settings: {
      usdZarRate: SEED_USD_ZAR,
      rateUpdatedAt: iso(today),
      displayCurrency: 'USD',
      theme: 'system',
      dataMode: 'sample',
      saTotalRent: SA_TOTAL_RENT,
      saRentFromDaddy: SA_TOTAL_RENT - 10000,
      saRentExpenseId: 'exp-shared-rent',
    },
  };
}

/** A cleared-out workbook: the people, the rate and nothing else. */
export function createEmptyData(now: Date = new Date()): BudgetData {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return {
    version: DATA_VERSION,
    people: PEOPLE,
    income: [],
    expenses: [],
    debts: [],
    ledger: [],
    checklist: {},
    settings: {
      usdZarRate: SEED_USD_ZAR,
      rateUpdatedAt: iso(today),
      displayCurrency: 'USD',
      theme: 'system',
      dataMode: 'live',
      saTotalRent: SA_TOTAL_RENT,
      saRentFromDaddy: 0,
      saRentExpenseId: 'exp-shared-rent',
    },
  };
}
