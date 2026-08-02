import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { STATUS, STATUS_TEXT, type StatusTone, type TextTone } from '../lib/palette';

/* -- surfaces ------------------------------------------------------------- */

export function Card({
  children,
  className = '',
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section className={`card ${padded ? 'p-5 sm:p-6' : ''} ${className}`}>{children}</section>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  /** Set when the surrounding Card is unpadded — the header then supplies its
   *  own padding so it lines up with the list beneath it. */
  inset = false,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  inset?: boolean;
}) {
  return (
    <header
      className={`flex items-start justify-between gap-4 ${
        inset ? 'px-5 pt-5 pb-4 sm:px-6 sm:pt-6' : 'mb-5'
      }`}
    >
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-ink-2">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-sm text-ink-2">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

/* -- figures -------------------------------------------------------------- */

/** The single number a view leads with. Proportional figures, not tabular —
 *  equal-width digits look loose at display sizes. */
export function HeroFigure({
  label,
  value,
  tone,
  caption,
}: {
  label: string;
  value: string;
  tone?: TextTone;
  caption?: ReactNode;
}) {
  return (
    <div>
      <p className="text-sm font-medium text-ink-2">{label}</p>
      <p
        className="mt-1 text-[clamp(2.75rem,7vw,4rem)] leading-[1.05] font-semibold tracking-tight"
        style={tone ? { color: STATUS_TEXT[tone] } : undefined}
      >
        {value}
      </p>
      {caption && <div className="mt-2 text-sm text-ink-2">{caption}</div>}
    </div>
  );
}

export function StatTile({
  label,
  value,
  detail,
  tone,
  accent,
  children,
}: {
  label: string;
  value: string;
  detail?: ReactNode;
  tone?: TextTone;
  /** A colour key beside the label — identity comes from the mark, never from
   *  colouring the text itself. */
  accent?: string;
  children?: ReactNode;
}) {
  return (
    <div className="card flex flex-col gap-1 p-4 sm:p-5">
      <div className="flex items-center gap-2">
        {accent && (
          <span
            aria-hidden
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: accent }}
          />
        )}
        <p className="text-sm font-medium text-ink-2">{label}</p>
      </div>
      <p
        className="text-2xl font-semibold tracking-tight sm:text-[1.75rem]"
        style={tone ? { color: STATUS_TEXT[tone] } : undefined}
      >
        {value}
      </p>
      {detail && <div className="text-sm text-ink-2">{detail}</div>}
      {children}
    </div>
  );
}

/** A single ratio against a limit. */
export function Meter({
  value,
  tone = 'good',
  label,
  height = 8,
}: {
  value: number;
  tone?: StatusTone;
  label?: string;
  height?: number;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div
      role="meter"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className="w-full overflow-hidden rounded-full bg-sunken"
      style={{ height }}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${pct}%`, background: STATUS[tone] }}
      />
    </div>
  );
}

export function Badge({
  children,
  tone,
}: {
  children: ReactNode;
  tone?: StatusTone | 'neutral';
}) {
  const color = tone && tone !== 'neutral' ? STATUS[tone] : undefined;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-2.5 py-0.5 text-xs font-medium text-ink-2"
      style={color ? { borderColor: color } : undefined}
    >
      {color && (
        <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      )}
      {children}
    </span>
  );
}

/** Marks an amount nobody has confirmed yet. */
export function EstimateMark() {
  return (
    <span
      title="This amount is a guess. Press Edit and type the real one."
      className="ml-1.5 cursor-help align-middle text-[0.7rem] font-medium text-muted"
    >
      guess
    </span>
  );
}

/* -- controls ------------------------------------------------------------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: 'bg-accent-strong text-white border border-transparent hover:brightness-110',
  secondary: 'bg-surface text-ink border border-hairline hover:bg-sunken',
  ghost: 'bg-transparent text-ink-2 border border-transparent hover:bg-sunken',
  danger: 'bg-transparent text-critical-text border border-critical hover:bg-sunken',
};

export function Button({
  variant = 'secondary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_STYLES[variant]} ${className}`}
    />
  );
}

/** Segmented control — every option visible at once, which beats a dropdown
 *  for the two or three choices people flip between constantly. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-lg border border-hairline bg-surface p-0.5"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition ${
              selected ? 'bg-ink text-surface' : 'text-ink-2 hover:text-ink'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink-2">
        {label}
      </label>
      {children(id)}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

const CONTROL_CLASS =
  'w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted';

export function TextInput({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${CONTROL_CLASS} ${className}`} />;
}

export function NumberInput({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      inputMode="decimal"
      type="number"
      step="any"
      {...props}
      className={`${CONTROL_CLASS} tnum ${className}`}
    />
  );
}

export function Select({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${CONTROL_CLASS} ${className}`} />;
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${
        checked ? 'bg-good' : 'bg-axis'
      }`}
    >
      <span
        className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-[left]"
        style={{ left: checked ? 22 : 2 }}
      />
    </button>
  );
}

/* -- overlays ------------------------------------------------------------- */

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // Move focus into the dialog so keyboard users are not left behind it.
    ref.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="card rise max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-b-none sm:rounded-b-card"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-hairline bg-surface px-5 py-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <Button variant="ghost" onClick={onClose} aria-label="Close">
            ✕
          </Button>
        </div>
        <div className="px-5 py-5">{children}</div>
        {footer && (
          <div className="sticky bottom-0 flex justify-end gap-2 border-t border-hairline bg-surface px-5 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function Banner({
  tone = 'warning',
  title,
  children,
  action,
}: {
  tone?: StatusTone;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      className="mb-6 flex flex-wrap items-start gap-x-4 gap-y-3 rounded-card border p-4"
      style={{ borderColor: STATUS[tone], background: 'var(--color-surface)' }}
    >
      <span
        aria-hidden
        className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: STATUS[tone] }}
      />
      <div className="min-w-[16rem] flex-1">
        <p className="text-sm font-semibold text-ink">{title}</p>
        {children && <div className="mt-1 text-sm text-ink-2">{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <p className="text-base font-semibold">{title}</p>
      <p className="max-w-sm text-sm text-ink-2">{body}</p>
      {action}
    </div>
  );
}
