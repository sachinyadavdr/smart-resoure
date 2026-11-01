import { resolveApiBaseUrl } from './api-url.mjs';

// Keep the direct process.env access: Next.js inlines this value at build time.
export const API_BASE_URL = resolveApiBaseUrl(process.env.NEXT_PUBLIC_API_URL, process.env.NODE_ENV === 'production');

// The server exposes only API-relative UUID references, never filesystem paths.
export function resourceImageUrl(reference?: string | null): string {
  return reference && /^\/resource-images\/[a-f0-9-]+\.(jpg|png|webp)$/.test(reference) ? `${API_BASE_URL}${reference}` : '';
}

type ApiResult<T> = {
  response: Response;
  data: T | null;
};

export async function requestJson<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, init);
  } catch {
    throw new Error(`Unable to reach ResourceBridge API at ${API_BASE_URL}. Check the API URL, backend availability and allowed frontend origin.`);
  }

  const body = await response.text();
  if (!body) return { response, data: null };

  try {
    return { response, data: JSON.parse(body) as T };
  } catch {
    throw new Error(response.ok ? 'The server returned an invalid response.' : `The server returned an unexpected error (${response.status}).`);
  }
}

export function apiErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
