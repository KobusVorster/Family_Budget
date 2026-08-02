import { describe, expect, it } from 'vitest';
import {
  amountIn,
  categoryBreakdown,
  checklistProgress,
  monthlyBurden,
  monthlyIncome,
  monthlyValue,
  settleShared,
  summariseDebt,
  summariseHousehold,
  weeklyLedger,
  type Conversion,
} from './calc';
import { WEEKS_PER_MONTH, convert, formatMoney, toMonthly } from './money';
import { LIZ_MONTHLY_SHORTFALL, SEED_USD_ZAR, createSeedData } from '../data/seed';
import type { BudgetData, Debt, Expense } from '../types';

const RATE = SEED_USD_ZAR;
const inRand: Conversion = { usdZarRate: RATE, target: 'ZAR' };
const inDollars: Conversion = { usdZarRate: RATE, target: 'USD' };

function seed(): BudgetData {
  return createSeedData(new Date('2026-08-02T00:00:00Z'));
}

describe('frequency normalisation', () => {
  it('uses the real number of weeks in a month, not four', () => {
    // The workbook multiplied weekly amounts by 4, losing about 8% of every
    // weekly line.
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

describe('the figures the workbook actually pinned down', () => {
  const data = seed();

  it("keeps Liz's income at R31,954", () => {
    expect(monthlyIncome(data, 'liz', inRand)).toBeCloseTo(31954, 2);
  });

  it("keeps Liz's own expenses at R34,323.09", () => {
    const own = data.expenses
      .filter((expense) => expense.owner === 'liz')
      .reduce((total, expense) => total + monthlyValue(expense, inRand), 0);
    expect(own).toBeCloseTo(34323.09, 2);
  });

  it('reproduces the R2,369.09 shortfall from SA!C7', () => {
    const income = monthlyIncome(data, 'liz', inRand);
    const own = data.expenses
      .filter((expense) => expense.owner === 'liz')
      .reduce((total, expense) => total + monthlyValue(expense, inRand), 0);
    expect(income - own).toBeCloseTo(-LIZ_MONTHLY_SHORTFALL, 2);
  });

  it('converts the R1,500-a-week Daddy payment to a monthly figure', () => {
    const daddy = data.expenses.find((expense) => expense.id === 'exp-shared-daddy')!;
    expect(daddy.amount).toBe(1500);
    expect(daddy.frequency).toBe('weekly');
    expect(monthlyValue(daddy, inRand)).toBeCloseTo(6500, 2);
  });
});

describe('shared expenses and settlement', () => {
  it("counts a shared cost against whoever carries it, not whoever pays it", () => {
    const data = seed();
    // Split the SA rent evenly while leaving Will paying the whole thing.
    const rent = data.expenses.find((expense) => expense.id === 'exp-shared-rent')!;
    rent.split = { will: 0.5, liz: 0.5 };

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
    // The seed has Will carrying and paying all of the shared block.
    expect(settleShared(data, inRand).transfer).toBeNull();
  });

  it("adds a person's share of shared costs to their own burden", () => {
    const data = seed();
    const personalOnly = data.expenses
      .filter((expense) => expense.owner === 'will')
      .reduce((total, expense) => total + monthlyValue(expense, inDollars), 0);

    expect(monthlyBurden(data, 'will', inDollars)).toBeGreaterThan(personalOnly);
  });
});

describe('consolidated debts', () => {
  const base: Debt[] = [
    {
      id: 'old',
      label: 'First loan',
      personId: 'liz',
      lender: 'Employer',
      currency: 'ZAR',
      principal: 37500,
      payments: [
        { id: 'a', date: '2026-01-01', amount: 22500, paid: true },
        { id: 'b', date: '2026-02-01', amount: 5000, paid: false },
      ],
      verified: true,
    },
    {
      id: 'new',
      label: 'Second loan',
      personId: 'liz',
      lender: 'Employer',
      currency: 'ZAR',
      principal: 230000,
      offsetFromDebtId: 'old',
      payments: [],
      verified: true,
    },
  ];

  it("opens the new loan at principal minus the old loan's remaining balance", () => {
    const summary = summariseDebt(base[1], base);
    expect(summary.offset).toBe(15000);
    expect(summary.opening).toBe(215000);
    expect(summary.remaining).toBe(215000);
  });

  it('moves with the old loan instead of holding a stale number', () => {
    // This is the bug in the workbook: B34 hardcoded 15,000 rather than
    // pointing at B33, so paying the first loan down left the second wrong.
    const paidDown = base.map((debt) =>
      debt.id === 'old'
        ? { ...debt, payments: debt.payments.map((payment) => ({ ...payment, paid: true })) }
        : debt,
    );
    const summary = summariseDebt(paidDown[1], paidDown);
    expect(summary.offset).toBe(10000);
    expect(summary.opening).toBe(220000);
  });

  it('never reports a negative balance when overpaid', () => {
    const overpaid: Debt = {
      ...base[0],
      offsetFromDebtId: undefined,
      payments: [{ id: 'x', date: '2026-01-01', amount: 99999, paid: true }],
    };
    const summary = summariseDebt(overpaid, [overpaid]);
    expect(summary.remaining).toBe(0);
    expect(summary.progress).toBe(1);
  });

  it('reads the payoff date off the last unpaid instalment', () => {
    const scheduled: Debt = {
      ...base[0],
      offsetFromDebtId: undefined,
      payments: [
        { id: 'a', date: '2026-01-01', amount: 1000, paid: true },
        { id: 'b', date: '2026-02-01', amount: 1000, paid: false },
        { id: 'c', date: '2026-03-01', amount: 1000, paid: false },
      ],
    };
    const summary = summariseDebt(scheduled, [scheduled]);
    expect(summary.payoffDate).toBe('2026-03-01');
    expect(summary.monthsLeft).toBe(2);
    expect(summary.nextPayment).toEqual({ date: '2026-02-01', amount: 1000 });
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
    const before = summariseHousehold(data, inRand).expenses;
    data.expenses[0].active = false;
    const after = summariseHousehold(data, inRand).expenses;
    expect(after).toBeLessThan(before);
  });
});

describe('category breakdown', () => {
  it('sorts biggest first and shares sum to one', () => {
    const data = seed();
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

describe('the monthly checklist', () => {
  it('counts what is left to pay, not what has been', () => {
    const data = seed();
    const month = '2026-08';
    const before = checklistProgress(data, month, inRand);
    expect(before.paid).toBe(0);
    expect(before.outstanding).toBeCloseTo(summariseHousehold(data, inRand).expenses, 2);

    const first = data.expenses.find((expense) => expense.active)!;
    data.checklist[`${first.id}:${month}`] = true;

    const after = checklistProgress(data, month, inRand);
    expect(after.paid).toBe(1);
    expect(after.outstanding).toBeCloseTo(
      before.outstanding - monthlyValue(first, inRand),
      2,
    );
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
});
