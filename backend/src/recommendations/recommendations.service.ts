import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { normalizeTicker } from '../common/user-id.util';
import { CreateRecommendationDto, Sentiment } from './dto/create-recommendation.dto';

interface RecommendationRow {
  id: number;
  user_id: string;
  ticker: string;
  sentiment: string;
  recommendation: string;
  reason: string;
  news_summary: string;
  price_change_30d: string | null;
  current_price: string | null;
  sources: string;
  timestamp: Date;
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
  currentPrice: number | null;
  sources: string[];
  timestamp: string;
}

@Injectable()
export class RecommendationsService {
  constructor(private readonly db: DatabaseService) {}

  async findAll(
    userId: string,
    limit: number,
    ticker?: string,
  ): Promise<Recommendation[]> {
    const params: unknown[] = [userId];
    let where = 'user_id = $1';

    if (ticker) {
      params.push(normalizeTicker(ticker));
      where += ` AND ticker = $${params.length}`;
    }
    params.push(limit);

    const rows = await this.db.query<RecommendationRow>(
      `SELECT * FROM recommendations
        WHERE ${where}
        ORDER BY timestamp DESC, id DESC
        LIMIT $${params.length}`,
      params,
    );
    return rows.map(toRecommendation);
  }

  /**
   * Newest alert per ticker. Powers the dashboard summary cards and the
   * agent's per-ticker alert cooldown.
   */
  async findLatestPerTicker(userId: string): Promise<Recommendation[]> {
    const rows = await this.db.query<RecommendationRow>(
      `SELECT DISTINCT ON (ticker) *
         FROM recommendations
        WHERE user_id = $1
        ORDER BY ticker, timestamp DESC, id DESC`,
      [userId],
    );
    return rows.map(toRecommendation);
  }

  async create(userId: string, dto: CreateRecommendationDto): Promise<Recommendation> {
    const ticker = normalizeTicker(dto.ticker);

    await this.db.query(
      `INSERT INTO users (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
      [userId],
    );

    const row = await this.db.queryOne<RecommendationRow>(
      `INSERT INTO recommendations
         (user_id, ticker, sentiment, recommendation, reason, news_summary,
          price_change_30d, current_price, sources)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        userId,
        ticker,
        dto.sentiment,
        dto.recommendation,
        dto.reason,
        dto.newsSummary,
        dto.priceChange30d ?? null,
        dto.currentPrice ?? null,
        JSON.stringify(dto.sources ?? []),
      ],
    );

    // RETURNING on a successful INSERT always yields a row.
    return toRecommendation(row as RecommendationRow);
  }

  async remove(userId: string, id: number): Promise<void> {
    const deleted = await this.db.queryOne<{ id: number }>(
      `DELETE FROM recommendations WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, userId],
    );
    if (!deleted) {
      throw new NotFoundException(`Alert ${id} not found`);
    }
  }

  async stats(userId: string): Promise<{
    trackedCount: number;
    alertCount: number;
    alerts24h: number;
    bullish: number;
    bearish: number;
    neutral: number;
    lastAlertAt: string | null;
  }> {
    const row = await this.db.queryOne<{
      tracked_count: string;
      alert_count: string;
      alerts_24h: string;
      bullish: string;
      bearish: string;
      neutral: string;
      last_alert_at: Date | null;
    }>(
      `SELECT
         (SELECT COUNT(*) FROM tracked_stocks WHERE user_id = $1) AS tracked_count,
         COUNT(*) AS alert_count,
         COUNT(*) FILTER (WHERE timestamp > NOW() - INTERVAL '24 hours') AS alerts_24h,
         COUNT(*) FILTER (WHERE sentiment = 'BULLISH') AS bullish,
         COUNT(*) FILTER (WHERE sentiment = 'BEARISH') AS bearish,
         COUNT(*) FILTER (WHERE sentiment = 'NEUTRAL') AS neutral,
         MAX(timestamp) AS last_alert_at
       FROM recommendations
       WHERE user_id = $1`,
      [userId],
    );

    return {
      trackedCount: Number(row?.tracked_count ?? 0),
      alertCount: Number(row?.alert_count ?? 0),
      alerts24h: Number(row?.alerts_24h ?? 0),
      bullish: Number(row?.bullish ?? 0),
      bearish: Number(row?.bearish ?? 0),
      neutral: Number(row?.neutral ?? 0),
      lastAlertAt: row?.last_alert_at ? row.last_alert_at.toISOString() : null,
    };
  }
}

/**
 * `sources` is a TEXT column. The agent writes a JSON array, but a human
 * inserting a plain comma-separated string should not break the dashboard.
 */
function parseSources(raw: string): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map(String).filter(Boolean);
    }
  } catch {
    // fall through to delimiter parsing
  }
  return raw
    .split(/[,\n]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function toRecommendation(row: RecommendationRow): Recommendation {
  return {
    id: row.id,
    userId: row.user_id,
    ticker: row.ticker,
    sentiment: row.sentiment as Sentiment,
    recommendation: row.recommendation,
    reason: row.reason,
    newsSummary: row.news_summary,
    priceChange30d: row.price_change_30d,
    // NUMERIC arrives as a string from node-postgres to preserve precision.
    currentPrice: row.current_price === null ? null : Number(row.current_price),
    sources: parseSources(row.sources),
    timestamp: row.timestamp.toISOString(),
  };
}
