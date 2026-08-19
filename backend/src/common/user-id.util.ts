import { BadRequestException } from '@nestjs/common';

const TICKER_PATTERN = /^[A-Z][A-Z0-9.\-]{0,9}$/;

/**
 * Every query is scoped to a tenant. Callers may omit the id, in which case the
 * single-tenant default seeded by init.sql is used.
 */
export function resolveUserId(
  candidate: string | undefined,
  fallback: string,
): string {
  const userId = (candidate ?? '').trim() || fallback;
  if (userId.length > 64) {
    throw new BadRequestException('userId must be at most 64 characters');
  }
  return userId;
}

export function normalizeTicker(raw: string): string {
  const ticker = raw.trim().toUpperCase();
  if (!TICKER_PATTERN.test(ticker)) {
    throw new BadRequestException(
      `"${raw}" is not a valid ticker symbol (1-10 chars, letters/digits/.-)`,
    );
  }
  return ticker;
}
