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

/** Money out starts empty. Bills get added in the app, not shipped with it. */
function seedExpenses(): Expense[] {
  return [];
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
  };

  /* Work loan 2 — R230,000 borrowed over 33 monthly payments. What is left is
     simply the R230,000 less whatever has been ticked off. Money that went to
     the older loan is recorded as a payment line, not deducted behind the
     scenes. */
  const job2Start = addMonths(today, -6);
  const job2: Debt = {
    id: 'debt-job-2',
    label: 'Work loan (current)',
    personId: LIZ,
    lender: 'Employer',
    currency: 'ZAR',
    principal: 230000,
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

  return [fanus, job1, job2, car, capOne, discover];
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
    savings: [],
    checklist: {},
    settings: {
      usdZarRate: SEED_USD_ZAR,
      rateUpdatedAt: iso(today),
      autoRate: true,
      rateSource: 'manual',
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
    savings: [],
    checklist: {},
    settings: {
      usdZarRate: SEED_USD_ZAR,
      rateUpdatedAt: iso(today),
      autoRate: true,
      rateSource: 'manual',
      displayCurrency: 'USD',
      theme: 'system',
      dataMode: 'live',
      saTotalRent: SA_TOTAL_RENT,
      saRentFromDaddy: 0,
      saRentExpenseId: 'exp-shared-rent',
    },
  };
}
