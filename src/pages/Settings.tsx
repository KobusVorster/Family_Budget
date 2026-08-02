import { useMemo, useRef, useState } from 'react';
import { useBudget } from '../store/BudgetContext';
import { reviewQueue } from '../lib/calc';
import { SEED_USD_ZAR } from '../data/seed';
import { exportFile, importFile } from '../lib/storage';
import { formatMoney } from '../lib/money';
import {
  Badge,
  Banner,
  Button,
  Card,
  CardHeader,
  Field,
  NumberInput,
  PageHeader,
  SegmentedControl,
  StatTile,
} from '../components/ui';

export default function Settings() {
  const { data, updateSettings, replaceAll, resetToSeed, clearAll } = useBudget();
  const [rateDraft, setRateDraft] = useState(String(data.settings.usdZarRate));
  const [importError, setImportError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const reviews = useMemo(() => reviewQueue(data), [data]);
  const rateAge = Math.floor(
    (Date.now() - new Date(`${data.settings.rateUpdatedAt}T00:00:00`).getTime()) / 86_400_000,
  );

  const applyRate = () => {
    const rate = Number(rateDraft);
    if (!Number.isFinite(rate) || rate <= 0) return;
    updateSettings({
      usdZarRate: rate,
      rateUpdatedAt: new Date().toISOString().slice(0, 10),
    });
  };

  return (
    <div className="rise">
      <PageHeader
        title="Settings"
        subtitle="The exchange rate, how numbers are shown, and where your data lives."
      />

      {rateAge > 30 && (
        <Banner tone="warning" title={`The exchange rate is ${rateAge} days old`}>
          Every cross-currency figure in the app runs through it. Worth a refresh before you make
          decisions on these numbers.
        </Banner>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Exchange rate"
            subtitle="Entered by hand. The spreadsheet used a Google Sheets function that does nothing in Excel, so both its rate cells had been frozen at 16.4612 without saying so."
          />
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Rand per US dollar">
              {(id) => (
                <NumberInput
                  id={id}
                  min="0"
                  value={rateDraft}
                  onChange={(event) => setRateDraft(event.target.value)}
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
              disabled={Number(rateDraft) === data.settings.usdZarRate}
            >
              Update rate
            </Button>
          </div>

          <dl className="mt-5 grid gap-3 border-t border-hairline pt-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted">In use now</dt>
              <dd className="tnum mt-0.5 font-medium">
                $1 = R{data.settings.usdZarRate.toFixed(4)}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Set on</dt>
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

          {data.settings.usdZarRate === SEED_USD_ZAR && (
            <p className="mt-4 rounded-lg bg-sunken p-3 text-sm text-ink-2">
              This is still the rate the workbook was carrying. It has not been checked against a
              live market.
            </p>
          )}
        </Card>

        <Card>
          <CardHeader title="Display" subtitle="How figures are shown across the app." />
          <div className="flex flex-col gap-5">
            <div>
              <p className="mb-2 text-sm font-medium text-ink-2">Report totals in</p>
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
                Individual lines always also show the currency they were entered in.
              </p>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-ink-2">Theme</p>
              <SegmentedControl
                label="Theme"
                value={data.settings.theme}
                onChange={(value) => updateSettings({ theme: value })}
                options={[
                  { value: 'system', label: 'Match device' },
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
          title="Numbers still to check"
          subtitle="Lines the app filled in with a placeholder because the spreadsheet summary named them without giving an amount. Editing one clears it from this list."
          action={
            <Badge tone={reviews.length > 0 ? 'warning' : 'good'}>
              {reviews.length === 0 ? 'All checked' : `${reviews.length} to check`}
            </Badge>
          }
        />
        {reviews.length === 0 ? (
          <p className="text-sm text-ink-2">
            Every figure in the app has been entered or confirmed by hand.
          </p>
        ) : (
          <>
            <p className="mb-4 rounded-lg bg-sunken p-3 text-sm text-ink-2">
              Liz’s 22 personal lines are individually estimated but add up to exactly R34,323.09 —
              the total her sheet does pin down. Correcting them moves money between categories
              without changing the household bottom line.
            </p>
            <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {reviews.map((item) => (
                <li key={item.id} className="flex items-center gap-3 text-sm">
                  <span className="w-16 shrink-0 text-xs text-muted">{item.kind}</span>
                  <span className="min-w-0 flex-1 truncate text-ink">{item.label}</span>
                  <span className="shrink-0 text-xs text-muted">{item.detail}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <Card className="mt-4">
        <CardHeader
          title="Your data"
          subtitle="Everything is stored in this browser and nowhere else. Export a file to move it to another device or share it."
        />

        <div className="mb-5 grid gap-4 sm:grid-cols-4">
          <StatTile label="Income lines" value={String(data.income.length)} />
          <StatTile label="Expenses" value={String(data.expenses.length)} />
          <StatTile label="Debts" value={String(data.debts.length)} />
          <StatTile label="Ledger entries" value={String(data.ledger.length)} />
        </div>

        {importError && (
          <Banner tone="critical" title="That import did not work">
            {importError}
          </Banner>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => exportFile(data)}>
            Export a backup
          </Button>
          <Button onClick={() => fileInput.current?.click()}>Import a backup</Button>
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
                  error instanceof Error ? error.message : 'The file could not be read.',
                );
              } finally {
                event.target.value = '';
              }
            }}
          />
          <Button
            className="ml-auto"
            onClick={() => {
              if (
                window.confirm(
                  'Replace everything with the starter numbers from the spreadsheet? Your current data will be lost.',
                )
              ) {
                resetToSeed();
              }
            }}
          >
            Reset to starter numbers
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (
                window.confirm(
                  'Delete all income, expenses, debts and ledger entries? This cannot be undone.',
                )
              ) {
                clearAll();
              }
            }}
          >
            Start empty
          </Button>
        </div>

        <p className="mt-4 text-xs text-muted">
          Two people on two continents cannot both edit one browser’s storage. To stay in sync,
          whoever makes changes exports a backup and sends the file over; the other imports it.
        </p>
      </Card>

      <Card className="mt-4">
        <CardHeader
          title="What came across from the spreadsheet"
          subtitle="And what the app does differently."
        />
        <ul className="flex flex-col gap-3 text-sm text-ink-2">
          {[
            [
              'The income link that had broken',
              'Will’s bottom line pulled his DoorDash and Lyft totals from the daily sheet, but those cells had gone to #REF!. The daily log now feeds the totals directly.',
            ],
            [
              'The exchange rate',
              'Two separate cells each called GOOGLEFINANCE, which Excel does not have, so both silently fell back to 16.4612. There is now one rate, entered by hand, with the date it was set.',
            ],
            [
              'The consolidated work loan',
              'The second loan’s balance hardcoded 15,000 instead of pointing at the first loan’s remaining balance. It is a live link now, so paying down the first moves the second.',
            ],
            [
              'Liz’s shortfall',
              'Row 13 added a negative number where it meant to subtract one, which understated what Will needed to send. Covering the shortfall is counted as a cost here.',
            ],
            [
              'Weekly bills',
              'The sheet multiplied weekly amounts by 4. A month averages 4.33 weeks, so every weekly line was under-counted by about 8% — roughly a month of that spend a year.',
            ],
            [
              'The month-end grid',
              'Seven columns of TRUE and FALSE became the Monthly check page, which works for any month rather than just January to July.',
            ],
          ].map(([title, body]) => (
            <li key={title} className="border-b border-hairline pb-3 last:border-0 last:pb-0">
              <p className="font-medium text-ink">{title}</p>
              <p className="mt-0.5">{body}</p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
