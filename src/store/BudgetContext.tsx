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
  CurrencyCode,
  Debt,
  Expense,
  IncomeSource,
  LedgerEntry,
  Saving,
  Settings,
} from '../types';
import type { Conversion } from '../lib/calc';
import { createEmptyData, createSeedData } from '../data/seed';
import { THEME_KEY, loadData, loadLocalPrefs, saveData, saveLocalPrefs } from '../lib/storage';
import { fetchUsdZarRate } from '../lib/rate';
import { useAuth } from './AuthContext';
import * as remote from '../lib/remote';
import { migrate } from '../lib/storage';

export function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export type RateStatus = 'idle' | 'checking' | 'ok' | 'failed';
export type SyncStatus = 'local' | 'loading' | 'ready' | 'saving' | 'error';

interface BudgetContextValue {
  data: BudgetData;
  conversion: Conversion;

  /** Where the data lives and whether the last save went through. */
  sync: SyncStatus;
  syncError: string | null;
  retrySync: () => void;

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

  refreshRate: () => Promise<boolean>;
  rateStatus: RateStatus;

  toggleChecklist: (key: string) => void;
  setChecklistBulk: (keys: string[], paid: boolean) => void;

  replaceAll: (next: BudgetData) => void;
  resetToSeed: () => void;
  clearAll: () => void;
}

const BudgetContext = createContext<BudgetContextValue | null>(null);

/** Settings that belong to the person, not the household. Liz can read in rand
 *  on a dark screen while Will reads in dollars on a light one. */
const LOCAL_SETTINGS: Array<keyof Settings> = ['theme', 'displayCurrency'];

