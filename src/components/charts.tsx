import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { CurrencyCode } from '../types';
import { formatAxis, formatMoney, formatPercent } from '../lib/money';
import { seriesColor } from '../lib/palette';

/* ---------------------------------------------------------------------------
   Shared chart plumbing.

   Every chart in the app ships a table view. That is not optional polish: three
   slots of the categorical palette sit below 3:1 against the light surface, and
   the rule for those is that the value must be reachable without relying on the
   fill — visible labels or a table. Both are here.
--------------------------------------------------------------------------- */

function useMeasure<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width);
    });
    observer.observe(element);
    setWidth(element.clientWidth);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}

/** Round an axis maximum up to a clean number, so ticks read 0 / 1,000 / 2,000
 *  rather than 0 / 1,137 / 2,274. */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0];
  const rough = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? magnitude * 10;
  const ticks: number[] = [];
  for (let value = 0; value <= max + step * 0.001; value += step) ticks.push(value);
  return ticks;
}

export interface LegendItem {
  label: string;
  color: string;
}

export function Legend({ items }: { items: LegendItem[] }) {
  // A single series needs no legend — the title already names what is plotted.
  if (items.length < 2) return null;
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2 text-sm text-ink-2">
          <span
            aria-hidden
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: item.color }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

export function ChartFrame({
  title,
  subtitle,
  legend,
  table,
  children,
  action,
}: {
  title: string;
  subtitle?: ReactNode;
  legend?: LegendItem[];
  /** The WCAG-clean twin. Always present. */
  table: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}) {
  const [view, setView] = useState<'chart' | 'table'>('chart');

  return (
    <section className="card flex flex-col p-5 sm:p-6">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-ink-2">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {action}
          <button
            type="button"
            onClick={() => setView(view === 'chart' ? 'table' : 'chart')}
            aria-pressed={view === 'table'}
            className="rounded-lg border border-hairline px-2.5 py-1 text-xs font-medium text-ink-2 transition hover:bg-sunken"
          >
            {view === 'chart' ? 'Table' : 'Chart'}
          </button>
        </div>
      </header>

      {view === 'chart' ? (
        <>
          <div className="min-w-0 flex-1">{children}</div>
          {legend && legend.length > 1 && (
            <footer className="mt-4 border-t border-hairline pt-3">
              <Legend items={legend} />
            </footer>
          )}
        </>
      ) : (
        <div className="-mx-1 overflow-x-auto">{table}</div>
      )}
    </section>
  );
}

