import type { Recommendation } from '../types';
import { AlertCard } from './AlertCard';

interface AlertFeedProps {
  alerts: Recommendation[];
  selectedTicker: string | null;
  loading: boolean;
  onDismiss: (id: number) => void;
}

export function AlertFeed({
  alerts,
  selectedTicker,
  loading,
  onDismiss,
}: AlertFeedProps) {
  const visible = selectedTicker
    ? alerts.filter((alert) => alert.ticker === selectedTicker)
    : alerts;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
          {selectedTicker ? `${selectedTicker} alerts` : 'Alert feed'}
        </h2>
        <span className="text-xs text-slate-500">
          {visible.length} {visible.length === 1 ? 'alert' : 'alerts'}
        </span>
      </div>

      {loading && alerts.length === 0 && <SkeletonList />}

      {!loading && visible.length === 0 && (
        <div className="panel px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-300">
            No high-conviction alerts yet
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
            {selectedTicker
              ? `${selectedTicker} has not moved enough to clear the alert threshold.`
              : 'The agent is filtering out routine daily fluctuations. Alerts appear here when something material happens.'}
          </p>
        </div>
      )}

      {visible.map((alert) => (
        <AlertCard key={alert.id} alert={alert} onDismiss={onDismiss} />
      ))}
    </section>
  );
}

function SkeletonList() {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <div key={index} className="panel animate-pulse p-4">
          <div className="flex items-center gap-3">
            <div className="h-5 w-16 rounded bg-white/10" />
            <div className="h-5 w-20 rounded-full bg-white/10" />
          </div>
          <div className="mt-4 h-4 w-3/4 rounded bg-white/10" />
          <div className="mt-2 h-3 w-2/3 rounded bg-white/5" />
        </div>
      ))}
    </div>
  );
}
