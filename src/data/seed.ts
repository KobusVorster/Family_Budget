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
   The numbers the app ships with.

   This app is the record now. These values are only a starting point, kept here
   so a fresh install and the "Start over" button have something to load.

   `verified: true`  — a real figure someone gave us.
   `verified: false` — a guess. The app marks these "guess" wherever they show
                       and lists them on the Settings page until someone types
                       the real amount in.

   Liz's 22 personal bills are each a guess, but together they add up to exactly
   34,323.09, which is a real total. So fixing them one at a time only moves
   money between groups — the bottom line stays right the whole way through.
--------------------------------------------------------------------------- */

/** Starting exchange rate. Not a live figure — the Settings page nags until
 *  someone sets a real one. */
export const SEED_USD_ZAR = 16.4612;

/** The full monthly rent on the South African house. */
export const SA_TOTAL_RENT = 14373;

/** What Liz is short each month, which Will covers. */
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

/** Liz's 22 personal bills. Each one a guess; the total is real. */
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

/** Will's US bills. Every amount is a guess. */
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

  /* The shared bills — South African household costs Will pays from the US. */
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
      note: 'Set the full rent and Daddy’s share on the Shared page.',
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
      note: 'R1,500 a week.',
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
      note: 'What Liz is short each month once her own bills are paid.',
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
    note: 'The five payment dates are a guess.',
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
    note: 'R15,000 was still owed when the current work loan paid it off.',
  };

  /* Work loan 2 — R230,000 borrowed, R15,000 of which paid off loan 1, over 33
     monthly payments. The offset tracks loan 1's balance rather than being a
     fixed number, so the two can never disagree. */
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

  /* UR shares payback — stands on its own, nothing else feeds into it. */
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
    note: 'The payment amounts are a guess.',
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

/* -- daily earnings ------------------------------------------------------- */

/** Will's actual DoorDash and Lyft earnings, one row per calendar day.
 *
 *  These amounts change every day, so there is no monthly figure to type in.
 *  The app averages this log instead — see `gigAverage` in `lib/calc.ts`. A
 *  blank means nothing was earned from that app that day.
 *
 *  [date, DoorDash, Lyft] */
const GIG_LOG: Array<[string, number | null, number | null]> = [
  ['2026-06-01', 8.25, null],
  ['2026-06-02', 141.6, null],
  ['2026-06-03', 183.2, null],
  ['2026-06-04', null, null],
  ['2026-06-05', 182.88, 23],
  ['2026-06-06', 67.85, 63],
  ['2026-06-07', 88.48, 159],
  ['2026-06-08', 109.41, 37],
  ['2026-06-09', 122.21, null],
  ['2026-06-10', 210.49, 24],
  ['2026-06-11', 21, 3],
  ['2026-06-12', 147.51, 7],
  ['2026-06-13', 7, 138],
  ['2026-06-14', 95.3, 6],
  ['2026-06-15', 80.85, 58],
  ['2026-06-16', 62.49, 21],
  ['2026-06-17', 112.03, 69],
  ['2026-06-18', 42.25, null],
  ['2026-06-19', 189.79, 30],
  ['2026-06-20', 67.91, 70],
  ['2026-06-21', 75.56, 42],
  ['2026-06-22', 53.86, 81],
  ['2026-06-23', 10, 35],
  ['2026-06-24', 65.53, 103],
  ['2026-06-25', 23.2, 63],
  ['2026-06-26', 77.45, 74],
  ['2026-06-27', 81.2, 147],
  ['2026-06-28', 54.1, 56],
  ['2026-06-29', 39.38, 9],
  ['2026-06-30', 66.61, 91],
  ['2026-07-01', 56.6, 81],
  ['2026-07-02', null, 97],
  ['2026-07-03', 27.25, 147],
  ['2026-07-04', 22.4, 200],
  ['2026-07-05', 66.14, 84],
  ['2026-07-06', null, 8],
  ['2026-07-07', 44.7, 59],
  ['2026-07-08', 41.4, 131],
  ['2026-07-09', 105.02, 48],
  ['2026-07-10', 67.71, 122],
  ['2026-07-11', 46.15, 226],
  ['2026-07-12', 111.25, 39],
  ['2026-07-13', null, 1],
  ['2026-07-14', null, 22],
  ['2026-07-15', 13.1, null],
  ['2026-07-16', 35.85, 18],
  ['2026-07-17', 63.15, 86],
  ['2026-07-18', 87.9, 83],
  ['2026-07-19', 11.45, 27],
  ['2026-07-20', 55.28, 54],
  ['2026-07-21', 107.18, 127],
  ['2026-07-22', 84.6, 119],
  ['2026-07-23', 45.45, 29],
  ['2026-07-24', 89.95, 134],
  ['2026-07-25', 150.55, 44],
  ['2026-07-26', 18.65, 58.6],
  ['2026-07-27', 9, 29.11],
  ['2026-07-28', 51.47, 27.24],
  ['2026-07-29', 110.45, 63.21],
  ['2026-07-30', 112, 43.37],
  ['2026-07-31', 103.78, 168.06],
  ['2026-08-01', 139.47, 78.39],
];

function seedLedger(): LedgerEntry[] {
  const entries: LedgerEntry[] = [];
  for (const [date, doordash, lyft] of GIG_LOG) {
    if (doordash !== null) {
      entries.push({
        id: `led-dd-${date}`,
        date,
        personId: WILL,
        label: 'DoorDash',
        amount: doordash,
        currency: 'USD',
        type: 'income',
      });
    }
    if (lyft !== null) {
      entries.push({
        id: `led-lyft-${date}`,
        date,
        personId: WILL,
        label: 'Lyft',
        amount: lyft,
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
    ledger: seedLedger(),
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

/** A blank budget: the people, the rate and nothing else. */
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