export function DataTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: Array<Array<ReactNode>>;
}) {
  return (
    <table className="w-full min-w-[20rem] text-sm">
      <thead>
        <tr className="border-b border-hairline text-left">
          {columns.map((column, index) => (
            <th
              key={column}
              scope="col"
              className={`px-2 py-2 font-medium text-ink-2 ${index === 0 ? '' : 'text-right'}`}
            >
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={rowIndex} className="border-b border-hairline last:border-0">
            {row.map((cell, cellIndex) => (
              <td
                key={cellIndex}
                className={`px-2 py-2 ${cellIndex === 0 ? 'text-ink' : 'tnum text-right text-ink-2'}`}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* -- ranked bars ---------------------------------------------------------- */

export interface RankedBar {
  label: string;
  value: number;
  /** Optional override; the default is one hue for the whole set, because a
   *  ramp keyed to bar length would double-encode what the length already
   *  shows. */
  color?: string;
  meta?: ReactNode;
}

/** Horizontal bars, sorted, each directly labelled with its value. Rendered in
 *  HTML rather than SVG so long category names wrap instead of colliding. */
export function RankedBars({
  items,
  currency,
  max,
}: {
  items: RankedBar[];
  currency: CurrencyCode;
  max?: number;
}) {
  const ceiling = max ?? Math.max(...items.map((item) => item.value), 1);

  return (
    <ul className="flex flex-col gap-3.5">
      {items.map((item) => (
        <li key={item.label}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <span className="truncate text-sm text-ink">{item.label}</span>
            <span className="tnum shrink-0 text-sm font-medium text-ink">
              {formatMoney(item.value, currency)}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-sunken">
            {/* 4px rounded data-end, square where it meets the baseline. */}
            <div
              className="h-2 transition-[width] duration-500"
              style={{
                width: `${Math.max(1.5, (item.value / ceiling) * 100)}%`,
                background: item.color ?? seriesColor(1),
                borderRadius: '0 4px 4px 0',
              }}
            />
          </div>
          {item.meta && <p className="mt-1 text-xs text-muted">{item.meta}</p>}
        </li>
      ))}
    </ul>
  );
}

/* -- share bar ------------------------------------------------------------ */

export interface ShareSlice {
  label: string;
  value: number;
  color: string;
}

/** One horizontal bar broken into parts. Segments are separated by a 2px gap in
 *  the surface colour rather than a stroke — a border would add ink that is not
 *  data. */
export function ShareBar({
  slices,
  currency,
}: {
  slices: ShareSlice[];
  currency: CurrencyCode;
}) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const visible = slices.filter((slice) => slice.value > 0);
  if (total <= 0) return <p className="text-sm text-muted">Nothing to split yet.</p>;

  // A bar with one segment is not a part-to-whole picture, it is a sentence.
  if (visible.length === 1) {
    return (
      <p className="text-sm text-ink-2">
        <strong className="font-semibold text-ink">{visible[0].label}</strong> — all of it,{' '}
        <span className="tnum font-medium text-ink">{formatMoney(visible[0].value, currency)}</span>
        .
      </p>
    );
  }

  return (
    <div>
      <div className="flex h-6 w-full gap-[2px] overflow-hidden rounded-md">
        {visible.map((slice) => (
          <div
            key={slice.label}
            title={`${slice.label}: ${formatMoney(slice.value, currency)}`}
            style={{ flexGrow: slice.value, background: slice.color }}
          />
        ))}
      </div>
      <ul className="mt-3 flex flex-col gap-1.5">
        {visible.map((slice) => (
          <li key={slice.label} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: slice.color }}
            />
            <span className="text-ink-2">{slice.label}</span>
            <span className="tnum ml-auto font-medium text-ink">
              {formatMoney(slice.value, currency)}
            </span>
            <span className="tnum w-10 text-right text-muted">
              {formatPercent(slice.value / total)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -- stacked columns ------------------------------------------------------ */

export interface ColumnPoint {
  label: string;
  segments: Array<{ key: string; value: number; color: string }>;
}

function topRoundedPath(x: number, y: number, w: number, h: number, r: number): string {
  const radius = Math.max(0, Math.min(r, h, w / 2));
  if (radius === 0) return `M${x},${y} h${w} v${h} h${-w} Z`;
  return [
    `M${x},${y + h}`,
    `L${x},${y + radius}`,
    `Q${x},${y} ${x + radius},${y}`,
    `L${x + w - radius},${y}`,
    `Q${x + w},${y} ${x + w},${y + radius}`,
    `L${x + w},${y + h}`,
    'Z',
  ].join(' ');
}

/** Columns over time.
 *
 *  `grouped` puts each source in its own bar side by side, which is what you
 *  want when the question is "how do these two compare". `stacked` puts them on
 *  top of each other, for when the question is "what did the whole period come
 *  to". Hover or keyboard-focus a column for the exact figures. */
export function StackedColumns({
  points,
  currency,
  height = 220,
  layout = 'grouped',
}: {
  points: ColumnPoint[];
  currency: CurrencyCode;
  height?: number;
  layout?: 'stacked' | 'grouped';
}) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  if (points.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">No entries in this period yet.</p>;
  }

  const pad = { top: 12, right: 8, bottom: 30, left: 46 };
  const w = Math.max(width, 280);
  const plotW = Math.max(10, w - pad.left - pad.right);
  const plotH = Math.max(10, height - pad.top - pad.bottom);

  const totals = points.map((point) =>
    point.segments.reduce((sum, segment) => sum + segment.value, 0),
  );
  // Side-by-side bars are measured against the tallest single bar; stacked ones
  // against the tallest stack.
  const tallest =
    layout === 'grouped'
      ? Math.max(...points.flatMap((point) => point.segments.map((segment) => segment.value)), 1)
      : Math.max(...totals, 1);
  const ticks = niceTicks(tallest);
  const scaleMax = ticks[ticks.length - 1] || 1;

  const band = plotW / points.length;
  const GAP = 2;
  const seriesCount = Math.max(1, points[0]?.segments.length ?? 1);
  // The group leaves the band's leftover as air rather than filling it.
  const groupW = Math.min(band * 0.74, 24 * seriesCount + GAP * (seriesCount - 1));
  const barW =
    layout === 'grouped'
      ? Math.max(2, (groupW - GAP * (seriesCount - 1)) / seriesCount)
      : Math.min(24, band * 0.62);

  // Thin the x labels out rather than letting them run into each other, and
  // count back from the newest column so the most recent period is always the
  // one that keeps its label.
  const labelStep = Math.max(1, Math.ceil(46 / band));

  return (
    <div ref={ref} className="relative">
      <svg
        width={w}
        height={height}
        role="img"
        aria-label={`Stacked columns, ${points.length} periods`}
        onMouseLeave={() => setActive(null)}
      >
        {/* Recessive hairline grid — solid, never dashed. */}
        {ticks.map((tick) => {
          const y = pad.top + plotH - (tick / scaleMax) * plotH;
          return (
            <g key={tick}>
              <line
                x1={pad.left}
                x2={pad.left + plotW}
                y1={y}
                y2={y}
                stroke="var(--color-grid)"
                strokeWidth={1}
              />
              <text
                x={pad.left - 8}
                y={y + 4}
                textAnchor="end"
                fontSize={11}
                fill="var(--color-muted)"
                className="tnum"
              >
                {formatAxis(tick)}
              </text>
            </g>
          );
        })}

        {points.map((point, index) => {
          const cx = pad.left + band * index + band / 2;
          const x = cx - (layout === 'grouped' ? groupW : barW) / 2;
          let cursorY = pad.top + plotH;
          const total = totals[index];

          return (
            <g key={point.label}>
              {/* Hit target spans the whole band, so nobody has to land on a
                  24px bar. */}
              <rect
                x={pad.left + band * index}
                y={pad.top}
                width={band}
                height={plotH}
                fill="transparent"
                tabIndex={0}
                role="button"
                aria-label={`${point.label}: ${formatMoney(total, currency)}`}
                onMouseEnter={() => setActive(index)}
                onFocus={() => setActive(index)}
                onBlur={() => setActive(null)}
              />
              {layout === 'grouped'
                ? point.segments.map((segment, segmentIndex) => {
                    const h = Math.max(segment.value > 0 ? 1 : 0, (segment.value / scaleMax) * plotH);
                    if (h <= 0) return null;
                    return (
                      <path
                        key={segment.key}
                        d={topRoundedPath(
                          x + segmentIndex * (barW + GAP),
                          pad.top + plotH - h,
                          barW,
                          h,
                          4,
                        )}
                        fill={segment.color}
                        opacity={active === null || active === index ? 1 : 0.45}
                        style={{ transition: 'opacity 150ms' }}
                      />
                    );
                  })
                : point.segments
                    .filter((segment) => segment.value > 0)
                    .map((segment, segmentIndex, list) => {
                      const rawH = (segment.value / scaleMax) * plotH;
                      const isTop = segmentIndex === list.length - 1;
                      // The 2px separator is subtracted from the segment, not
                      // drawn over it, so the stack still sums to the true
                      // height.
                      const h = Math.max(1, rawH - (isTop ? 0 : GAP));
                      const y = cursorY - rawH;
                      cursorY -= rawH;
                      return (
                        <path
                          key={segment.key}
                          d={topRoundedPath(x, y, barW, h, isTop ? 4 : 0)}
                          fill={segment.color}
                          opacity={active === null || active === index ? 1 : 0.45}
                          style={{ transition: 'opacity 150ms' }}
                        />
                      );
                    })}
              {(points.length - 1 - index) % labelStep === 0 && (
                <text
                  x={cx}
                  y={height - 10}
                  textAnchor="middle"
                  fontSize={11}
                  fill="var(--color-muted)"
                >
                  {point.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {active !== null && (
        <div
          role="status"
          className="card pointer-events-none absolute top-2 max-w-[14rem] p-3 text-sm shadow-lg"
          style={{
            left: Math.min(
              Math.max(pad.left + band * active + band / 2 - 70, 4),
              Math.max(w - 150, 4),
            ),
          }}
        >
          <p className="mb-1.5 font-medium text-ink">{points[active].label}</p>
          {points[active].segments.map((segment) => (
            <p key={segment.key} className="flex items-center gap-2 text-ink-2">
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: segment.color }}
              />
              {segment.key}
              <span className="tnum ml-auto font-medium text-ink">
                {formatMoney(segment.value, currency)}
              </span>
            </p>
          ))}
          <p className="mt-1.5 flex gap-2 border-t border-hairline pt-1.5 font-medium text-ink">
            Total
            <span className="tnum ml-auto">{formatMoney(totals[active], currency)}</span>
          </p>
        </div>
      )}
    </div>
  );
}

/* -- sparkline ------------------------------------------------------------ */

/** Twelve-point trend for a stat tile. Context, not a chart — no axes, no
 *  labels; the tile's value carries the number. */
export function Sparkline({
  values,
  color = seriesColor(1),
  width = 96,
  height = 28,
}: {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);

  const points = values.map((value, index) => ({
    x: index * step,
    y: height - 2 - ((value - min) / span) * (height - 4),
  }));
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const last = points[points.length - 1];

  return (
    <svg width={width} height={height} aria-hidden className="overflow-visible">
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* 2px surface ring keeps the end dot legible where it crosses the line. */}
      <circle cx={last.x} cy={last.y} r={4} fill={color} stroke="var(--color-surface)" strokeWidth={2} />
    </svg>
  );
}

/* -- print / forced-colors relief ----------------------------------------- */

/** Charts lose their fills under forced-colors. The table view is always one
 *  click away, but flag it the first time it matters. */
export function useForcedColors(): boolean {
  const [forced, setForced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(forced-colors: active)');
    const update = () => setForced(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return forced;
}