export function BudgetProvider({ children }: { children: ReactNode }) {
  const { state: authState, householdId } = useAuth();
  const cloud = authState === 'signed-in' && Boolean(householdId);

  const [data, setData] = useState<BudgetData>(() => loadData());
  const [rateStatus, setRateStatus] = useState<RateStatus>('idle');
  const [sync, setSync] = useState<SyncStatus>(cloud ? 'loading' : 'local');
  const [syncError, setSyncError] = useState<string | null>(null);

  /* -- talking to the database ------------------------------------------- */

  const report = useCallback((error: unknown) => {
    const message =
      error instanceof Error ? error.message : 'Could not save. Check your connection.';
    setSyncError(message);
    setSync('error');
  }, []);

  /** Run a write against the database, if we are signed in. The local state has
   *  already changed, so the screen never waits on the network. */
  const push = useCallback(
    (run: (household: string) => Promise<unknown>) => {
      if (!cloud || !householdId) return;
      setSync('saving');
      run(householdId)
        .then(() => {
          setSyncError(null);
          setSync('ready');
        })
        .catch(report);
    },
    [cloud, householdId, report],
  );

  const pull = useCallback(async () => {
    if (!householdId) return;
    setSync('loading');
    try {
      const fetched = await remote.fetchBudget(householdId);
      const local = loadLocalPrefs();
      setData((current) => {
        const merged = migrate({
          ...fetched,
          settings: { ...current.settings, ...fetched.settings, ...local },
        });
        // A brand new household has nobody in it yet. Give it the two people
        // and the starting settings so the app is usable straight away.
        if (merged.people.length === 0) {
          const fresh = createEmptyData();
          void remote.replaceBudget(householdId, fresh).catch(report);
          return { ...fresh, settings: { ...fresh.settings, ...local } };
        }
        return merged;
      });
      setSyncError(null);
      setSync('ready');
    } catch (error) {
      report(error);
    }
  }, [householdId, report]);

  useEffect(() => {
    if (!cloud) {
      setSync('local');
      return;
    }
    void pull();
  }, [cloud, pull]);

  // Pick up the other person's changes without a refresh.
  useEffect(() => {
    if (!cloud || !householdId) return;
    let timer: number | undefined;
    const stop = remote.watchBudget(householdId, () => {
      // Changes arrive one row at a time; wait a beat so a burst becomes one
      // refresh rather than ten.
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void pull(), 400);
    });
    return () => {
      window.clearTimeout(timer);
      stop();
    };
  }, [cloud, householdId, pull]);

  /* -- saving locally ---------------------------------------------------- */

  const saveTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (cloud) {
      // Keep the personal preferences on this device only.
      saveLocalPrefs(data.settings);
      return;
    }
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => saveData(data), 200);
    return () => window.clearTimeout(saveTimer.current);
  }, [data, cloud]);

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

  const edit = useCallback((mutate: (draft: BudgetData) => BudgetData) => {
    setData((current) => {
      const next = mutate(current);
      return next.settings.dataMode === 'sample'
        ? { ...next, settings: { ...next.settings, dataMode: 'live' } }
        : next;
    });
  }, []);

  /* -- the rate ---------------------------------------------------------- */

  const applyRate = useCallback(async (): Promise<boolean> => {
    setRateStatus('checking');
    const looked = await fetchUsdZarRate();
    if (!looked) {
      setRateStatus('failed');
      return false;
    }
    setData((current) => {
      const settings: Settings = {
        ...current.settings,
        usdZarRate: looked.rate,
        rateUpdatedAt: looked.fetchedAt,
        rateSource: 'auto',
      };
      if (cloud && householdId) void remote.saveSettings(householdId, settings).catch(report);
      return { ...current, settings };
    });
    setRateStatus('ok');
    return true;
  }, [cloud, householdId, report]);

  const checkedRate = useRef(false);
  useEffect(() => {
    if (checkedRate.current || !data.settings.autoRate || sync === 'loading') return;
    checkedRate.current = true;
    const today = new Date().toISOString().slice(0, 10);
    if (data.settings.rateSource === 'auto' && data.settings.rateUpdatedAt === today) return;
    void applyRate();
  }, [data.settings.autoRate, data.settings.rateSource, data.settings.rateUpdatedAt, sync, applyRate]);

  /* -- the actions ------------------------------------------------------- */

  const value = useMemo<BudgetContextValue>(() => {
    const conversion: Conversion = {
      usdZarRate: data.settings.usdZarRate,
      target: data.settings.displayCurrency,
    };

    const debtOf = (id: string) => data.debts.find((debt) => debt.id === id);

    return {
      data,
      conversion,
      sync,
      syncError,
      retrySync: () => void pull(),

      updateSettings: (patch) =>
        setData((current) => {
          const settings = { ...current.settings, ...patch };
          const sharedChanged = Object.keys(patch).some(
            (key) => !LOCAL_SETTINGS.includes(key as keyof Settings),
          );
          if (sharedChanged) push((household) => remote.saveSettings(household, settings));
          return { ...current, settings };
        }),

      addIncome: (source) => {
        edit((d) => ({ ...d, income: [...d.income, source] }));
        push((h) => remote.upsert(h, 'income', remote.rowFor.income(source)));
      },
      updateIncome: (id, patch) => {
        const next = data.income.find((item) => item.id === id);
        edit((d) => ({
          ...d,
          income: d.income.map((item) => (item.id === id ? { ...item, ...patch } : item)),
        }));
        if (next) push((h) => remote.upsert(h, 'income', remote.rowFor.income({ ...next, ...patch })));
      },
      removeIncome: (id) => {
        edit((d) => ({ ...d, income: d.income.filter((i) => i.id !== id) }));
        push((h) => remote.remove(h, 'income', id));
      },

      addExpense: (expense) => {
        edit((d) => ({ ...d, expenses: [...d.expenses, expense] }));
        push((h) => remote.upsert(h, 'expenses', remote.rowFor.expense(expense)));
      },
      updateExpense: (id, patch) => {
        const next = data.expenses.find((item) => item.id === id);
        edit((d) => ({
          ...d,
          expenses: d.expenses.map((item) => (item.id === id ? { ...item, ...patch } : item)),
        }));
        if (next) {
          push((h) => remote.upsert(h, 'expenses', remote.rowFor.expense({ ...next, ...patch })));
        }
      },
      removeExpense: (id) => {
        edit((d) => ({ ...d, expenses: d.expenses.filter((i) => i.id !== id) }));
        push((h) => remote.remove(h, 'expenses', id));
      },

      addDebt: (debt) => {
        edit((d) => ({ ...d, debts: [...d.debts, debt] }));
        push(async (h) => {
          await remote.upsert(h, 'debts', remote.rowFor.debt(debt));
          for (const payment of debt.payments) {
            await remote.upsert(h, 'debt_payments', remote.rowFor.payment(debt.id, payment));
          }
        });
      },
      updateDebt: (id, patch) => {
        const before = debtOf(id);
        edit((d) => ({
          ...d,
          debts: d.debts.map((item) => (item.id === id ? { ...item, ...patch } : item)),
        }));
        if (!before) return;
        const after = { ...before, ...patch };
        push(async (h) => {
          await remote.upsert(h, 'debts', remote.rowFor.debt(after));
          if (!patch.payments) return;
          // Payment lines can be added, edited or removed in one go.
          const kept = new Set(after.payments.map((payment) => payment.id));
          for (const payment of before.payments) {
            if (!kept.has(payment.id)) await remote.remove(h, 'debt_payments', payment.id);
          }
          for (const payment of after.payments) {
            await remote.upsert(h, 'debt_payments', remote.rowFor.payment(id, payment));
          }
        });
      },
      removeDebt: (id) => {
        const before = debtOf(id);
        edit((d) => ({ ...d, debts: d.debts.filter((i) => i.id !== id) }));
        push(async (h) => {
          for (const payment of before?.payments ?? []) {
            await remote.remove(h, 'debt_payments', payment.id);
          }
          await remote.remove(h, 'debts', id);
        });
      },
      togglePayment: (debtId, paymentId) => {
        const debt = debtOf(debtId);
        const payment = debt?.payments.find((entry) => entry.id === paymentId);
        edit((d) => ({
          ...d,
          debts: d.debts.map((entry) =>
            entry.id === debtId
              ? {
                  ...entry,
                  payments: entry.payments.map((item) =>
                    item.id === paymentId ? { ...item, paid: !item.paid } : item,
                  ),
                }
              : entry,
          ),
        }));
        if (payment) {
          push((h) =>
            remote.upsert(
              h,
              'debt_payments',
              remote.rowFor.payment(debtId, { ...payment, paid: !payment.paid }),
            ),
          );
        }
      },

      addLedgerEntry: (entry) => {
        edit((d) => ({ ...d, ledger: [...d.ledger, entry] }));
        push((h) => remote.upsert(h, 'ledger', remote.rowFor.ledger(entry)));
      },
      removeLedgerEntry: (id) => {
        edit((d) => ({ ...d, ledger: d.ledger.filter((entry) => entry.id !== id) }));
        push((h) => remote.remove(h, 'ledger', id));
      },

      addSaving: (saving) => {
        edit((d) => ({ ...d, savings: [...d.savings, saving] }));
        push((h) => remote.upsert(h, 'savings', remote.rowFor.saving(saving)));
      },
      updateSaving: (id, patch) => {
        const next = data.savings.find((item) => item.id === id);
        edit((d) => ({
          ...d,
          savings: d.savings.map((item) => (item.id === id ? { ...item, ...patch } : item)),
        }));
        if (next) push((h) => remote.upsert(h, 'savings', remote.rowFor.saving({ ...next, ...patch })));
      },
      removeSaving: (id) => {
        edit((d) => ({ ...d, savings: d.savings.filter((item) => item.id !== id) }));
        push((h) => remote.remove(h, 'savings', id));
      },

      refreshRate: applyRate,
      rateStatus,

      toggleChecklist: (key) => {
        const next = !data.checklist[key];
        edit((d) => ({ ...d, checklist: { ...d.checklist, [key]: next } }));
        push((h) => remote.setChecklist(h, key, next));
      },
      setChecklistBulk: (keys, paid) => {
        edit((d) => {
          const checklist = { ...d.checklist };
          for (const key of keys) checklist[key] = paid;
          return { ...d, checklist };
        });
        push(async (h) => {
          for (const key of keys) await remote.setChecklist(h, key, paid);
        });
      },

      replaceAll: (next) => {
        setData(next);
        push((h) => remote.replaceBudget(h, next));
      },
      resetToSeed: () => {
        const fresh = createSeedData();
        const kept = { ...fresh, settings: { ...fresh.settings, ...loadLocalPrefs() } };
        setData(kept);
        push((h) => remote.replaceBudget(h, kept));
      },
      clearAll: () => {
        const empty = createEmptyData();
        const kept: BudgetData = {
          ...empty,
          settings: { ...empty.settings, ...loadLocalPrefs(), dataMode: 'live' },
        };
        setData(kept);
        push((h) => remote.replaceBudget(h, kept));
      },
    };
  }, [data, edit, push, pull, applyRate, rateStatus, sync, syncError]);

  return <BudgetContext.Provider value={value}>{children}</BudgetContext.Provider>;
}

export function useBudget(): BudgetContextValue {
  const context = useContext(BudgetContext);
  if (!context) throw new Error('useBudget must be used inside a BudgetProvider');
  return context;
}

export type { CurrencyCode };
