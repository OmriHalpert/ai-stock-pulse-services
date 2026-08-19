import { Injectable, Logger } from '@nestjs/common';

/**
 * Hand-off point for manual "scan now" requests.
 *
 * The agent is a worker with no inbound HTTP server, so instead of pushing to
 * it, the dashboard parks a request here and the agent claims it on its next
 * poll. Deliberately in-memory: a pending request is only meaningful for the
 * few seconds until the agent picks it up, and losing one on restart is
 * harmless.
 */
@Injectable()
export class ScanService {
  private readonly logger = new Logger(ScanService.name);
  private requestedAt: Date | null = null;

  request(): { requestedAt: string } {
    this.requestedAt = new Date();
    this.logger.log('Manual scan requested from the dashboard');
    return { requestedAt: this.requestedAt.toISOString() };
  }

  /** Consumes the pending request, so each one triggers exactly one cycle. */
  claim(): { pending: boolean; requestedAt: string | null } {
    const requestedAt = this.requestedAt;
    this.requestedAt = null;
    return {
      pending: requestedAt !== null,
      requestedAt: requestedAt ? requestedAt.toISOString() : null,
    };
  }

  status(): { pending: boolean; requestedAt: string | null } {
    return {
      pending: this.requestedAt !== null,
      requestedAt: this.requestedAt ? this.requestedAt.toISOString() : null,
    };
  }
}
