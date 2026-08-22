import type { Recommendation } from '../types';
import {
  changeDirection,
  formatPrice,
  formatTimestamp,
  sentimentStyles,
  triggerExplanations,
  triggerLabels,
} from '../lib/format';

interface AlertCardProps {
  alert: Recommendation;
  onDismiss: (id: number) => void;
}

export function AlertCard({ alert, onDismiss }: AlertCardProps) {
  const style = sentimentStyles[alert.sentiment];

  return (
    <article className="panel group/card relative overflow-hidden p-4 transition hover:border-white/20">
      <span
        className={`absolute inset-y-0 left-0 w-1 bg-gradient-to-b ${style.accent} to-transparent`}
        aria-hidden="true"
      />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 className="font-mono text-lg font-bold tracking-tight text-white">
          {alert.ticker}
        </h3>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ring-1 ring-inset ${style.badge}`}
        >
          {style.label}
        </span>
        <span className="text-sm text-slate-300">
          {formatPrice(alert.currentPrice)}
        </span>
        <ChangeChip value={alert.dailyChange} label="today" />
        <ChangeChip value={alert.priceChange30d} label="30d" />
        <time
          dateTime={alert.timestamp}
          className="ml-auto text-xs text-slate-500"
        >
          {formatTimestamp(alert.timestamp)}
        </time>

        <button
          type="button"
          onClick={() => onDismiss(alert.id)}
          aria-label={`Dismiss ${alert.ticker} alert`}
          title="Remove this alert"
          className="-mr-1 rounded p-1 text-slate-500 opacity-0 transition hover:bg-rose-500/15 hover:text-rose-300 focus:opacity-100 group-hover/card:opacity-100"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <p className="mt-3 text-base font-medium leading-snug text-white">
        {alert.recommendation}
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-300">{alert.reason}</p>

      {alert.trigger && (
        <p className="mt-3 rounded-lg border border-white/5 bg-black/20 px-3 py-2 text-xs leading-relaxed text-slate-400">
          <span className="font-semibold text-slate-300">
            {triggerLabels[alert.trigger]}
          </span>
          {' — '}
          {triggerExplanations[alert.trigger]}.
        </p>
      )}

      <details className="group mt-3">
        <summary className="cursor-pointer list-none text-xs font-medium text-cyan-300 hover:text-cyan-200">
          <span className="group-open:hidden">Show market context</span>
          <span className="hidden group-open:inline">Hide market context</span>
        </summary>
        <p className="mt-2 rounded-lg bg-black/20 p-3 text-sm leading-relaxed text-slate-400">
          {alert.newsSummary}
        </p>
      </details>

      {alert.sources.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {alert.sources.map((source) => (
            <li key={source}>
              <SourceChip source={source} />
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function ChangeChip({ value, label }: { value: string | null; label: string }) {
  if (!value) return null;

  const direction = changeDirection(value);
  const tone =
    direction === 'up'
      ? 'text-emerald-300'
      : direction === 'down'
        ? 'text-rose-300'
        : 'text-slate-400';

  return (
    <span className={`text-sm font-medium tabular-nums ${tone}`}>
      {value}
      <span className="ml-1 text-xs text-slate-500">{label}</span>
    </span>
  );
}

function SourceChip({ source }: { source: string }) {
  const isLink = /^https?:\/\//i.test(source);
  const className =
    'inline-block rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-slate-400';

  if (!isLink) {
    return <span className={className}>{source}</span>;
  }
  return (
    <a
      href={source}
      target="_blank"
      rel="noopener noreferrer"
      className={`${className} hover:border-cyan-400/30 hover:text-cyan-300`}
    >
      {new URL(source).hostname.replace(/^www\./, '')}
    </a>
  );
}
