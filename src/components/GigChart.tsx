import { useMemo, useState } from 'react';
import type { CurrencyCode, LedgerEntry } from '../types';
import {
  PERIOD_LABEL,
  PERIOD_SIZE,
  ledgerSeries,
  ledgerSources,
  type Conversion,
  type LedgerPeriod,
} from '../lib/calc';
import { formatMoney } from '../lib/money';
import { seriesColor } from '../lib/palette';
import { ChartFrame, DataTable, StackedColumns } from './charts';
import { SegmentedControl } from './ui';

const PERIODS: LedgerPeriod[] = ['day', 'week', 'month', 'year'];

/** How many buckets each view holds, and what the subtitle should say. */
const CAPTION: Record<LedgerPeriod, string> = {
  day: 'The last 30 days you logged.',
  week: 'The last 12 weeks, Monday to Sunday.',
  month: 'The last 12 months.',
  year: 'Every year you have logged.',
};

/** Gig earnings over time, one bar per source side by side.
 *
 *  Side by side rather than stacked because the question here is "how do
 *  DoorDash and Lyft compare", and a stack makes the upper series hard to read
 *  — its bottom edge moves with whatever is underneath it. */
export default function GigChart({
  entries,
  conversion,
  title = 'Gig money',
  height,
  action,
}: {
  entries: LedgerEntry[];
  conversion: Conversion;
  title?: string;
  height?: number;
  action?: React.ReactNode;
}) {
  const [period, setPeriod] = useState<LedgerPeriod>('week');
  const [layout, setLayout] = useState<'grouped' | 'stacked'>('grouped');

  const currency: CurrencyCode = conversion.target;
  const sources = useMemo(() => ledgerSources(entries), [entries]);
  const points = useMemo(
    () => ledgerSeries(entries, conversion, period, PERIOD_SIZE[period]),
    [entries, conversion, period],
  );

  const columns = useMemo(
    () =>
      points.map((point) => ({
        label: point.label,
        // Slots 1 and 2 belong to Will and Liz everywhere in the app, so gig
        // sources start at 4.
        segments: sources.map((source, index) => ({
          key: source,
          value: point.bySource[source] ?? 0,
          color: seriesColor(4 + index),
        })),
      })),
    [points, sources],
  );

  const totals = useMemo(() => {
    const perSource = new Map<string, number>();
    for (const point of points) {
      for (const source of sources) {
        perSource.set(source, (perSource.get(source) ?? 0) + (point.bySource[source] ?? 0));
      }
    }
    return perSource;
  }, [points, sources]);

  const grand = [...totals.values()].reduce((sum, value) => sum + value, 0);

  return (
    <ChartFrame
      title={`${title}, per ${PERIOD_LABEL[period].toLowerCase()}`}
      subtitle={
        <>
          {CAPTION[period]}{' '}
          {grand > 0 && (
            <>
              {formatMoney(grand, currency, { round: 'auto' })} in all —{' '}
              {sources
                .map(
                  (source) =>
                    `${source} ${formatMoney(totals.get(source) ?? 0, currency, { round: 'auto' })}`,
                )
                .join(', ')}
              .
            </>
          )}
        </>
      }
      action={action}
      legend={sources.map((source, index) => ({
        label: source,
        color: seriesColor(4 + index),
      }))}
      table={
        <DataTable
          columns={[PERIOD_LABEL[period], ...sources, 'Total']}
          rows={points.map((point) => [
            point.label,
            ...sources.map((source) =>
              formatMoney(point.bySource[source] ?? 0, currency, { round: 'auto' }),
            ),
            formatMoney(point.total, currency, { round: 'auto' }),
          ])}
        />
      }
    >
      {/* One control row above the chart, never inside it. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SegmentedControl
          label="Show earnings by"
          value={period}
          onChange={setPeriod}
          options={PERIODS.map((option) => ({ value: option, label: PERIOD_LABEL[option] }))}
        />
        {sources.length > 1 && (
          <SegmentedControl
            label="Bar layout"
            value={layout}
            onChange={setLayout}
            options={[
              { value: 'grouped', label: 'Side by side' },
              { value: 'stacked', label: 'Added up' },
            ]}
          />
        )}
      </div>

      {points.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">
          Nothing logged yet. Add a day below and it appears here.
        </p>
      ) : (
        <StackedColumns
          points={columns}
          currency={currency}
          layout={layout}
          height={height ?? 260}
        />
      )}
    </ChartFrame>
  );
}
