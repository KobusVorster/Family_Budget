import type { ExpenseCategory } from '../types';

/** The validated categorical order. Slots are assigned to entities and never
 *  reshuffled — filtering a series out must not repaint the survivors, or a
 *  reader who learned "Liz is orange" is misled. */
export const SERIES_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export function seriesColor(slot: number): string {
  const index = ((slot - 1) % SERIES_SLOTS.length) + 1;
  return `var(--color-series-${index})`;
}

/** Categories get fixed slots too, so the same category is the same colour on
 *  every chart in the app. */
export const CATEGORY_SLOT: Record<ExpenseCategory, number> = {
  Housing: 1,
  Transport: 2,
  Debt: 3,
  Family: 4,
  Living: 5,
  Utilities: 6,
  Insurance: 7,
  Subscriptions: 8,
};

export const CATEGORIES = Object.keys(CATEGORY_SLOT) as ExpenseCategory[];

export function categoryColor(category: ExpenseCategory): string {
  return seriesColor(CATEGORY_SLOT[category]);
}

/** Status hues are reserved for state — never reused as a series colour.
 *  These are tuned for *marks*: meter fills, dots, borders, where 3:1 is the
 *  bar. */
export const STATUS = {
  good: 'var(--color-good)',
  warning: 'var(--color-warning)',
  serious: 'var(--color-serious)',
  critical: 'var(--color-critical)',
} as const;

export type StatusTone = keyof typeof STATUS;

/** Tones that may tint *text*.
 *
 *  Deliberately only two. Against the light surface `warning` measures 1.79:1
 *  and `serious` 2.57:1 — both fail even the 3:1 large-text bar, so neither can
 *  ever colour a value. Amber state is carried by the meter and the label
 *  instead. `good` and `critical` clear 4.5:1 in both modes via their
 *  text-specific steps. */
export const STATUS_TEXT = {
  good: 'var(--color-delta-up)',
  critical: 'var(--color-critical-text)',
} as const;

export type TextTone = keyof typeof STATUS_TEXT;

/** Debt payoff and budget-committed meters share one scale: comfortable until
 *  it isn't. */
export function loadTone(fraction: number): StatusTone {
  if (fraction >= 1) return 'critical';
  if (fraction >= 0.9) return 'serious';
  if (fraction >= 0.75) return 'warning';
  return 'good';
}
