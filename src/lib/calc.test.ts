import { describe, expect, it } from 'vitest';
import {
  amountIn,
  billStatus,
  categoryBreakdown,
  debtSplit,
  gigAverage,
  ledgerSeries,
  summariseSavings,
  whatToPayNext,
  checklistProgress,
  monthlyBurden,
  spendAverage,
  budgetedPerMonth,
  MIN_LOG_DAYS,
  monthlyIncome,
  monthlyValue,
  settleShared,
  summariseDebt,
  summariseHousehold,
  weeklyLedger,
  type Conversion,
} from './calc';
import { WEEKS_PER_MONTH, convert, formatMoney, toMonthly } from './money';
import { applyPlan, buildSchedule } from '../pages/Debts';
import { sumParts } from '../components/ui';
import { STALE_SESSION, cleanInviteCode, isRlsFailure } from './remote';
import { messageOf } from '../store/AuthContext';
import { afterFailedSave, exportName, exportText, importText } from './storage';
import { SEED_USD_ZAR, createSeedData } from '../data/seed';
import type { BudgetData, Debt, Expense, LedgerEntry } from '../types';

const RATE = SEED_USD_ZAR;
const inRand: Conversion = { usdZarRate: RATE, target: 'ZAR' };
const inDollars: Conversion = { usdZarRate: RATE, target: 'USD' };

function seed(): BudgetData {
  return createSeedData(new Date('2026-08-02T00:00:00Z'));
}

/** Money out ships empty on purpose, so anything about bills builds its own. */
function bill(over: Partial<Expense> & Pick<Expense, 'id' | 'label' | 'amount'>): Expense {
  return {
    category: 'Living',
    currency: 'ZAR',
    frequency: 'monthly',
    owner: 'liz',
    paidBy: 'liz',
    active: true,
    verified: true,
    ...over,
  } as Expense;
}

describe('frequency normalisation', () => {
  it('uses the real number of weeks in a month, not four', () => {
    // A flat x4 loses about 8% of every weekly bill.
    expect(toMonthly(100, 'weekly')).toBeCloseTo(433.33, 2);
    expect(toMonthly(100, 'weekly')).toBeGreaterThan(400);
    expect(WEEKS_PER_MONTH).toBeCloseTo(4.3333, 4);
  });

  it('handles the other cadences', () => {
    expect(toMonthly(100, 'monthly')).toBe(100);
    expect(toMonthly(100, 'biweekly')).toBeCloseTo(216.67, 2);
    expect(toMonthly(300, 'quarterly')).toBe(100);
    expect(toMonthly(1200, 'annual')).toBe(100);
  });
});

describe('currency conversion', () => {
  it('round-trips', () => {
    const there = convert(1000, 'ZAR', 'USD', RATE);
    expect(convert(there, 'USD', 'ZAR', RATE)).toBeCloseTo(1000, 6);
  });

  it('leaves an amount alone when the currency already matches', () => {
    expect(convert(500, 'USD', 'USD', RATE)).toBe(500);
  });

  it('refuses to divide by a nonsense rate rather than producing Infinity', () => {
    expect(convert(500, 'USD', 'ZAR', 0)).toBe(500);
    expect(convert(500, 'USD', 'ZAR', Number.NaN)).toBe(500);
  });
});

describe('the figures that are known to be real', () => {
  const data = seed();

  it("keeps Liz's income at R31,954", () => {
    expect(monthlyIncome(data, 'liz', inRand)).toBeCloseTo(31954, 2);
  });

  it('ships with no bills at all', () => {
    // Money out starts empty so nothing has to be deleted before real bills
    // can go in.
    expect(data.expenses).toHaveLength(0);
  });

  it('turns a weekly amount into a monthly one', () => {
    expect(
      monthlyValue(bill({ id: 'x', label: 'Daddy', amount: 1500, frequency: 'weekly' }), inRand),
    ).toBeCloseTo(6500, 2);
  });
});

