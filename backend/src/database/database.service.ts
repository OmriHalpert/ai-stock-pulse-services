import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, QueryResultRow } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: Pool;

  constructor(private readonly config: ConfigService) {
    this.pool = new Pool({
      connectionString: this.config.get<string>(
        'DATABASE_URL',
        'postgres://pulse:pulse_local_password@localhost:5432/stock_pulse',
      ),
      max: Number(this.config.get('DATABASE_POOL_SIZE', '10')),
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
    });

    // An idle client dropped by the server must not take the process down.
    this.pool.on('error', (error) =>
      this.logger.error(`Idle client error: ${error.message}`),
    );
  }

  async onModuleInit(): Promise<void> {
    // Compose starts us only after postgres is healthy, but the first
    // connection can still race the init scripts, so retry briefly.
    for (let attempt = 1; attempt <= 10; attempt++) {
      try {
        await this.pool.query('SELECT 1');
        this.logger.log('Connected to PostgreSQL');
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Database not ready (attempt ${attempt}/10): ${message}`);
        await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
    }
    throw new Error('Could not establish a PostgreSQL connection');
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  async query<T extends QueryResultRow>(
    text: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    const result = await this.pool.query<T>(text, params);
    return result.rows;
  }

  async queryOne<T extends QueryResultRow>(
    text: string,
    params: unknown[] = [],
  ): Promise<T | null> {
    const rows = await this.query<T>(text, params);
    return rows[0] ?? null;
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
}
