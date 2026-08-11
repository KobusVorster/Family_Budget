import { useEffect, useMemo, useState, type ComponentType, type SVGProps } from 'react';
import { useBudget } from './store/BudgetContext';
import { useAuth } from './store/AuthContext';
import { reviewQueue } from './lib/calc';
import { STALE_SESSION } from './lib/remote';
import { Banner, Button, SegmentedControl } from './components/ui';
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
import Login from './pages/Login';

interface Route {
  id: string;
  label: string;
  short: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  component: ComponentType;
}

const ROUTES: Route[] = [
  { id: 'overview', label: 'Overview', short: 'Home', icon: IconOverview, component: Dashboard },
  { id: 'income', label: 'Money in', short: 'In', icon: IconIncome, component: Income },
  { id: 'expenses', label: 'Money out', short: 'Out', icon: IconExpenses, component: Expenses },
  { id: 'shared', label: 'Shared', short: 'Shared', icon: IconShared, component: Shared },
  { id: 'debt', label: 'Debt', short: 'Debt', icon: IconDebt, component: Debts },
  { id: 'checklist', label: 'Checklist', short: 'List', icon: IconChecklist, component: Checklist },
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
  const auth = useAuth();

  if (auth.state === 'loading') {
    return (
      <div className="flex min-h-full items-center justify-center bg-plane text-sm text-ink-2">
        Loading…
      </div>
    );
  }
  if (auth.state === 'signed-out') return <Login />;
  /* Signed in, but the household could not be reached. There is no budget to
     show, so show nothing rather than a page of starter figures — those look
     exactly like a real budget, and typing into them saves to this device
     alone while the shared one sits untouched. */
  if (!auth.householdId) return <NoHousehold />;
  return <Budget />;
}

function NoHousehold() {
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  const stale = auth.householdError === STALE_SESSION;

  return (
    <div className="flex min-h-full items-center justify-center bg-plane px-4 py-12 text-ink">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Family Budget</h1>
          <p className="mt-1 text-sm text-ink-2">{auth.email}</p>
        </div>

        <div className="card rise p-6">
          <h2 className="text-base font-semibold">Could not load your budget</h2>
          <p className="mt-1 mb-4 text-sm text-ink-2">
            You are signed in, but this device could not reach your budget. Nothing is lost — it
            is still saved online.
          </p>

          {auth.householdError && (
            <Banner tone="critical" title="What went wrong">
              {auth.householdError}
            </Banner>
          )}

          {/* Folded away, because it is for whoever is fixing this rather than
              whoever is trying to use the app. */}
          {auth.householdDetail && (
            <details className="mb-4">
              <summary className="cursor-pointer text-sm text-ink-2 underline underline-offset-2">
                Details
              </summary>
              <p className="mt-2 rounded-lg bg-sunken p-3 font-mono text-xs break-all text-ink-2">
                {auth.householdDetail}
              </p>
            </details>
          )}

          {/* A refused sign-in is not fixed by trying again, so lead with the
              thing that does fix it. */}
          {stale ? (
            <>
              <Button variant="primary" className="mt-2 w-full" onClick={() => void auth.signOut()}>
                Sign out and sign in again
              </Button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void auth.retryHousehold().finally(() => setBusy(false));
                }}
                className="mt-4 w-full text-sm text-ink-2 underline underline-offset-2 hover:text-ink"
              >
                {busy ? 'Trying…' : 'Try again anyway'}
              </button>
            </>
          ) : (
            <>
              <Button
                variant="primary"
                className="mt-2 w-full"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void auth.retryHousehold().finally(() => setBusy(false));
                }}
              >
                {busy ? 'Trying…' : 'Try again'}
              </Button>
              <button
                type="button"
                onClick={() => void auth.signOut()}
                className="mt-4 w-full text-sm text-ink-2 underline underline-offset-2 hover:text-ink"
              >
                Sign out
              </button>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-muted">
          Do not type anything in until this is sorted — it would not reach the shared budget.
        </p>
      </div>
    </div>
  );
}

function Budget() {
  const { data, updateSettings, sync, syncError, retrySync } = useBudget();
  const auth = useAuth();
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
            {auth.email ?? data.people.map((person) => person.name).join(' & ')}
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
            Set {new Date(`${data.settings.rateUpdatedAt}T00:00:00`).toLocaleDateString()}
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
            {auth.state === 'signed-in' && (
              <button
                type="button"
                onClick={() => void auth.signOut()}
                className="rounded-lg border border-hairline px-2.5 py-2 text-sm font-medium text-ink-2 transition hover:bg-sunken hover:text-ink"
              >
                Sign out
              </button>
            )}
          </div>
        </header>

        {sync === 'error' && (
          <div
            role="status"
            className="flex flex-wrap items-center gap-3 border-b border-hairline px-4 py-2.5 text-sm sm:px-6"
            style={{ background: 'var(--color-sunken)' }}
          >
            <span className="text-ink">
              Your last change did not save. {syncError ?? ''}
            </span>
            <button
              type="button"
              onClick={retrySync}
              className="rounded-lg border border-hairline px-2.5 py-1 text-xs font-medium text-ink-2 transition hover:bg-surface hover:text-ink"
            >
              Try again
            </button>
          </div>
        )}

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