describe("Will's daily gig earnings", () => {
  const data = seed();
  const gig = gigAverage(data, 'will', inDollars)!;

  it('covers every calendar day from 1 June to 1 August with no gaps', () => {
    expect(gig.from).toBe('2026-06-01');
    expect(gig.to).toBe('2026-08-01');
    expect(gig.days).toBe(62);
  });

  it('logs the right number of days per app', () => {
    const doordash = gig.bySource.find((source) => source.label === 'DoorDash')!;
    const lyft = gig.bySource.find((source) => source.label === 'Lyft')!;
    // 5 days with no DoorDash, 7 with no Lyft.
    expect(doordash.days).toBe(57);
    expect(lyft.days).toBe(55);
    expect(data.ledger).toHaveLength(57 + 55);
  });

  it('adds the logged amounts up exactly', () => {
    const doordash = gig.bySource.find((source) => source.label === 'DoorDash')!;
    const lyft = gig.bySource.find((source) => source.label === 'Lyft')!;
    expect(doordash.total).toBeCloseTo(4365.29, 2);
    expect(lyft.total).toBeCloseTo(3862.98, 2);
    expect(gig.total).toBeCloseTo(8228.27, 2);
  });

  it('averages over every day, not just the days that earned', () => {
    // $8,228.27 over 62 days. Dividing by the 62 logged days gives $132.71 a
    // day; dividing by only the days that earned something would overstate it.
    expect(gig.perDay).toBeCloseTo(132.71, 2);
    expect(gig.perMonth).toBeCloseTo(4039.48, 1);
  });

  it('feeds the monthly income total instead of a typed-in amount', () => {
    // No fixed DoorDash or Lyft line exists any more.
    const labels = data.income.map((source) => source.label);
    expect(labels).not.toContain('DoorDash');
    expect(labels).not.toContain('Lyft');

    const fixed = data.income
      .filter((source) => source.personId === 'will' && source.active)
      .reduce((total, source) => total + monthlyValue(source, inDollars), 0);
    expect(monthlyIncome(data, 'will', inDollars)).toBeCloseTo(fixed + gig.perMonth, 2);
  });

  it('leaves Liz alone — she has no daily log', () => {
    expect(gigAverage(data, 'liz', inDollars)).toBeNull();
    expect(monthlyIncome(data, 'liz', inRand)).toBeCloseTo(31954, 2);
  });

  it('picks up a newly logged day', () => {
    const more = seed();
    more.ledger.push({
      id: 'extra',
      date: '2026-08-02',
      personId: 'will',
      label: 'Lyft',
      amount: 100,
      currency: 'USD',
      type: 'income',
    });
    const after = gigAverage(more, 'will', inDollars)!;
    expect(after.days).toBe(63);
    expect(after.to).toBe('2026-08-02');
    expect(after.total).toBeCloseTo(8328.27, 2);
  });

  it('moves the average the way the new day actually goes', () => {
    // A day below the running average pulls it down, and a day above pushes it
    // up. Logging a slow day must not be able to raise the budget.
    const addDay = (amount: number) => {
      const next = seed();
      next.ledger.push({
        id: 'extra',
        date: '2026-08-02',
        personId: 'will',
        label: 'Lyft',
        amount,
        currency: 'USD',
        type: 'income',
      });
      return gigAverage(next, 'will', inDollars)!.perDay;
    };

    expect(addDay(100)).toBeLessThan(gig.perDay); // below the $132.71 average
    expect(addDay(200)).toBeGreaterThan(gig.perDay); // above it
  });
});

describe('shared expenses and settlement', () => {
  it("counts a shared cost against whoever carries it, not whoever pays it", () => {
    const data = seed();
    // A shared bill Will pays in full but the two of them split evenly.
    const rent = bill({
      id: 'rent',
      label: 'SA rent',
      amount: 10000,
      owner: 'shared',
      paidBy: 'will',
      split: { will: 0.5, liz: 0.5 },
    });
    data.expenses = [rent];

    const settlement = settleShared(data, inRand);
    const will = settlement.lines.find((line) => line.person.id === 'will')!;
    const liz = settlement.lines.find((line) => line.person.id === 'liz')!;

    expect(will.balance).toBeGreaterThan(0);
    expect(liz.balance).toBeLessThan(0);
    expect(settlement.transfer).not.toBeNull();
    expect(settlement.transfer!.from.id).toBe('liz');
    expect(settlement.transfer!.to.id).toBe('will');
    expect(settlement.transfer!.amount).toBeCloseTo(rent.amount / 2, 2);
  });

  it('reports nothing to settle when everyone pays exactly what they carry', () => {
    const data = seed();
    data.expenses = [
      bill({
        id: 'rent',
        label: 'SA rent',
        amount: 10000,
        owner: 'shared',
        paidBy: 'will',
        split: { will: 1, liz: 0 },
      }),
    ];
    expect(settleShared(data, inRand).transfer).toBeNull();
  });

  it("adds a person's share of shared costs to their own burden", () => {
    const data = seed();
    data.expenses = [
      bill({ id: 'own', label: 'Groceries', amount: 100, currency: 'USD', owner: 'will', paidBy: 'will' }),
      bill({
        id: 'shared',
        label: 'SA rent',
        amount: 200,
        currency: 'USD',
        owner: 'shared',
        paidBy: 'will',
        split: { will: 0.5, liz: 0.5 },
      }),
    ];
    // 100 of their own, plus half of the 200 shared.
    expect(monthlyBurden(data, 'will', inDollars)).toBeCloseTo(200, 2);
    expect(monthlyBurden(data, 'liz', inDollars)).toBeCloseTo(100, 2);
  });
});

describe('loans', () => {
  const loan: Debt = {
    id: 'loan',
    label: 'Work loan',
    personId: 'liz',
    lender: 'Employer',
    currency: 'ZAR',
    principal: 230000,
    payments: [
      { id: 'a', date: '2026-02-01', amount: 5000, paid: true },
      { id: 'b', date: '2026-03-01', amount: 5000, paid: false },
      { id: 'c', date: '2026-04-01', amount: 5000, paid: false },
    ],
    verified: true,
  };

  it('takes off only what has actually been paid', () => {
    // Nothing is deducted behind the scenes — money that went to another loan
    // is recorded as a payment line like any other.
    const summary = summariseDebt(loan);
    expect(summary.paid).toBe(5000);
    expect(summary.remaining).toBe(225000);
  });

  it('never reports a negative balance when overpaid', () => {
    const summary = summariseDebt({
      ...loan,
      payments: [{ id: 'x', date: '2026-01-01', amount: 999999, paid: true }],
    });
    expect(summary.remaining).toBe(0);
    expect(summary.progress).toBe(1);
  });

  it('reads the payoff date off the last payment still due', () => {
    const summary = summariseDebt(loan);
    expect(summary.payoffDate).toBe('2026-04-01');
    expect(summary.paymentsLeft).toBe(2);
    expect(summary.nextPayment).toEqual({ date: '2026-03-01', amount: 5000 });
  });

  it('sorts the next payment by date, not by list order', () => {
    const jumbled = summariseDebt({
      ...loan,
      payments: [
        { id: 'late', date: '2026-09-01', amount: 5000, paid: false },
        { id: 'early', date: '2026-03-01', amount: 5000, paid: false },
      ],
    });
    expect(jumbled.nextPayment?.date).toBe('2026-03-01');
    expect(jumbled.payoffDate).toBe('2026-09-01');
  });
});

