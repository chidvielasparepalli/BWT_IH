import { apiBaseUrl, mongoApiEnabled } from './config';
import { getAuthToken } from './authToken';

type ApiOptions = Omit<RequestInit, 'body'> & { body?: unknown };

export async function mongoRequest<T>(path: string, options: ApiOptions = {}): Promise<T> {
  if (!mongoApiEnabled || !apiBaseUrl) throw new Error('MongoDB API is not configured.');
  const headers = new Headers(options.headers);
  const token = getAuthToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`, {
      ...options, headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new Error('HarvestLink API is unreachable. Start the backend and check VITE_API_BASE_URL.');
  }
  const payload = await response.json().catch(() => ({})) as { error?: string; message?: string };
  if (!response.ok) throw new Error(payload.error || payload.message || `API request failed (${response.status}).`);
  return payload as T;
}

export type MongoDataSnapshot = {
  products: import('../types').Product[];
  orders: import('../types').Order[];
  moderationLogs: import('../types').ModerationLog[];
};
