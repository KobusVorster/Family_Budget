import type { BudgetData } from '../types';
import { DATA_VERSION, createSeedData } from '../data/seed';
import { toMonthly } from './money';

const KEY = 'family-budget:data';
const PREFS_KEY = 'family-budget:prefs';
export const THEME_KEY = 'family-budget:theme';

/** Settings that belong to this device rather than the household — which
 *  currency to show totals in, and light or dark. Kept separate so signing in
 *  on a phone does not drag the other person's preferences along. */
export interface LocalPrefs {
  displayCurrency?: BudgetData['settings']['displayCurrency'];
  theme?: BudgetData['settings']['theme'];
}

export function loadLocalPrefs(): LocalPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? (JSON.parse(raw) as LocalPrefs) : {};
  } catch {
    return {};
  }
}

export function saveLocalPrefs(settings: BudgetData['settings']): void {
  try {
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ displayCurrency: settings.displayCurrency, theme: settings.theme }),
    );
  } catch {
    // Private browsing. The app still works, the preference just will not stick.
  }
}

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
  const expenses = input.expenses ?? [];

  /* The checklist used to be a yes/no per bill. It now holds how much has been
     paid, so an old `true` becomes the whole amount and an old `false` becomes
     nothing. Without this every previously ticked bill would come back unpaid. */
  const checklist: BudgetData['checklist'] = {};
  for (const [key, value] of Object.entries(input.checklist ?? {})) {
    if (typeof value === 'number') {
      if (value > 0) checklist[key] = value;
      continue;
    }
    if (value !== true) continue;
    const expense = expenses.find((item) => item.id === key.split(':')[0]);
    if (expense) checklist[key] = toMonthly(expense.amount, expense.frequency);
  }

  return {
    version: DATA_VERSION,
    people: input.people?.length ? input.people : fallback.people,
    income: input.income ?? [],
    expenses: input.expenses ?? [],
    debts: input.debts ?? [],
    ledger: input.ledger ?? [],
    savings: input.savings ?? [],
    checklist,
    settings: {
      ...fallback.settings,
      ...input.settings,
    },
  };
}

/** The whole budget as text — the one form of it that can always get out.
 *
 *  Downloads and the clipboard are both blocked when the app runs inside a
 *  sandboxed frame, but text in a box the reader can select never is. */
export function exportText(data: BudgetData): string {
  return JSON.stringify(data, null, 2);
}

export function exportName(): string {
  return `family-budget-${new Date().toISOString().slice(0, 10)}.json`;
}

/** Did the file actually reach them, or do we need to offer the text instead?
 *
 *  `unknown` covers the plain-link path, where success cannot be observed. */
export type SaveOutcome = 'saved' | 'declined' | 'unknown';

/* Set by the host when a page is allowed to hand the reader a file. Declared
   loosely because it is only present in some views. */
declare global {
  interface Window {
    claude?: {
      downloads?: { save: (r: { filename: string; data: string }) => Promise<unknown> };
    };
  }
}

/** What a failed host save means for us.
 *
 *  Presence is not permission: the host installs a `downloads` object for every
 *  capability it knows about, granted or not, and the ungranted ones simply
 *  reject. So the decision hangs on the rejection, never on whether the object
 *  exists — checking existence alone is what left the fallback unreachable.
 *
 *  `declined` is the one code that stops here. The reader was asked and said no;
 *  slipping a download past them afterwards would override a choice they had
 *  just made. Everything else — not granted, unavailable, a lifecycle error —
 *  just means this route is not usable, so try the ordinary one. */
export function afterFailedSave(error: unknown): 'declined' | 'try-link' {
  return (error as { code?: string } | null)?.code === 'declined' ? 'declined' : 'try-link';
}

/** Offer the budget as a file.
 *
 *  Tries the host's own save first — inside a sandboxed frame it is the only
 *  file route that works — then falls back to a plain link. See
 *  {@link afterFailedSave} for which failures fall through and which stop.
 *
 *  The fallback returns `'unknown'`, never `'saved'`: a blocked blob download
 *  fails silently, with no event and no exception, so claiming success there
 *  would be a lie — and this is the button standing between someone and losing
 *  their records. The caller shows the text route whenever it is not `'saved'`.
 */
export async function exportFile(data: BudgetData): Promise<SaveOutcome> {
  const filename = exportName();
  const text = exportText(data);

  const host = window.claude?.downloads;
  if (host) {
    try {
      await host.save({ filename, data: text });
      return 'saved';
    } catch (error) {
      if (afterFailedSave(error) === 'declined') return 'declined';
    }
  }

  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
  return 'unknown';
}

/** Read a budget back out of text, whether it came from a file or a paste. */
export function importText(text: string): BudgetData {
  let parsed: Partial<BudgetData> | null;
  try {
    // Copying out of a text box usually drags a newline along with it.
    parsed = JSON.parse(text.trim()) as Partial<BudgetData>;
  } catch {
    throw new Error(
      'That is not a saved budget. Copy the whole thing, from the first { to the last }.',
    );
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('That is not a file this app saved. Pick a .json file you saved with “Save a copy”.');
  }
  if (!Array.isArray(parsed.expenses) && !Array.isArray(parsed.income)) {
    throw new Error('That file has no money in or bills in it. Pick a different one.');
  }
  return migrate(parsed);
}

export async function importFile(file: File): Promise<BudgetData> {
  return importText(await file.text());
}
