import { ApiError } from "./errors.ts";

export type QueryValue = string | number | boolean | undefined;

export async function fetchJSON<T>(
  fetchImpl: typeof fetch,
  url: URL,
  headers: Headers,
): Promise<T> {
  const response = await fetchImpl(url, { headers });

  if (!response.ok) {
    throw await buildApiError(response);
  }

  return response.json() as Promise<T>;
}

export function appendQuery(
  url: URL,
  query?: Record<string, QueryValue>,
): void {
  if (!query) {
    return;
  }

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === "") {
      continue;
    }
    url.searchParams.set(key, String(value));
  }
}

export function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

export function stripLeadingSlash(value: string): string {
  return value.replace(/^\/+/, "");
}

export function joinBaseUrl(baseUrl: string, path: string): string {
  return ensureTrailingSlash(new URL(stripLeadingSlash(path), baseUrl).toString());
}

export function joinResourceUrl(baseUrl: string, path: string): string {
  return new URL(stripLeadingSlash(path), baseUrl).toString();
}

async function buildApiError(response: Response): Promise<ApiError> {
  const bodyText = await response.text();
  const body = parseJsonBody(bodyText);
  const message = extractErrorMessage(body, bodyText) ?? `API ${response.status}`;
  return new ApiError(response.status, message, body);
}

function parseJsonBody(bodyText: string): unknown {
  if (bodyText.trim() === "") {
    return undefined;
  }

  try {
    return JSON.parse(bodyText) as unknown;
  } catch {
    return bodyText;
  }
}

function extractErrorMessage(
  body: unknown,
  bodyText: string,
): string | undefined {
  if (typeof body === "string" && body.trim() !== "") {
    return body.trim();
  }

  if (typeof body === "object" && body !== null) {
    const error = (body as { error?: unknown }).error;
    if (typeof error === "string" && error.trim() !== "") {
      return error.trim();
    }
  }

  if (bodyText.trim() !== "") {
    return bodyText.trim();
  }

  return undefined;
}
