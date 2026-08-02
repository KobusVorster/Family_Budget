import { useEffect, useMemo, useState, type ComponentType, type SVGProps } from 'react';
import { useBudget } from './store/BudgetContext';
import { reviewQueue } from './lib/calc';
import { SegmentedControl } from './components/ui';
import {
  IconChecklist,
  IconDebt,
  IconExpenses,
  IconIncome,
  IconMoon,
  IconOverview,
  IconSettings,
  IconShared,
  IconSun,
} from './components/icons';
import Dashboard from './pages/Dashboard';
import Income from './pages/Income';
import Expenses from './pages/Expenses';
import Shared from './pages/Shared';
import Debts from './pages/Debts';
import Checklist from './pages/Checklist';
import Settings from './pages/Settings';

interface Route {
  id: string;
  label: string;
  short: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  component: ComponentType;
}

const ROUTES: Route[] = [
  { id: 'overview', label: 'Overview', short: 'Home', icon: IconOverview, component: Dashboard },
  { id: 'income', label: 'Income', short: 'Income', icon: IconIncome, component: Income },
  { id: 'expenses', label: 'Expenses', short: 'Spend', icon: IconExpenses, component: Expenses },
  { id: 'shared', label: 'Shared', short: 'Shared', icon: IconShared, component: Shared },
  { id: 'debt', label: 'Debt', short: 'Debt', icon: IconDebt, component: Debts },
  { id: 'checklist', label: 'Monthly check', short: 'Check', icon: IconChecklist, component: Checklist },
  { id: 'settings', label: 'Settings', short: 'Setup', icon: IconSettings, component: Settings },
];

function useHashRoute(): [Route, (id: string) => void] {
  const [id, setId] = useState(() => window.location.hash.slice(1) || 'overview');

  useEffect(() => {
    const onHashChange = () => setId(window.location.hash.slice(1) || 'overview');
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = (next: string) => {
    window.location.hash = next;
  };

  return [ROUTES.find((route) => route.id === id) ?? ROUTES[0], navigate];
}

export default function App() {
  const { data, updateSettings } = useBudget();
  const [route, navigate] = useHashRoute();
  const Page = route.component;

  const outstandingReviews = useMemo(() => reviewQueue(data).length, [data]);

  // Scroll to the top on navigation — landing halfway down a new page is
  // disorienting on mobile especially.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [route.id]);

  const isDark =
    data.settings.theme === 'dark' ||
    (data.settings.theme === 'system' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);

  return (
    /* The shell sets its own ground and ink rather than inheriting them, so the
       app looks the same embedded in a host page as it does standing alone. */
    <div className="min-h-full bg-plane text-ink lg:flex">
      {/* Desktop rail */}
      <nav
        aria-label="Main"
        className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-hairline bg-surface px-3 py-5 lg:flex"
      >
        <div className="mb-6 px-3">
          <p className="text-sm font-semibold tracking-tight">Family Budget</p>
          <p className="mt-0.5 text-xs text-muted">
            {data.people.map((person) => person.name).join(' & ')}
          </p>
        </div>

        <ul className="flex flex-col gap-0.5">
          {ROUTES.map((item) => {
            const active = item.id === route.id;
            const Icon = item.icon;
            return (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                    active ? 'bg-sunken text-ink' : 'text-ink-2 hover:bg-sunken hover:text-ink'
                  }`}
                >
                  <Icon />
                  {item.label}
                  {item.id === 'settings' && outstandingReviews > 0 && (
                    <span className="tnum ml-auto rounded-full bg-warning px-1.5 py-0.5 text-[0.65rem] font-semibold text-black">
                      {outstandingReviews}
                    </span>
                  )}
                </a>
              </li>
            );
          })}
        </ul>

        <div className="mt-auto px-3 pt-6">
          <p className="text-xs text-muted">
            $1 = R{data.settings.usdZarRate.toFixed(4)}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            Rate set {new Date(`${data.settings.rateUpdatedAt}T00:00:00`).toLocaleDateString()}
          </p>
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar — the controls that scope every page live here, in one row,
            never inside a chart card. */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-hairline bg-surface/90 px-4 py-3 backdrop-blur-md sm:px-6">
          <p className="text-sm font-semibold lg:hidden">Family Budget</p>

          <div className="ml-auto flex items-center gap-2">
            <SegmentedControl
              label="Show totals in"
              value={data.settings.displayCurrency}
              onChange={(value) => updateSettings({ displayCurrency: value })}
              options={[
                { value: 'USD', label: '$ USD' },
                { value: 'ZAR', label: 'R ZAR' },
              ]}
            />
            <button
              type="button"
              onClick={() => updateSettings({ theme: isDark ? 'light' : 'dark' })}
              aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
              className="rounded-lg border border-hairline p-2 text-ink-2 transition hover:bg-sunken hover:text-ink"
            >
              {isDark ? <IconSun /> : <IconMoon />}
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-28 sm:px-6 lg:pb-12">
          <Page key={route.id} />
        </main>
      </div>

      {/* Mobile tab bar */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-hairline bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
      >
        {ROUTES.map((item) => {
          const active = item.id === route.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => navigate(item.id)}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[0.65rem] font-medium transition ${
                active ? 'text-ink' : 'text-muted'
              }`}
            >
              <Icon />
              {item.short}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