describe('building a repayment schedule', () => {
  const base = {
    start: '2026-01-31',
    count: 3,
    amount: 5000,
    every: 'monthly' as const,
    customN: 2,
    customUnit: 'weeks' as const,
    today: new Date('2026-01-01T00:00:00'),
  };

  it('keeps the day of the month, clamping instead of skipping a short month', () => {
    // The 31st has no February. It must land on the 28th, not roll into March
    // and knock every later payment out by a month.
    const dates = buildSchedule(base).map((payment) => payment.date);
    expect(dates).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });

  it('steps whole days for daily, weekly and fortnightly', () => {
    expect(buildSchedule({ ...base, start: '2026-03-02', every: 'daily' }).map((p) => p.date))
      .toEqual(['2026-03-02', '2026-03-03', '2026-03-04']);
    expect(buildSchedule({ ...base, start: '2026-03-02', every: 'weekly' }).map((p) => p.date))
      .toEqual(['2026-03-02', '2026-03-09', '2026-03-16']);
    expect(buildSchedule({ ...base, start: '2026-03-02', every: 'biweekly' }).map((p) => p.date))
      .toEqual(['2026-03-02', '2026-03-16', '2026-03-30']);
  });

  it('makes exactly one payment for a one-off, whatever the count says', () => {
    const payments = buildSchedule({ ...base, every: 'once', count: 12 });
    expect(payments).toHaveLength(1);
    expect(payments[0].date).toBe('2026-01-31');
  });

  it('honours a custom interval in days, weeks or months', () => {
    expect(
      buildSchedule({ ...base, start: '2026-03-02', every: 'custom', customN: 10, customUnit: 'days' })
        .map((p) => p.date),
    ).toEqual(['2026-03-02', '2026-03-12', '2026-03-22']);
    expect(
      buildSchedule({ ...base, start: '2026-03-02', every: 'custom', customN: 2, customUnit: 'months' })
        .map((p) => p.date),
    ).toEqual(['2026-03-02', '2026-05-02', '2026-07-02']);
  });

  it('ticks off only the payments already in the past', () => {
    const payments = buildSchedule({
      ...base,
      start: '2026-01-31',
      every: 'monthly',
      count: 3,
      today: new Date('2026-02-15T00:00:00'),
    });
    expect(payments.map((payment) => payment.paid)).toEqual([true, false, false]);
  });

  it('builds nothing without an amount', () => {
    expect(buildSchedule({ ...base, amount: 0 })).toHaveLength(0);
  });

  it('refuses a silly number of payments rather than locking up', () => {
    expect(buildSchedule({ ...base, every: 'daily', count: 100000 })).toHaveLength(500);
  });
});

describe('changing a loan’s repayment plan', () => {
  const monthly = {
    start: '2026-03-02',
    count: 3,
    amount: 100,
    every: 'monthly' as const,
    customN: 2,
    customUnit: 'weeks' as const,
  };
  const today = new Date('2026-03-01T00:00:00');

  const loan = (): Debt => ({
    id: 'd1',
    label: 'Car loan',
    personId: 'will',
    lender: 'MI Motors',
    currency: 'USD',
    principal: 1000,
    payments: [],
    verified: true,
  });

  it('remembers the plan on the loan so Edit reopens with it', () => {
    const next = applyPlan(loan(), { ...monthly, every: 'weekly' }, today);
    expect(next.plan?.every).toBe('weekly');
  });

  it('replaces the old lines instead of adding to them', () => {
    const withMonthly = applyPlan(loan(), monthly, today);
    expect(withMonthly.payments.map((p) => p.date)).toEqual([
      '2026-03-02',
      '2026-04-02',
      '2026-05-02',
    ]);

    // Switching to weekly must not leave the monthly dates behind.
    const withWeekly = applyPlan(withMonthly, { ...monthly, every: 'weekly' }, today);
    expect(withWeekly.payments.map((p) => p.date)).toEqual([
      '2026-03-02',
      '2026-03-09',
      '2026-03-16',
    ]);
  });

  it('leaves payments added one at a time alone', () => {
    const start = loan();
    start.payments = [{ id: 'hand', date: '2026-02-01', amount: 250, paid: true }];
    const next = applyPlan(start, monthly, today);
    expect(next.payments[0]).toMatchObject({ id: 'hand', amount: 250 });
    expect(next.payments).toHaveLength(4);
  });

  it('keeps a tick already made on a date the new plan also lands on', () => {
    const withMonthly = applyPlan(loan(), monthly, today);
    withMonthly.payments[0].paid = true;
    // Weekly starts on the same day, so that first tick must survive.
    const withWeekly = applyPlan(withMonthly, { ...monthly, every: 'weekly' }, today);
    expect(withWeekly.payments.map((p) => p.paid)).toEqual([true, false, false]);
  });

  it('changes nothing when there is no amount to pay', () => {
    const start = loan();
    expect(applyPlan(start, { ...monthly, amount: 0 }, today)).toBe(start);
  });
});

