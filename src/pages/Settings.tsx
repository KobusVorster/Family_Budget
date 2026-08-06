import { useMemo, useRef, useState } from 'react';
import { useBudget } from '../store/BudgetContext';
import { useAuth } from '../store/AuthContext';
import { reviewQueue } from '../lib/calc';
import { SEED_USD_ZAR } from '../data/seed';
import {
  exportFile,
  exportText,
  importFile,
  importText,
  type SaveOutcome,
} from '../lib/storage';
import { formatMoney } from '../lib/money';
import {
  Badge,
  Banner,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  Field,
  MoneyInput,
  PageHeader,
  SegmentedControl,
  StatTile,
  Switch,
  TextInput,
} from '../components/ui';

export default function Settings() {
  const { data, updateSettings, replaceAll, resetToSeed, clearAll, refreshRate, rateStatus } =
    useBudget();
  const [confirming, setConfirming] = useState<'reset' | 'clear' | null>(null);
  const auth = useAuth();
  const [copied, setCopied] = useState(false);
  const [codeToJoin, setCodeToJoin] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  const [rateDraft, setRateDraft] = useState(data.settings.usdZarRate);
  const [importError, setImportError] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [savedAs, setSavedAs] = useState<SaveOutcome | null>(null);
  const [pasting, setPasting] = useState(false);
  const [paste, setPaste] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const textArea = useRef<HTMLTextAreaElement>(null);

  const reviews = useMemo(() => reviewQueue(data), [data]);
  const rateAge = Math.floor(
    (Date.now() - new Date(`${data.settings.rateUpdatedAt}T00:00:00`).getTime()) / 86_400_000,
  );

  /** Show the budget as text and put the cursor in it, ready to copy. */
  const showText = () => {
    setText(exportText(data));
    // After the box exists. Selecting for them saves the fiddliest step.
    window.setTimeout(() => {
      textArea.current?.focus({ preventScroll: true });
      textArea.current?.select();
    }, 0);
  };

  const saveCopy = async () => {
    const outcome = await exportFile(data);
    setSavedAs(outcome);
    /* Anything short of a confirmed save and the text goes up on its own. A
       blocked download says nothing at all, so waiting to be asked would leave
       someone believing they had a backup they never got. */
    if (outcome !== 'saved') showText();
  };

  const join = async () => {
    setJoinError(null);
    setJoined(false);
    setJoining(true);
    const problem = await auth.joinWithCode(codeToJoin);
    setJoining(false);
    if (problem) {
      setJoinError(problem);
      return;
    }
    setCodeToJoin('');
    setJoined(true);
  };

  const applyRate = () => {
    const rate = rateDraft;
    if (!Number.isFinite(rate) || rate <= 0) return;
    updateSettings({
      usdZarRate: rate,
      rateUpdatedAt: new Date().toISOString().slice(0, 10),
      rateSource: 'manual',
    });
  };

  return (
    <div className="rise">
      <PageHeader
        title="Settings"
        subtitle="The exchange rate, how numbers look, and your data."
      />

      {rateAge > 30 && (
        <Banner tone="warning" title={`The exchange rate is ${rateAge} days old`}>
          Type today’s rate in the box below and press Update rate.
        </Banner>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Exchange rate"
            subtitle="The app looks this up for you. You can also type it in yourself."
          />

          <div className="mb-4 flex items-center justify-between gap-4 rounded-lg bg-sunken p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">Look it up automatically</p>
              <p className="mt-0.5 text-xs text-ink-2">
                {rateStatus === 'checking'
                  ? 'Checking…'
                  : rateStatus === 'failed'
                    ? 'Could not reach the internet. Type the rate in below.'
                    : data.settings.rateSource === 'auto'
                      ? 'Looked up once a day when you open the app.'
                      : 'On, but the rate below was typed in by hand.'}
              </p>
            </div>
            <Switch
              label="Look the exchange rate up automatically"
              checked={data.settings.autoRate}
              onChange={(next) => {
                updateSettings({ autoRate: next });
                if (next) void refreshRate();
              }}
            />
          </div>

          <div className="mb-3 flex flex-wrap items-end gap-3">
            <Field label="Rand for $1">
              {(id) => (
                <MoneyInput
                  id={id}
                  value={rateDraft}
                  onValueChange={setRateDraft}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') applyRate();
                  }}
                  className="w-40"
                />
              )}
            </Field>
            <Button
              variant="primary"
              onClick={applyRate}
              disabled={rateDraft === data.settings.usdZarRate}
            >
              Use this rate
            </Button>
            <Button onClick={() => void refreshRate()} disabled={rateStatus === 'checking'}>
              {rateStatus === 'checking' ? 'Checking…' : 'Check now'}
            </Button>
          </div>

          <dl className="mt-5 grid gap-3 border-t border-hairline pt-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted">Using now</dt>
              <dd className="tnum mt-0.5 font-medium">
                $1 = R{data.settings.usdZarRate.toFixed(4)}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Where it came from</dt>
              <dd className="mt-0.5 font-medium">
                {data.settings.rateSource === 'auto' ? 'Looked up' : 'Typed in'}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Last changed</dt>
              <dd className="mt-0.5 font-medium">
                {new Date(`${data.settings.rateUpdatedAt}T00:00:00`).toLocaleDateString()}
                <span className="ml-2 text-xs text-muted">
                  {rateAge === 0 ? 'today' : `${rateAge} day${rateAge === 1 ? '' : 's'} ago`}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-muted">R1,000 is</dt>
              <dd className="tnum mt-0.5 font-medium">
                {formatMoney(1000 / data.settings.usdZarRate, 'USD', { round: false })}
              </dd>
            </div>
            <div>
              <dt className="text-muted">$100 is</dt>
              <dd className="tnum mt-0.5 font-medium">
                {formatMoney(100 * data.settings.usdZarRate, 'ZAR')}
              </dd>
            </div>
          </dl>

          {rateStatus === 'failed' && (
            <p className="mt-4 rounded-lg bg-sunken p-3 text-sm text-ink-2">
              The app could not reach the internet to check the rate. This happens when the page is
              opened somewhere that blocks outside connections. Type today’s rate in the box above
              and press Use this rate.
            </p>
          )}
          {rateStatus !== 'failed' && data.settings.usdZarRate === SEED_USD_ZAR && (
            <p className="mt-4 rounded-lg bg-sunken p-3 text-sm text-ink-2">
              This rate has not been checked yet. Press Check now, or type today’s rate in.
            </p>
          )}
        </Card>

        <Card>
          <CardHeader title="Display" subtitle="How numbers look." />
          <div className="flex flex-col gap-5">
            <div>
              <p className="mb-2 text-sm font-medium text-ink-2">Show totals in</p>
              <SegmentedControl
                label="Reporting currency"
                value={data.settings.displayCurrency}
                onChange={(value) => updateSettings({ displayCurrency: value })}
                options={[
                  { value: 'USD', label: '$ US dollars' },
                  { value: 'ZAR', label: 'R South African rand' },
                ]}
              />
              <p className="mt-2 text-xs text-muted">
                Each bill also shows the currency it was typed in.
              </p>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-ink-2">Theme</p>
              <SegmentedControl
                label="Theme"
                value={data.settings.theme}
                onChange={(value) => updateSettings({ theme: value })}
                options={[
                  { value: 'system', label: 'Match my phone' },
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                ]}
              />
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-ink-2">People</p>
              <ul className="flex flex-col gap-2">
                {data.people.map((person) => (
                  <li key={person.id} className="flex items-center gap-3 text-sm">
                    <span className="font-medium text-ink">{person.fullName}</span>
                    <span className="text-muted">
                      {person.country} · paid in {person.currency}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Amounts to fix"
          subtitle="These amounts are guesses. Each one shows the page it is on."
          action={
            <Badge tone={reviews.length > 0 ? 'warning' : 'good'}>
              {reviews.length === 0 ? 'All done' : `${reviews.length} left`}
            </Badge>
          }
        />
        {reviews.length === 0 ? (
          <p className="text-sm text-ink-2">Nothing to fix. Every amount has been typed in.</p>
        ) : (
          <>
            <ol className="mb-5 flex flex-col gap-1.5 rounded-lg bg-sunken p-4 text-sm text-ink-2">
              <li>1. Open the page shown next to the item.</li>
              <li>2. Find it in the list and press Edit.</li>
              <li>3. Type the real amount and press Save.</li>
            </ol>
            <ul className="flex flex-col">
              {reviews.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-3 border-b border-hairline py-2.5 last:border-0"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{item.label}</span>
                  <span className="hidden shrink-0 text-xs text-muted sm:block">{item.who}</span>
                  <span className="tnum shrink-0 text-sm text-ink-2">
                    {formatMoney(item.amount, item.currency)}
                  </span>
                  <a
                    href={`#${item.page}`}
                    className="shrink-0 rounded-lg border border-hairline px-2.5 py-1 text-xs font-medium text-ink-2 transition hover:bg-sunken hover:text-ink"
                  >
                    {item.pageName}
                  </a>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <Card className="mt-4">
        <CardHeader
          title="Your login"
          subtitle={
            auth.state === 'signed-in'
              ? 'Signed in. Your budget is saved online and shared with Liz.'
              : 'Not signed in. Your budget is saved in this browser only.'
          }
        />
        {auth.state === 'signed-in' ? (
          <>
            <p className="text-sm">
              <span className="text-muted">Signed in as</span>{' '}
              <span className="font-medium break-all">{auth.email}</span>
            </p>

            {auth.householdId && (
              <div className="mt-5 border-t border-hairline pt-5">
                <h3 className="text-sm font-semibold">Let the other person in</h3>
                <p className="mt-1 text-sm text-ink-2">
                  Send this code to Liz. She types it in when she creates her login, and then you
                  both see the same numbers.
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-lg bg-sunken px-3 py-2 text-xs">
                    {auth.householdId}
                  </code>
                  <Button
                    onClick={() => {
                      void navigator.clipboard?.writeText(auth.householdId ?? '');
                      setCopied(true);
                      window.setTimeout(() => setCopied(false), 2000);
                    }}
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted">
                  Anyone with this code can see and change the budget, so only send it to Liz.
                </p>
              </div>
            )}

            <div className="mt-5 border-t border-hairline pt-5">
              <h3 className="text-sm font-semibold">Made your login before you had the code?</h3>
              <p className="mt-1 text-sm text-ink-2">
                Then you are looking at a budget of your own. Paste the code here to switch to the
                shared one.
              </p>
              {joinError && (
                <Banner tone="critical" title="That did not work">
                  {joinError}
                </Banner>
              )}
              {joined && (
                <Banner tone="good" title="Done">
                  You are in. The shared budget is loading.
                </Banner>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <TextInput
                  aria-label="Invite code"
                  autoComplete="off"
                  spellCheck={false}
                  value={codeToJoin}
                  placeholder="Paste the code"
                  className="min-w-0 flex-1"
                  onChange={(event) => setCodeToJoin(event.target.value)}
                />
                <Button
                  variant="primary"
                  disabled={!codeToJoin.trim() || joining}
                  onClick={() => void join()}
                >
                  {joining ? 'Working…' : 'Join'}
                </Button>
              </div>
            </div>

            <Button className="mt-5" onClick={() => void auth.signOut()}>
              Sign out
            </Button>
          </>
        ) : (
          <p className="text-sm text-ink-2">
            This copy is running without a login, so everything stays in this browser. Use{' '}
            <strong className="text-ink">Save a copy</strong> below to keep a backup.
          </p>
        )}
      </Card>

      <Card className="mt-4">
        <CardHeader
          title="Your data"
          subtitle={
            auth.state === 'signed-in'
              ? 'Saved online. Save a copy any time you want your own backup.'
              : 'Saved in this browser only. Nothing is sent anywhere.'
          }
        />

        <div className="mb-5 grid gap-4 sm:grid-cols-4">
          <StatTile label="Money in" value={String(data.income.length)} />
          <StatTile label="Bills" value={String(data.expenses.length)} />
          <StatTile label="Loans" value={String(data.debts.length)} />
          <StatTile label="Daily earnings" value={String(data.ledger.length)} />
        </div>

        {importError && (
          <Banner tone="critical" title="That file did not work">
            {importError}
          </Banner>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => void saveCopy()}>
            Save a copy
          </Button>
          <Button onClick={() => showText()}>Show as text</Button>
          <Button onClick={() => fileInput.current?.click()}>Open a saved copy</Button>
          <Button onClick={() => setPasting((open) => !open)}>Paste a saved copy</Button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              setImportError(null);
              try {
                replaceAll(await importFile(file));
              } catch (error) {
                setImportError(
                  error instanceof Error ? error.message : 'The file could not be read. Pick a file you saved from this app.',
                );
              } finally {
                event.target.value = '';
              }
            }}
          />
          <Button className="ml-auto" onClick={() => setConfirming('reset')}>
            Start over
          </Button>
          <Button variant="danger" onClick={() => setConfirming('clear')}>
            Delete everything
          </Button>
        </div>

        {/* The route that always works. Downloads and the clipboard are both
            blocked when this page runs inside a frame, but text you select
            yourself never is. */}
        {text !== null && (
          <div className="mt-4 rounded-lg bg-sunken p-3">
            <h3 className="text-sm font-semibold">Your whole budget, as text</h3>
            <ol className="mt-1 mb-3 list-inside list-decimal text-sm text-ink-2">
              <li>Press Ctrl+A then Ctrl+C (on a Mac, Cmd+A then Cmd+C).</li>
              <li>Open Notepad, press Ctrl+V.</li>
              <li>Save it as <strong className="text-ink">budget-backup.json</strong>.</li>
            </ol>
            <textarea
              ref={textArea}
              readOnly
              value={text}
              spellCheck={false}
              aria-label="Your budget as text"
              className="h-40 w-full rounded-lg border border-hairline bg-surface p-3 font-mono text-xs text-ink"
            />
            <p className="mt-2 text-xs text-muted">
              {savedAs === 'unknown'
                ? 'Nothing downloaded? Some browsers block it silently. Use this instead — it always works.'
                : 'This is the same thing Save a copy writes.'}
            </p>
          </div>
        )}

        {pasting && (
          <div className="mt-4 rounded-lg bg-sunken p-3">
            <h3 className="text-sm font-semibold">Paste a saved copy</h3>
            <p className="mt-1 mb-3 text-sm text-ink-2">
              Paste the text you copied out of the other copy. This replaces everything here.
            </p>
            <textarea
              value={paste}
              spellCheck={false}
              aria-label="Paste your saved budget"
              placeholder="Paste here, starting with {"
              onChange={(event) => setPaste(event.target.value)}
              className="h-32 w-full rounded-lg border border-hairline bg-surface p-3 font-mono text-xs text-ink placeholder:text-muted"
            />
            <Button
              variant="primary"
              className="mt-3"
              disabled={!paste.trim()}
              onClick={() => {
                setImportError(null);
                try {
                  replaceAll(importText(paste));
                  setPaste('');
                  setPasting(false);
                } catch (error) {
                  setImportError(
                    error instanceof Error ? error.message : 'That could not be read.',
                  );
                }
              }}
            >
              Load it
            </Button>
          </div>
        )}

        <p className="mt-4 text-xs text-muted">
          {auth.state === 'signed-in'
            ? 'You and Liz share the same budget. A change one of you makes shows up for the other within a few seconds.'
            : 'You and Liz cannot both edit the same copy. To share changes: press Save a copy, send the file to her, and she presses Open a saved copy.'}
        </p>
      </Card>

      <ConfirmDialog
        open={confirming === 'reset'}
        title="Start over?"
        confirmLabel="Yes, start over"
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          resetToSeed();
          setConfirming(null);
        }}
        body={
          <>
            This puts back the numbers the app came with and throws away everything you have typed
            — all {data.expenses.length} bills, {data.income.length} money-in lines,{' '}
            {data.debts.length} loans and {data.savings.length} savings.
            <br />
            <br />
            If you might want any of it back, press Cancel and use{' '}
            <strong className="text-ink">Save a copy</strong> first.
          </>
        }
      />

      <ConfirmDialog
        open={confirming === 'clear'}
        danger
        title="Delete everything?"
        confirmLabel="Yes, delete it all"
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          clearAll();
          setConfirming(null);
        }}
        body={
          <>
            This empties the whole budget — {data.expenses.length} bills, {data.income.length}{' '}
            money-in lines, {data.debts.length} loans, {data.savings.length} savings and{' '}
            {data.ledger.length} daily earnings. Only the two of you and the exchange rate stay.
            <br />
            <br />
            <strong className="text-ink">This cannot be undone.</strong> Press Cancel and use{' '}
            <strong className="text-ink">Save a copy</strong> if you want a backup first.
          </>
        }
      />
    </div>
  );
}
