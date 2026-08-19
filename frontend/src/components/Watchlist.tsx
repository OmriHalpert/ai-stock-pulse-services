import { useState, type FormEvent } from 'react';
import type { Recommendation, TrackedStock } from '../types';
import { sentimentStyles } from '../lib/format';

interface WatchlistProps {
  stocks: TrackedStock[];
  latest: Recommendation[];
  selectedTicker: string | null;
  onSelect: (ticker: string | null) => void;
  onAdd: (ticker: string) => Promise<void>;
  onRemove: (ticker: string) => Promise<void>;
}

export function Watchlist({
  stocks,
  latest,
  selectedTicker,
  onSelect,
  onAdd,
  onRemove,
}: WatchlistProps) {
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const latestByTicker = new Map(latest.map((item) => [item.ticker, item]));

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const ticker = draft.trim().toUpperCase();
    if (!ticker) return;

    setPending(true);
    setError(null);
    try {
      await onAdd(ticker);
      setDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add ticker');
    } finally {
      setPending(false);
    }
  }

  async function handleRemove(ticker: string) {
    setError(null);
    try {
      await onRemove(ticker);
      if (selectedTicker === ticker) onSelect(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove ticker');
    }
  }

  return (
    <section className="panel flex flex-col p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
          Watchlist
        </h2>
        {selectedTicker && (
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="text-xs text-cyan-300 hover:text-cyan-200"
          >
            Clear filter
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Add ticker (e.g. MSFT)"
          maxLength={10}
          aria-label="Ticker symbol"
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm uppercase text-white placeholder:normal-case placeholder:text-slate-500 focus:border-cyan-400/50 focus:outline-none focus:ring-1 focus:ring-cyan-400/40"
        />
        <button
          type="submit"
          disabled={pending || !draft.trim()}
          className="rounded-lg bg-cyan-500/90 px-3 py-2 text-sm font-medium text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Add
        </button>
      </form>

      {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}

      <ul className="mt-3 flex flex-col gap-1.5">
        {stocks.length === 0 && (
          <li className="rounded-lg border border-dashed border-white/10 px-3 py-6 text-center text-sm text-slate-500">
            No stocks tracked yet.
          </li>
        )}

        {stocks.map((stock) => {
          const signal = latestByTicker.get(stock.ticker);
          const isSelected = selectedTicker === stock.ticker;

          return (
            <li key={stock.id}>
              <div
                className={`group flex items-center gap-2 rounded-lg border px-3 py-2 transition ${
                  isSelected
                    ? 'border-cyan-400/40 bg-cyan-400/10'
                    : 'border-transparent bg-white/5 hover:border-white/10 hover:bg-white/10'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelect(isSelected ? null : stock.ticker)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  aria-pressed={isSelected}
                >
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      signal ? sentimentStyles[signal.sentiment].dot : 'bg-slate-600'
                    }`}
                    title={signal ? signal.sentiment : 'No alert yet'}
                  />
                  <span className="font-mono text-sm font-semibold text-white">
                    {stock.ticker}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => void handleRemove(stock.ticker)}
                  aria-label={`Stop tracking ${stock.ticker}`}
                  className="shrink-0 rounded p-1 text-slate-500 opacity-0 transition hover:bg-rose-500/15 hover:text-rose-300 focus:opacity-100 group-hover:opacity-100"
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
            </li>
          );
        })}
      </ul>

      <p className="mt-4 border-t border-white/10 pt-3 text-xs leading-relaxed text-slate-500">
        The agent scans each ticker on a schedule and only writes an alert when a
        move clears the noise threshold.
      </p>
    </section>
  );
}
