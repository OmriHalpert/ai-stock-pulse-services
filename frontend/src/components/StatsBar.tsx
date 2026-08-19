import type { PulseStats } from '../types';
import { formatRelativeTime } from '../lib/format';

interface StatsBarProps {
  stats: PulseStats | null;
}

export function StatsBar({ stats }: StatsBarProps) {
  const cards = [
    {
      label: 'Tracked stocks',
      value: stats ? String(stats.trackedCount) : '—',
      hint: 'in your watchlist',
    },
    {
      label: 'Alerts (24h)',
      value: stats ? String(stats.alerts24h) : '—',
      hint: `${stats?.alertCount ?? 0} all time`,
    },
    {
      label: 'Sentiment split',
      value: stats ? `${stats.bullish} / ${stats.bearish}` : '—',
      hint: 'bullish / bearish',
    },
    {
      label: 'Last alert',
      value: stats ? formatRelativeTime(stats.lastAlertAt) : '—',
      hint: stats?.lastAlertAt ? 'engine is watching' : 'no alerts yet',
    },
  ];

  return (
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="panel px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            {card.label}
          </p>
          <p className="mt-1 truncate text-xl font-semibold text-white sm:text-2xl">
            {card.value}
          </p>
          <p className="mt-0.5 truncate text-xs text-slate-500">{card.hint}</p>
        </div>
      ))}
    </section>
  );
}
