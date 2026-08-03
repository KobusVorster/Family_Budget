import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  BudgetData,
  Debt,
  Expense,
  IncomeSource,
  LedgerEntry,
  Saving,
  Settings,
} from '../types';
import type { Conversion } from '../lib/calc';
import { createEmptyData, createSeedData } from '../data/seed';
import { THEME_KEY, loadData, saveData } from '../lib/storage';
import { fetchUsdZarRate } from '../lib/rate';

export function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

interface BudgetContextValue {
  data: BudgetData;
  /** The rate and reporting currency every view converts through. */
  conversion: Conversion;

  updateSettings: (patch: Partial<Settings>) => void;

  addIncome: (source: IncomeSource) => void;
  updateIncome: (id: string, patch: Partial<IncomeSource>) => void;
  removeIncome: (id: string) => void;

  addExpense: (expense: Expense) => void;
  updateExpense: (id: string, patch: Partial<Expense>) => void;
  removeExpense: (id: string) => void;

  addDebt: (debt: Debt) => void;
  updateDebt: (id: string, patch: Partial<Debt>) => void;
  removeDebt: (id: string) => void;
  togglePayment: (debtId: string, paymentId: string) => void;

  addLedgerEntry: (entry: LedgerEntry) => void;
  removeLedgerEntry: (id: string) => void;

  addSaving: (saving: Saving) => void;
  updateSaving: (id: string, patch: Partial<Saving>) => void;
  removeSaving: (id: string) => void;

  /** Look the rate up now. Returns false when the lookup could not run. */
  refreshRate: () => Promise<boolean>;
  rateStatus: RateStatus;

  toggleChecklist: (key: string) => void;
  setChecklistBulk: (keys: string[], paid: boolean) => void;

  replaceAll: (next: BudgetData) => void;
  resetToSeed: () => void;
  clearAll: () => void;
}

export type RateStatus = 'idle' | 'checking' | 'ok' | 'failed';

const BudgetContext = createContext<BudgetContextValue | null>(null);

