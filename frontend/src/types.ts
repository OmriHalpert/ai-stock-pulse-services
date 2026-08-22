export type Sentiment = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export type Trigger =
  | 'MOMENTUM_SHIFT'
  | 'EARNINGS_EVENT'
  | 'ANALYST_ACTION'
  | 'TREND_CONFIRMATION';

export interface TrackedStock {
  id: number;
  user_id: string;
  ticker: string;
  created_at: string;
}

export interface Recommendation {
  id: number;
  userId: string;
  ticker: string;
  sentiment: Sentiment;
  recommendation: string;
  reason: string;
  newsSummary: string;
  priceChange30d: string | null;
  dailyChange: string | null;
  currentPrice: number | null;
  trigger: Trigger | null;
  sources: string[];
  timestamp: string;
}

export interface PulseStats {
  trackedCount: number;
  alertCount: number;
  alerts24h: number;
  bullish: number;
  bearish: number;
  neutral: number;
  lastAlertAt: string | null;
}

export interface HealthStatus {
  status: string;
  service: string;
  database: string;
  uptimeSeconds: number;
  timestamp: string;
}