describe('what to pay next', () => {
  const today = new Date('2026-08-15T00:00:00');

  function withBill(dueDay: number | undefined, id = 'bill'): BudgetData {
    const data = seed();
    data.debts = [];
    data.expenses = [
      {
        id,
        label: 'Rent',
        category: 'Housing',
        amount: 1000,
        currency: 'USD',
        frequency: 'monthly',
        owner: 'will',
        paidBy: 'will',
        dueDay,
        active: true,
        verified: true,
      },
    ];
    return data;
  }

  it('puts the soonest thing first', () => {
    const data = withBill(20);
    data.expenses.push({ ...data.expenses[0], id: 'earlier', label: 'Car', dueDay: 17 });
    const items = whatToPayNext(data, inDollars, today);
    expect(items.map((item) => item.label)).toEqual(['Car', 'Rent']);
  });

  it('marks something already past its day as late', () => {
    const items = whatToPayNext(withBill(10), inDollars, today);
    expect(items[0].daysAway).toBe(-5);
  });

  it('sorts a bill with no due day to the end of the month rather than dropping it', () => {
    const items = whatToPayNext(withBill(undefined), inDollars, today);
    expect(items).toHaveLength(1);
    expect(items[0].due).toBe('2026-08-31');
  });

  it('drops a bill once it is ticked off for the month', () => {
    const data = withBill(20);
    data.checklist['bill:2026-08'] = 1000; // paid in full
    expect(whatToPayNext(data, inDollars, today)).toHaveLength(0);
  });

  it('includes loan payments alongside bills', () => {
    const data = withBill(20);
    data.debts = [
      {
        id: 'loan',
        label: 'Car loan',
        personId: 'will',
        lender: 'Bank',
        currency: 'USD',
        principal: 5000,
        payments: [{ id: 'p', date: '2026-08-16', amount: 400, paid: false }],
        verified: true,
      },
    ];
    const items = whatToPayNext(data, inDollars, today);
    expect(items.map((item) => item.kind)).toEqual(['Loan', 'Bill']);
  });
});

describe('savings and debt split', () => {
  it('adds savings up per person and converts them', () => {
    const data = seed();
    data.savings = [
      { id: 's1', personId: 'will', label: 'Emergency', amount: 1000, currency: 'USD' },
      { id: 's2', personId: 'liz', label: 'Holiday', amount: 16461.2, currency: 'ZAR' },
    ];
    const summary = summariseSavings(data, inDollars);
    expect(summary.byPerson.find((entry) => entry.person.id === 'will')!.total).toBeCloseTo(1000, 2);
    expect(summary.byPerson.find((entry) => entry.person.id === 'liz')!.total).toBeCloseTo(1000, 2);
    expect(summary.total).toBeCloseTo(2000, 2);
  });

  it('keeps each side of the debt in the currency it is owed in', () => {
    const data = seed();
    const split = debtSplit(data, inDollars);
    const liz = split.byPerson.find((entry) => entry.person.id === 'liz')!;
    const will = split.byPerson.find((entry) => entry.person.id === 'will')!;
    expect(liz.currency).toBe('ZAR');
    expect(will.currency).toBe('USD');
    expect(split.total).toBeCloseTo(liz.total + will.total, 2);
  });
});

describe('one-off amounts', () => {
  it('adds nothing to a monthly total', () => {
    expect(toMonthly(500, 'once')).toBe(0);
  });

  it('leaves the recurring total alone when a one-off is added', () => {
    const data = seed();
    const before = monthlyIncome(data, 'will', inDollars);
    data.income.push({
      id: 'bonus',
      personId: 'will',
      label: 'Tax refund',
      amount: 900,
      currency: 'USD',
      frequency: 'once',
      kind: 'other',
      active: true,
      verified: true,
    });
    expect(monthlyIncome(data, 'will', inDollars)).toBeCloseTo(before, 2);
  });
});

describe('household roll-up', () => {
  it('reports the same total whichever currency it is asked for', () => {
    const data = seed();
    const dollars = summariseHousehold(data, inDollars);
    const rand = summariseHousehold(data, inRand);
    expect(amountIn(dollars.net, 'USD', inRand)).toBeCloseTo(rand.net, 2);
  });

  it('does not double-count shared expenses in the household total', () => {
    const data = seed();
    const household = summariseHousehold(data, inRand);
    const sumOfBurdens = household.people.reduce((total, person) => total + person.burden, 0);
    // Every shared line is fully carried by someone, so the two agree.
    expect(sumOfBurdens).toBeCloseTo(household.expenses, 2);
  });

  it('ignores paused lines', () => {
    const data = seed();
    data.expenses = [bill({ id: 'a', label: 'Gym', amount: 500 })];
    expect(summariseHousehold(data, inRand).expenses).toBeCloseTo(500, 2);
    data.expenses[0].active = false;
    expect(summariseHousehold(data, inRand).expenses).toBe(0);
  });
});

describe('category breakdown', () => {
  it('sorts biggest first and shares sum to one', () => {
    const data = seed();
    data.expenses = [
      bill({ id: 'a', label: 'Rent', amount: 5000, category: 'Housing' }),
      bill({ id: 'b', label: 'Car', amount: 3000, category: 'Transport' }),
      bill({ id: 'c', label: 'Food', amount: 1000, category: 'Living' }),
    ];
    const slices = categoryBreakdown(data.expenses, inRand);
    expect(slices.length).toBeGreaterThan(1);
    for (let i = 1; i < slices.length; i += 1) {
      expect(slices[i - 1].amount).toBeGreaterThanOrEqual(slices[i].amount);
    }
    expect(slices.reduce((total, slice) => total + slice.share, 0)).toBeCloseTo(1, 6);
  });

  it('returns nothing for an empty set rather than dividing by zero', () => {
    expect(categoryBreakdown([] as Expense[], inRand)).toEqual([]);
  });
});

