import type {
  HealthStatus,
  PulseStats,
  Recommendation,
  TrackedStock,
} from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });

  if (!response.ok) {
    throw new ApiError(await readErrorMessage(response), response.status);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string | string[] };
    if (Array.isArray(body.message)) return body.message.join(', ');
    if (body.message) return body.message;
  } catch {
    // non-JSON error body
  }
  return `Request failed with status ${response.status}`;
}

export const api = {
  health: () => request<HealthStatus>('/health'),
  stats: (userId: string) =>
    request<PulseStats>(`/recommendations/stats?userId=${encodeURIComponent(userId)}`),
  stocks: (userId: string) =>
    request<TrackedStock[]>(`/stocks?userId=${encodeURIComponent(userId)}`),
  addStock: (userId: string, ticker: string) =>
    request<TrackedStock>('/stocks', {
      method: 'POST',
      body: JSON.stringify({ userId, ticker }),
    }),
  removeStock: (userId: string, ticker: string) =>
    request<void>(
      `/stocks/${encodeURIComponent(ticker)}?userId=${encodeURIComponent(userId)}`,
      { method: 'DELETE' },
    ),
  recommendations: (userId: string, limit = 50) =>
    request<Recommendation[]>(
      `/recommendations?userId=${encodeURIComponent(userId)}&limit=${limit}`,
    ),
  latestPerTicker: (userId: string) =>
    request<Recommendation[]>(
      `/recommendations/latest?userId=${encodeURIComponent(userId)}`,
    ),
  deleteRecommendation: (userId: string, id: number) =>
    request<void>(
      `/recommendations/${id}?userId=${encodeURIComponent(userId)}`,
      { method: 'DELETE' },
    ),
  requestScan: () =>
    request<{ requestedAt: string }>('/scan', { method: 'POST' }),
};