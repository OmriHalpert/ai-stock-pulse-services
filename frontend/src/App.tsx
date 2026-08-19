import { useState } from 'react';
import { Header } from './components/Header';
import { StatsBar } from './components/StatsBar';
import { Watchlist } from './components/Watchlist';
import { AlertFeed } from './components/AlertFeed';
import { usePulseData } from './hooks/usePulseData';

const USER_ID = import.meta.env.VITE_DEFAULT_USER_ID ?? 'default-user';

export default function App() {
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const {
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
  } = usePulseData(USER_ID);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:py-10">
      <Header
        health={health}
        lastUpdated={lastUpdated}
        onRefresh={() => void refresh()}
        refreshing={loading}
        onScan={() => void requestScan()}
        scanning={scanning}
      />

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
        >
          {error}
        </div>
      )}

      <StatsBar stats={stats} />

      <main className="grid flex-1 grid-cols-1 items-start gap-6 lg:grid-cols-[20rem_1fr]">
        <Watchlist
          stocks={stocks}
          latest={latest}
          selectedTicker={selectedTicker}
          onSelect={setSelectedTicker}
          onAdd={addStock}
          onRemove={removeStock}
        />
        <AlertFeed
          alerts={recommendations}
          selectedTicker={selectedTicker}
          loading={loading}
          onDismiss={(id) => void removeAlert(id)}
        />
      </main>

      <footer className="border-t border-white/10 pt-4 text-center text-xs text-slate-600">
        AI Stock Pulse Engine · alerts are informational only and are not
        investment advice.
      </footer>
    </div>
  );
}
