import type { Sentiment } from '../types';

export function formatPrice(price: number | null): string {
  if (price === null || Number.isNaN(price)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(price);
}

export function formatTimestamp(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'never';

  const deltaSeconds = (Date.now() - new Date(iso).getTime()) / 1000;
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['second', 60],
    ['minute', 60],
    ['hour', 24],
    ['day', 7],
    ['week', 4.35],
    ['month', 12],
  ];

  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  let value = deltaSeconds;
  for (const [unit, step] of units) {
    if (Math.abs(value) < step) {
      return formatter.format(-Math.round(value), unit);
    }
    value /= step;
  }
  return formatter.format(-Math.round(value), 'year');
}

/** Signed percentage strings such as "+4.2%" drive the up/down colouring. */
export function changeDirection(change: string | null): 'up' | 'down' | 'flat' {
  if (!change) return 'flat';
  const parsed = Number.parseFloat(change.replace(/[^0-9.+-]/g, ''));
  if (!Number.isFinite(parsed) || parsed === 0) return 'flat';
  return parsed > 0 ? 'up' : 'down';
}

export const sentimentStyles: Record<
  Sentiment,
  { badge: string; dot: string; accent: string; label: string }
> = {
  BULLISH: {
    badge: 'bg-emerald-400/10 text-emerald-300 ring-emerald-400/30',
    dot: 'bg-emerald-400',
    accent: 'from-emerald-400/60',
    label: 'Bullish',
  },
  BEARISH: {
    badge: 'bg-rose-400/10 text-rose-300 ring-rose-400/30',
    dot: 'bg-rose-400',
    accent: 'from-rose-400/60',
    label: 'Bearish',
  },
  NEUTRAL: {
    badge: 'bg-amber-400/10 text-amber-300 ring-amber-400/30',
    dot: 'bg-amber-400',
    accent: 'from-amber-400/60',
    label: 'Neutral',
  },
};