export function BudgetProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<BudgetData>(() => loadData());
  const [rateStatus, setRateStatus] = useState<RateStatus>('idle');

  // Persist on every change, one frame behind the render so typing in a field
  // never blocks on serialising the whole budget.
  const saveTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => saveData(data), 200);
    return () => window.clearTimeout(saveTimer.current);
  }, [data]);

  const applyRate = useCallback(async (): Promise<boolean> => {
    setRateStatus('checking');
    const looked = await fetchUsdZarRate();
    if (!looked) {
      setRateStatus('failed');
      return false;
    }
    setData((current) => ({
      ...current,
      settings: {
        ...current.settings,
        usdZarRate: looked.rate,
        rateUpdatedAt: looked.fetchedAt,
        rateSource: 'auto',
      },
    }));
    setRateStatus('ok');
    return true;
  }, []);

  // Look the rate up on load, but only once a day — the rate barely moves
  // within a day and a failed lookup should not retry on every refresh.
  const checkedRate = useRef(false);
  useEffect(() => {
    if (checkedRate.current || !data.settings.autoRate) return;
    checkedRate.current = true;
    const today = new Date().toISOString().slice(0, 10);
    if (data.settings.rateSource === 'auto' && data.settings.rateUpdatedAt === today) return;
    void applyRate();
  }, [data.settings.autoRate, data.settings.rateSource, data.settings.rateUpdatedAt, applyRate]);

  // Reflect the theme choice onto the document so the CSS tokens swap.
  useEffect(() => {
    const { theme } = data.settings;
    if (theme === 'system') {
      delete document.documentElement.dataset.theme;
      localStorage.removeItem(THEME_KEY);
    } else {
      document.documentElement.dataset.theme = theme;
      localStorage.setItem(THEME_KEY, theme);
    }
  }, [data.settings.theme]);

  /** Any user edit means these are no longer the numbers we shipped with. */
  const edit = useCallback((mutate: (draft: BudgetData) => BudgetData) => {
    setData((current) => {
      const next = mutate(current);
      return next.settings.dataMode === 'sample'
        ? { ...next, settings: { ...next.settings, dataMode: 'live' } }
        : next;
    });
  }, []);

  const value = useMemo<BudgetContextValue>(() => {
    const conversion: Conversion = {
      usdZarRate: data.settings.usdZarRate,
      target: data.settings.displayCurrency,
    };

    return {
      data,
      conversion,

      // Settings are chrome, not budget content, so they do not retire the
      // sample banner on their own.
      updateSettings: (patch) =>
        setData((current) => ({ ...current, settings: { ...current.settings, ...patch } })),

      addIncome: (source) => edit((d) => ({ ...d, income: [...d.income, source] })),
      updateIncome: (id, patch) =>
        edit((d) => ({
          ...d,
          income: d.income.map((item) => (item.id === id ? { ...item, ...patch } : item)),
        })),
      removeIncome: (id) => edit((d) => ({ ...d, income: d.income.filter((i) => i.id !== id) })),

      addExpense: (expense) => edit((d) => ({ ...d, expenses: [...d.expenses, expense] })),
      updateExpense: (id, patch) =>
        edit((d) => ({
          ...d,
          expenses: d.expenses.map((item) => (item.id === id ? { ...item, ...patch } : item)),
        })),
      removeExpense: (id) =>
        edit((d) => ({ ...d, expenses: d.expenses.filter((i) => i.id !== id) })),

      addDebt: (debt) => edit((d) => ({ ...d, debts: [...d.debts, debt] })),
      updateDebt: (id, patch) =>
        edit((d) => ({
          ...d,
          debts: d.debts.map((item) => (item.id === id ? { ...item, ...patch } : item)),
        })),
      removeDebt: (id) => edit((d) => ({ ...d, debts: d.debts.filter((i) => i.id !== id) })),
      togglePayment: (debtId, paymentId) =>
        edit((d) => ({
          ...d,
          debts: d.debts.map((debt) =>
            debt.id === debtId
              ? {
                  ...debt,
                  payments: debt.payments.map((payment) =>
                    payment.id === paymentId ? { ...payment, paid: !payment.paid } : payment,
                  ),
                }
              : debt,
          ),
        })),

      addLedgerEntry: (entry) => edit((d) => ({ ...d, ledger: [...d.ledger, entry] })),
      removeLedgerEntry: (id) =>
        edit((d) => ({ ...d, ledger: d.ledger.filter((entry) => entry.id !== id) })),

      addSaving: (saving) => edit((d) => ({ ...d, savings: [...d.savings, saving] })),
      updateSaving: (id, patch) =>
        edit((d) => ({
          ...d,
          savings: d.savings.map((item) => (item.id === id ? { ...item, ...patch } : item)),
        })),
      removeSaving: (id) =>
        edit((d) => ({ ...d, savings: d.savings.filter((item) => item.id !== id) })),

      refreshRate: applyRate,
      rateStatus,

      toggleChecklist: (key) =>
        edit((d) => ({ ...d, checklist: { ...d.checklist, [key]: !d.checklist[key] } })),
      setChecklistBulk: (keys, paid) =>
        edit((d) => {
          const checklist = { ...d.checklist };
          for (const key of keys) checklist[key] = paid;
          return { ...d, checklist };
        }),

      replaceAll: (next) => setData(next),
      resetToSeed: () => setData(createSeedData()),
      clearAll: () =>
        setData((current) => ({
          ...createEmptyData(),
          settings: { ...createEmptyData().settings, ...current.settings, dataMode: 'live' },
        })),
    };
  }, [data, edit, applyRate, rateStatus]);

  return <BudgetContext.Provider value={value}>{children}</BudgetContext.Provider>;
}

export function useBudget(): BudgetContextValue {
  const context = useContext(BudgetContext);
  if (!context) throw new Error('useBudget must be used inside a BudgetProvider');
  return context;
}
