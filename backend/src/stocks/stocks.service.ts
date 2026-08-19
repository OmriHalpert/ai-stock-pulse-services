import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { normalizeTicker } from '../common/user-id.util';

export interface TrackedStock {
  id: number;
  user_id: string;
  ticker: string;
  created_at: Date;
}

@Injectable()
export class StocksService {
  constructor(private readonly db: DatabaseService) {}

  async findAll(userId: string): Promise<TrackedStock[]> {
    return this.db.query<TrackedStock>(
      `SELECT id, user_id, ticker, created_at
         FROM tracked_stocks
        WHERE user_id = $1
        ORDER BY ticker ASC`,
      [userId],
    );
  }

  async add(userId: string, rawTicker: string): Promise<TrackedStock> {
    const ticker = normalizeTicker(rawTicker);

    // tracked_stocks.user_id is a FK, so a brand-new tenant needs a users row.
    await this.db.query(
      `INSERT INTO users (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
      [userId],
    );

    const created = await this.db.queryOne<TrackedStock>(
      `INSERT INTO tracked_stocks (user_id, ticker)
            VALUES ($1, $2)
       ON CONFLICT (user_id, ticker) DO NOTHING
         RETURNING id, user_id, ticker, created_at`,
      [userId, ticker],
    );

    if (!created) {
      throw new ConflictException(`${ticker} is already tracked`);
    }
    return created;
  }

  async remove(userId: string, rawTicker: string): Promise<void> {
    const ticker = normalizeTicker(rawTicker);
    const deleted = await this.db.queryOne<{ id: number }>(
      `DELETE FROM tracked_stocks WHERE user_id = $1 AND ticker = $2 RETURNING id`,
      [userId, ticker],
    );
    if (!deleted) {
      throw new NotFoundException(`${ticker} is not tracked`);
    }
  }

  /**
   * Fan-out view consumed by the agent: every tenant with its tickers and the
   * Telegram chat to notify.
   */
  async watchlist(): Promise<
    { userId: string; telegramChatId: string | null; tickers: string[] }[]
  > {
    const rows = await this.db.query<{
      user_id: string;
      telegram_chat_id: string | null;
      tickers: string[] | null;
    }>(
      `SELECT u.user_id,
              u.telegram_chat_id,
              ARRAY_REMOVE(ARRAY_AGG(ts.ticker ORDER BY ts.ticker), NULL) AS tickers
         FROM users u
    LEFT JOIN tracked_stocks ts ON ts.user_id = u.user_id
     GROUP BY u.user_id, u.telegram_chat_id
     ORDER BY u.user_id`,
    );

    return rows
      .map((row) => ({
        userId: row.user_id,
        telegramChatId: row.telegram_chat_id,
        tickers: row.tickers ?? [],
      }))
      .filter((entry) => entry.tickers.length > 0);
  }
}
