import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type {
  HealthStatus,
  PulseStats,
  Recommendation,
  TrackedStock,
} from '../types';

const REFRESH_INTERVAL_MS = 30_000;

interface PulseData {
  stocks: TrackedStock[];
  recommendations: Recommendation[];
  latest: Recommendation[];
  stats: PulseStats | null;
  health: HealthStatus | null;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  scanning: boolean;
  refresh: () => Promise<void>;
  addStock: (ticker: string) => Promise<void>;
  removeStock: (ticker: string) => Promise<void>;
  removeAlert: (id: number) => Promise<void>;
  requestScan: () => Promise<void>;
}

// After asking the agent to scan, poll for the results it writes back.
const SCAN_POLL_INTERVAL_MS = 2_000;
const SCAN_POLL_ATTEMPTS = 8;

export function usePulseData(userId: string): PulseData {
  const [stocks, setStocks] = useState<TrackedStock[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [latest, setLatest] = useState<Recommendation[]>([]);
  const [stats, setStats] = useState<PulseStats | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Guards against a slow in-flight refresh writing state after unmount.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [stocksData, recsData, latestData, statsData, healthData] =
        await Promise.all([
          api.stocks(userId),
          api.recommendations(userId),
          api.latestPerTicker(userId),
          api.stats(userId),
          api.health().catch(() => null),
        ]);

      if (!mounted.current) return;
      setStocks(stocksData);
      setRecommendations(recsData);
      setLatest(latestData);
      setStats(statsData);
      setHealth(healthData);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err.message : 'Failed to reach the API');
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const addStock = useCallback(
    async (ticker: string) => {
      await api.addStock(userId, ticker);
      await refresh();
    },
    [userId, refresh],
  );

  const removeStock = useCallback(
    async (ticker: string) => {
      await api.removeStock(userId, ticker);
      await refresh();
    },
    [userId, refresh],
  );

  const removeAlert = useCallback(
    async (id: number) => {
      // Drop it locally first so the card disappears on click.
      setRecommendations((current) => current.filter((item) => item.id !== id));
      try {
        await api.deleteRecommendation(userId, id);
      } finally {
        await refresh();
      }
    },
    [userId, refresh],
  );

  const requestScan = useCallback(async () => {
    setScanning(true);
    try {
      await api.requestScan();
      // The agent claims the request within a few seconds and writes any
      // alerts back, so poll until something lands rather than guessing.
      for (let attempt = 0; attempt < SCAN_POLL_ATTEMPTS; attempt++) {
        await new Promise((resolve) =>
          window.setTimeout(resolve, SCAN_POLL_INTERVAL_MS),
        );
        if (!mounted.current) return;
        await refresh();
      }
    } catch (err) {
      if (mounted.current) {
        setError(err instanceof Error ? err.message : 'Could not request a scan');
      }
    } finally {
      if (mounted.current) setScanning(false);
    }
  }, [refresh]);

  return {
    stocks,
    recommendations,
    latest,
    stats,
    health,
    loading,
    error,
    lastUpdated,
    scanning,
    refresh,
    addStock,
    removeStock,
    removeAlert,
    requestScan,
  };
}