describe('the daily ledger', () => {
  it('buckets entries into weeks starting on Monday', () => {
    const points = weeklyLedger(
      [
        // Wednesday and the Sunday that closes the same week.
        { id: '1', date: '2026-07-08', personId: 'will', label: 'Lyft', amount: 50, currency: 'USD', type: 'income' },
        { id: '2', date: '2026-07-12', personId: 'will', label: 'Lyft', amount: 30, currency: 'USD', type: 'income' },
        // The following Monday starts a new bucket.
        { id: '3', date: '2026-07-13', personId: 'will', label: 'Lyft', amount: 20, currency: 'USD', type: 'income' },
      ],
      inDollars,
    );
    expect(points).toHaveLength(2);
    expect(points[0].date).toBe('2026-07-06');
    expect(points[0].total).toBe(80);
    expect(points[1].date).toBe('2026-07-13');
    expect(points[1].total).toBe(20);
  });

  it('keeps sources apart so the stack can colour them', () => {
    const points = weeklyLedger(
      [
        { id: '1', date: '2026-07-08', personId: 'will', label: 'Lyft', amount: 50, currency: 'USD', type: 'income' },
        { id: '2', date: '2026-07-08', personId: 'will', label: 'DoorDash', amount: 25, currency: 'USD', type: 'income' },
      ],
      inDollars,
    );
    expect(points[0].bySource).toEqual({ Lyft: 50, DoorDash: 25 });
  });

  it('leaves expenses out of an income chart', () => {
    const points = weeklyLedger(
      [
        { id: '1', date: '2026-07-08', personId: 'will', label: 'Lyft', amount: 50, currency: 'USD', type: 'income' },
        { id: '2', date: '2026-07-08', personId: 'will', label: 'Gas', amount: 25, currency: 'USD', type: 'expense' },
      ],
      inDollars,
    );
    expect(points[0].total).toBe(50);
  });
});

describe('day, month and year views of the ledger', () => {
  // Two sources, spread over two days, two months and two years.
  const entries: LedgerEntry[] = [
    { id: '1', date: '2025-12-30', personId: 'will', label: 'Lyft', amount: 10, currency: 'USD', type: 'income' },
    { id: '2', date: '2026-01-05', personId: 'will', label: 'Lyft', amount: 20, currency: 'USD', type: 'income' },
    { id: '3', date: '2026-01-05', personId: 'will', label: 'DoorDash', amount: 5, currency: 'USD', type: 'income' },
    { id: '4', date: '2026-02-05', personId: 'will', label: 'Lyft', amount: 40, currency: 'USD', type: 'income' },
  ];

  it('gives one bar per day', () => {
    const points = ledgerSeries(entries, inDollars, 'day');
    expect(points.map((point) => point.date)).toEqual(['2025-12-30', '2026-01-05', '2026-02-05']);
    // Both sources on 5 Jan land in the same bar, kept apart by name.
    expect(points[1].bySource).toEqual({ Lyft: 20, DoorDash: 5 });
    expect(points[1].total).toBe(25);
  });

  it('gives one bar per month', () => {
    const points = ledgerSeries(entries, inDollars, 'month');
    expect(points.map((point) => point.date)).toEqual(['2025-12', '2026-01', '2026-02']);
    expect(points.map((point) => point.total)).toEqual([10, 25, 40]);
  });

  it('gives one bar per year', () => {
    const points = ledgerSeries(entries, inDollars, 'year');
    expect(points.map((point) => point.date)).toEqual(['2025', '2026']);
    expect(points.map((point) => point.total)).toEqual([10, 65]);
  });

  it('keeps only the most recent buckets when there are more than asked for', () => {
    const points = ledgerSeries(entries, inDollars, 'day', 2);
    expect(points.map((point) => point.date)).toEqual(['2026-01-05', '2026-02-05']);
  });

  it('converts to the currency being shown', () => {
    const points = ledgerSeries(entries, inRand, 'year');
    expect(points[0].total).toBeCloseTo(10 * RATE, 2);
  });
});

describe('saving and reopening the budget as text', () => {
  const budget = () => {
    const data = seed();
    data.checklist = { 'x:2026-08': 30 };
    return data;
  };

  it('comes back the same', () => {
    const before = budget();
    const after = importText(exportText(before));
    expect(after.expenses).toEqual(before.expenses);
    expect(after.debts).toEqual(before.debts);
    expect(after.checklist).toEqual(before.checklist);
  });

  it('forgives the whitespace copying out of a box drags along', () => {
    // Ctrl+A over a textarea usually picks up a trailing newline.
    const after = importText(`\n${exportText(budget())}\n  `);
    expect(after.expenses.length).toBe(budget().expenses.length);
  });

  it('says what is wrong in plain words when the text is not a budget', () => {
    expect(() => importText('hello')).toThrow(/first \{ to the last \}/);
    expect(() => importText('')).toThrow(/first \{ to the last \}/);
  });

  it('turns down valid JSON that is not a budget', () => {
    expect(() => importText('{"hello":"world"}')).toThrow(/no money in or bills/);
  });

  it('names the file with the date', () => {
    expect(exportName()).toMatch(/^family-budget-\d{4}-\d{2}-\d{2}\.json$/);
  });
});

