import type { BudgetData } from '../types';
import { DATA_VERSION, createSeedData } from '../data/seed';

const KEY = 'family-budget:data';
export const THEME_KEY = 'family-budget:theme';

/** Load the saved budget, falling back to the seed on anything unreadable.
 *  A corrupted blob should never leave the user staring at a blank screen. */
export function loadData(): BudgetData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return createSeedData();
    const parsed = JSON.parse(raw) as Partial<BudgetData>;
    return migrate(parsed);
  } catch {
    return createSeedData();
  }
}

export function saveData(data: BudgetData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Private-browsing or a full quota. The session still works in memory;
    // export is the escape hatch.
  }
}

/** Fill in anything a newer version of the app expects but an older save
 *  lacked, so an upgrade never drops a user's numbers. */
export function migrate(input: Partial<BudgetData>): BudgetData {
  const fallback = createSeedData();

  return {
    version: DATA_VERSION,
    people: input.people?.length ? input.people : fallback.people,
    income: input.income ?? [],
    expenses: input.expenses ?? [],
    debts: input.debts ?? [],
    ledger: input.ledger ?? [],
    checklist: input.checklist ?? {},
    settings: {
      ...fallback.settings,
      ...input.settings,
    },
  };
}

export function exportFile(data: BudgetData): void {
  const stamp = new Date().toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `family-budget-${stamp}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export async function importFile(file: File): Promise<BudgetData> {
  const text = await file.text();
  const parsed = JSON.parse(text) as Partial<BudgetData>;
  if (!parsed || typeof parsed !== 'object') throw new Error('That file is not a budget export.');
  if (!Array.isArray(parsed.expenses) && !Array.isArray(parsed.income)) {
    throw new Error('That file has no income or expenses in it.');
  }
  return migrate(parsed);
}
