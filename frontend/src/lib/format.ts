import type { Sentiment, Trigger } from '../types';

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

/** Plain-English wording for what made an alert clear the noise filter. */
export const triggerLabels: Record<Trigger, string> = {
  MOMENTUM_SHIFT: 'Momentum shift',
  EARNINGS_EVENT: 'Earnings event',
  ANALYST_ACTION: 'Analyst rating action',
  TREND_CONFIRMATION: '30-day trend continuation',
};

/**
 * Why that trigger is worth an interruption. Shown verbatim on the alert so a
 * news-driven call is not mistaken for a reaction to the day's price move.
 */
export const triggerExplanations: Record<Trigger, string> = {
  MOMENTUM_SHIFT: "today's move cleared the alert threshold on its own",
  EARNINGS_EVENT: 'results landed, which is material however the price reacts',
  ANALYST_ACTION: 'an analyst changed their rating or price target',
  TREND_CONFIRMATION: 'a smaller move pushed an already-strong 30-day trend further',
};

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