describe('when the host will not save the file', () => {
  it('falls back to the ordinary download', () => {
    /* The host installs a downloads object for every capability it knows about,
       granted or not, so its presence proves nothing. These are the rejections
       that used to reach no fallback at all. */
    for (const code of ['not_granted', 'unavailable', 'capability_disabled', 'capability_removed']) {
      expect(afterFailedSave({ code })).toBe('try-link');
    }
  });

  it('falls back when the rejection says nothing useful', () => {
    for (const odd of [undefined, null, {}, new Error('boom'), 'nope']) {
      expect(afterFailedSave(odd)).toBe('try-link');
    }
  });

  it('stops when the reader said no', () => {
    // Downloading anyway would override a choice they had just made.
    expect(afterFailedSave({ code: 'declined' })).toBe('declined');
  });
});

describe('day-to-day spending', () => {
  const spend = (date: string, amount: number, personId = 'will'): LedgerEntry => ({
    id: `s-${date}-${personId}`,
    date,
    personId,
    label: 'Groceries',
    amount,
    currency: 'USD',
    type: 'expense',
  });

  const withSpending = (entries: LedgerEntry[]): BudgetData => {
    const data = seed();
    data.ledger = entries;
    return data;
  };

  it('averages over every day covered, not just the days with something on them', () => {
    // Two entries ten days apart is eleven days of spending, most of them zero.
    const average = spendAverage(
      withSpending([spend('2026-08-01', 100), spend('2026-08-11', 100)]),
      undefined,
      inDollars,
    );
    expect(average?.days).toBe(11);
    expect(average?.perDay).toBeCloseTo(200 / 11, 4);
  });

  it('is nothing at all when no spending has been logged', () => {
    expect(spendAverage(withSpending([]), undefined, inDollars)).toBeNull();
  });

  it('does not mistake earnings for spending', () => {
    const data = withSpending([]);
    data.ledger = [
      { id: 'i1', date: '2026-08-01', personId: 'will', label: 'Lyft', amount: 500, currency: 'USD', type: 'income' },
    ];
    expect(spendAverage(data, undefined, inDollars)).toBeNull();
    expect(gigAverage(data, undefined, inDollars)?.total).toBe(500);
  });

  it('counts towards what a person carries, on top of their bills', () => {
    const before = monthlyBurden(seed(), 'will', inDollars);
    const after = monthlyBurden(
      withSpending([spend('2026-08-01', 30), spend('2026-08-30', 30)]),
      'will',
      inDollars,
    );
    expect(after).toBeGreaterThan(before);
  });

  it('refuses to budget on a log too short to mean anything', () => {
    /* One $60 shop over a one-day span works out to $1,834 a month. That is a
       single number multiplied by thirty, not an estimate, and it would wreck
       the left-over figure on the day someone first tries the feature. */
    const oneDay = withSpending([spend('2026-08-01', 60)]);
    const average = spendAverage(oneDay, undefined, inDollars)!;

    expect(average.days).toBe(1);
    expect(average.perMonth).toBeGreaterThan(1800);
    expect(average.enough).toBe(false);
    // Shown, but kept out of the totals.
    expect(budgetedPerMonth(average)).toBe(0);
    expect(monthlyBurden(oneDay, 'will', inDollars)).toBeCloseTo(
      monthlyBurden(seed(), 'will', inDollars),
      6,
    );
  });

  it('starts counting once the log is long enough', () => {
    const short = withSpending([spend('2026-08-01', 60), spend('2026-08-13', 60)]);
    const long = withSpending([spend('2026-08-01', 60), spend('2026-08-14', 60)]);

    expect(spendAverage(short, undefined, inDollars)!.days).toBe(13);
    expect(spendAverage(short, undefined, inDollars)!.enough).toBe(false);

    expect(spendAverage(long, undefined, inDollars)!.days).toBe(MIN_LOG_DAYS);
    expect(spendAverage(long, undefined, inDollars)!.enough).toBe(true);
    expect(summariseHousehold(long, inDollars).spending).toBeGreaterThan(0);
    expect(summariseHousehold(short, inDollars).spending).toBe(0);
  });

  it('holds earnings to the same rule', () => {
    // The gig log only escaped this because it happens to span 62 days.
    expect(gigAverage(seed(), 'will', inDollars)!.enough).toBe(true);

    const oneDay = seed();
    oneDay.ledger = [
      { id: 'i1', date: '2026-08-01', personId: 'will', label: 'Lyft', amount: 400, currency: 'USD', type: 'income' },
    ];
    expect(gigAverage(oneDay, 'will', inDollars)!.enough).toBe(false);
    const fixed = oneDay.income
      .filter((source) => source.personId === 'will' && source.active)
      .reduce((total, source) => total + monthlyValue(source, inDollars), 0);
    expect(monthlyIncome(oneDay, 'will', inDollars)).toBeCloseTo(fixed, 6);
  });

  it('stays with whoever spent it rather than being shared out', () => {
    const data = withSpending([spend('2026-08-01', 60), spend('2026-08-30', 60)]);
    const willBefore = monthlyBurden(seed(), 'will', inDollars);
    const lizBefore = monthlyBurden(seed(), 'liz', inDollars);
    expect(monthlyBurden(data, 'will', inDollars)).toBeGreaterThan(willBefore);
    expect(monthlyBurden(data, 'liz', inDollars)).toBeCloseTo(lizBefore, 6);
  });

  it('keeps bills and spending apart in the household total', () => {
    const data = withSpending([spend('2026-08-01', 45), spend('2026-08-30', 45)]);
    const summary = summariseHousehold(data, inDollars);
    expect(summary.spending).toBeGreaterThan(0);
    expect(summary.expenses).toBeCloseTo(summary.bills + summary.spending, 6);
    // Kept apart precisely so that double counting against a bill is visible.
    expect(summary.bills).toBeCloseTo(summariseHousehold(seed(), inDollars).expenses, 6);
  });
});

