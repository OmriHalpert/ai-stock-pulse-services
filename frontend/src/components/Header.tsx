import type { HealthStatus } from '../types';
import { formatRelativeTime } from '../lib/format';

interface HeaderProps {
  health: HealthStatus | null;
  lastUpdated: Date | null;
  onRefresh: () => void;
  refreshing: boolean;
  onScan: () => void;
  scanning: boolean;
}

export function Header({
  health,
  lastUpdated,
  onRefresh,
  refreshing,
  onScan,
  scanning,
}: HeaderProps) {
  const online = health?.status === 'ok';

  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-cyan-400/30 to-indigo-500/30 ring-1 ring-white/15">
          <svg
            viewBox="0 0 24 24"
            className="h-6 w-6 text-cyan-300"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M2 12h4l3 8 4-16 3 8h6" />
          </svg>
        </span>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
            AI Stock Pulse Engine
          </h1>
          <p className="text-sm text-slate-400">
            High-conviction alerts only. Daily noise filtered out.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <span
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300"
          title={health ? `Database: ${health.database}` : 'Backend unreachable'}
        >
          <span className="relative flex h-2 w-2">
            {online && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            )}
            <span
              className={`relative inline-flex h-2 w-2 rounded-full ${
                online ? 'bg-emerald-400' : 'bg-rose-500'
              }`}
            />
          </span>
          {online ? 'Engine online' : 'Engine offline'}
        </span>

        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          <svg
            viewBox="0 0 24 24"
            className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <path d="M21 3v6h-6" />
          </svg>
          {lastUpdated ? formatRelativeTime(lastUpdated.toISOString()) : 'Refresh'}
        </button>

        <button
          type="button"
          onClick={onScan}
          disabled={scanning}
          title="Ask the agent to pull fresh market data and re-run its analysis now"
          className="inline-flex items-center gap-2 rounded-full bg-cyan-500/90 px-3.5 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <svg
            viewBox="0 0 24 24"
            className={`h-3.5 w-3.5 ${scanning ? 'animate-spin' : ''}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {scanning ? (
              <path d="M21 12a9 9 0 1 1-6.22-8.56" />
            ) : (
              <>
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </>
            )}
          </svg>
          {scanning ? 'Scanning…' : 'Scan now'}
        </button>
      </div>
    </header>
  );
}