describe('telling a refused sign-in apart from a real problem', () => {
  it('spots a row-level security refusal by code or by wording', () => {
    /* A device holding an expired token reaches Postgres as the anonymous
       role. `auth.uid()` is then null, the membership lookup finds nothing,
       and it looks exactly like a new person — so the app tries to create a
       household and the policy refuses it. That refusal is the tell. */
    expect(isRlsFailure({ code: '42501' })).toBe(true);
    expect(
      isRlsFailure({
        message: 'new row violates row-level security policy for table "households"',
      }),
    ).toBe(true);
  });

  it('does not mistake other failures for it', () => {
    expect(isRlsFailure({ code: '23503' })).toBe(false);
    expect(isRlsFailure({ message: 'could not connect' })).toBe(false);
    expect(isRlsFailure(null)).toBe(false);
    expect(isRlsFailure(undefined)).toBe(false);
  });

  it('says what actually fixes it', () => {
    // Trying again cannot help — the token has to be replaced.
    expect(STALE_SESSION).toMatch(/sign in again/i);
  });
});

describe('saying what went wrong', () => {
  it('reads the message off a Supabase error, which is a plain object', () => {
    /* `String(error)` on one of these gives "[object Object]", which is what
       someone was shown on the screen that said their budget would not load. */
    expect(messageOf({ message: 'permission denied for table households' })).toBe(
      'permission denied for table households',
    );
    expect(messageOf({ message: '', details: 'Key is not present in table.' })).toBe(
      'Key is not present in table.',
    );
    expect(messageOf({ code: '42501' })).toBe('The database said 42501.');
  });

  it('still handles real Errors and bare strings', () => {
    expect(messageOf(new Error('Failed to fetch'))).toBe('Failed to fetch');
    expect(messageOf('nope')).toBe('nope');
  });

  it('never comes back empty or as [object Object]', () => {
    for (const odd of [null, undefined, {}, 0, [], '   ']) {
      const message = messageOf(odd);
      expect(message).not.toBe('[object Object]');
      expect(message.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('the invite code', () => {
  const real = '3f2b1c8a-9d4e-4a7b-8c1f-2e5d6a7b8c9d';

  it('accepts a code copied straight out of Settings', () => {
    expect(cleanInviteCode(real)).toBe(real);
  });

  it('forgives the whitespace a copy and paste drags along', () => {
    expect(cleanInviteCode(`  ${real}\n`)).toBe(real);
  });

  it('forgives capitals, which some phones add', () => {
    expect(cleanInviteCode(real.toUpperCase())).toBe(real);
  });

  it('turns down anything that could not be a code', () => {
    // Caught here so a typo reads as English instead of a Postgres error.
    for (const bad of ['', '   ', 'not-a-code', real.slice(0, -1), `${real}x`, 'liz@example.com']) {
      expect(cleanInviteCode(bad)).toBeNull();
    }
  });
});

describe('adding several amounts into one', () => {
  it('adds the boxes up', () => {
    expect(sumParts([{ id: 'a', value: 23.33 }, { id: 'b', value: 11.5 }])).toBe(34.83);
  });

  it('does not drift on amounts binary cannot hold exactly', () => {
    // 0.1 + 0.2 is 0.30000000000000004 if you just add the floats.
    expect(sumParts([{ id: 'a', value: 0.1 }, { id: 'b', value: 0.2 }])).toBe(0.3);
  });

  it('adds up ten dashes without a rounding tail', () => {
    const parts = Array.from({ length: 10 }, (_, i) => ({ id: String(i), value: 7.07 }));
    expect(sumParts(parts)).toBe(70.7);
  });

  it('treats empty boxes as nothing', () => {
    expect(sumParts([{ id: 'a', value: 25 }, { id: 'b', value: 0 }])).toBe(25);
    expect(sumParts([])).toBe(0);
  });
});

describe('the monthly checklist', () => {
  it('counts what is left to pay, not what has been', () => {
    const data = seed();
    data.expenses = [
      bill({ id: 'a', label: 'Rent', amount: 5000 }),
      bill({ id: 'b', label: 'Car', amount: 3000 }),
    ];
    const month = '2026-08';
    const before = checklistProgress(data, month, inRand);
    expect(before.paid).toBe(0);
    expect(before.outstanding).toBeCloseTo(summariseHousehold(data, inRand).expenses, 2);

    const first = data.expenses.find((expense) => expense.active)!;
    data.checklist[`${first.id}:${month}`] = first.amount;

    const after = checklistProgress(data, month, inRand);
    expect(after.paid).toBe(1);
    expect(after.outstanding).toBeCloseTo(
      before.outstanding - monthlyValue(first, inRand),
      2,
    );
  });
});

describe('part payments', () => {
  function withBill(amount = 1000, currency: 'USD' | 'ZAR' = 'USD'): BudgetData {
    const data = seed();
    data.debts = [];
    data.expenses = [
      bill({ id: 'rent', label: 'Rent', amount, currency, owner: 'will', paidBy: 'will' }),
    ];
    return data;
  }
  const MONTH = '2026-08';

  it('starts unpaid with the whole amount owing', () => {
    const data = withBill();
    const status = billStatus(data, data.expenses[0], MONTH);
    expect(status).toMatchObject({ due: 1000, paid: 0, remaining: 1000, state: 'unpaid' });
  });

  it('tracks a part payment and what is left', () => {
    const data = withBill();
    data.checklist['rent:2026-08'] = 400;
    const status = billStatus(data, data.expenses[0], MONTH);
    expect(status.paid).toBe(400);
    expect(status.remaining).toBe(600);
    expect(status.progress).toBeCloseTo(0.4, 6);
    expect(status.state).toBe('part');
  });

  it('counts as settled once the whole amount is in', () => {
    const data = withBill();
    data.checklist['rent:2026-08'] = 1000;
    expect(billStatus(data, data.expenses[0], MONTH).state).toBe('paid');
    expect(billStatus(data, data.expenses[0], MONTH).remaining).toBe(0);
  });

  it('never shows a negative balance if you overpay', () => {
    const data = withBill();
    data.checklist['rent:2026-08'] = 1500;
    const status = billStatus(data, data.expenses[0], MONTH);
    expect(status.remaining).toBe(0);
    expect(status.state).toBe('paid');
  });

  it('splits a weekly bill into its monthly amount first', () => {
    const data = seed();
    data.expenses = [
      bill({ id: 'w', label: 'Daddy', amount: 1500, frequency: 'weekly', currency: 'ZAR' }),
    ];
    data.checklist['w:2026-08'] = 3000;
    const status = billStatus(data, data.expenses[0], MONTH);
    expect(status.due).toBeCloseTo(6500, 2);
    expect(status.remaining).toBeCloseTo(3500, 2);
  });

  it('keeps the part payment in the bill currency, whichever way totals are shown', () => {
    // 400 rand paid stays 400 rand. Only the reported total converts.
    const data = withBill(1000, 'ZAR');
    data.checklist['rent:2026-08'] = 400;
    expect(billStatus(data, data.expenses[0], MONTH).remaining).toBe(600);
    expect(checklistProgress(data, MONTH, inRand).outstanding).toBeCloseTo(600, 2);
    expect(checklistProgress(data, MONTH, inDollars).outstanding).toBeCloseTo(600 / RATE, 2);
  });

  it('counts fully paid and part paid separately', () => {
    const data = seed();
    data.expenses = [
      bill({ id: 'a', label: 'A', amount: 100, currency: 'USD' }),
      bill({ id: 'b', label: 'B', amount: 100, currency: 'USD' }),
      bill({ id: 'c', label: 'C', amount: 100, currency: 'USD' }),
    ];
    data.checklist['a:2026-08'] = 100;
    data.checklist['b:2026-08'] = 40;
    const progress = checklistProgress(data, MONTH, inDollars);
    expect(progress).toMatchObject({ paid: 1, part: 1, total: 3 });
    expect(progress.outstanding).toBeCloseTo(160, 2); // 0 + 60 + 100
    expect(progress.settled).toBeCloseTo(140, 2);
  });

  it('keeps a part-paid bill on the what-to-pay list, showing only what is left', () => {
    const data = withBill();
    data.expenses[0].dueDay = 20;
    data.checklist['rent:2026-08'] = 400;
    const items = whatToPayNext(data, inDollars, new Date('2026-08-15T00:00:00'));
    expect(items).toHaveLength(1);
    expect(items[0].amount).toBeCloseTo(600, 2);
    expect(items[0].partPaid).toBe(true);
  });

  it('drops it off the list once it is fully paid', () => {
    const data = withBill();
    data.expenses[0].dueDay = 20;
    data.checklist['rent:2026-08'] = 1000;
    expect(whatToPayNext(data, inDollars, new Date('2026-08-15T00:00:00'))).toHaveLength(0);
  });
});

describe('money formatting', () => {
  it('puts the sign before the symbol', () => {
    expect(formatMoney(-2136, 'USD')).toBe('-$2,136');
    expect(formatMoney(2136, 'ZAR')).toBe('R2,136');
  });

  it('compacts only when asked', () => {
    expect(formatMoney(79400, 'USD', { compact: true })).toBe('$79.4K');
    expect(formatMoney(79400, 'USD')).toBe('$79,400');
    expect(formatMoney(4_200_000, 'USD', { compact: true })).toBe('$4.2M');
  });

  it('can show cents for small amounts', () => {
    expect(formatMoney(15.49, 'USD', { round: false })).toBe('$15.49');
  });

  it("keeps the cents someone typed rather than rounding them away", () => {
    // A figure entered as 23.33 must read back as 23.33. Showing "$23" looks
    // like the app lost the change.
    expect(formatMoney(23.33, 'USD', { round: 'auto' })).toBe('$23.33');
    expect(formatMoney(1234.5, 'ZAR', { round: 'auto' })).toBe('R1,234.50');
  });

  it('leaves whole amounts clean', () => {
    expect(formatMoney(5000, 'ZAR', { round: 'auto' })).toBe('R5,000');
    expect(formatMoney(-23.33, 'USD', { round: 'auto' })).toBe('-$23.33');
  });

  it('still rounds hard when asked, for big roll-ups', () => {
    expect(formatMoney(6301.47, 'USD')).toBe('$6,301');
  });
});
