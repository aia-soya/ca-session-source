import { ApiError } from "./errors.js";
export async function fetchJSON(fetchImpl, url, headers) {
  const response = await fetchImpl(url, { headers });
  if (!response.ok) {
    throw await buildApiError(response);
  }
  return response.json();
}
export function appendQuery(url, query) {
  if (!query) {
    return;
  }
  for (const [key, value] of Object.entries(query)) {
    if (value === void 0 || value === "") {
      continue;
    }
    url.searchParams.set(key, String(value));
  }
}
export function ensureTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}
export function stripLeadingSlash(value) {
  return value.replace(/^\/+/, "");
}
export function joinBaseUrl(baseUrl, path) {
  return ensureTrailingSlash(new URL(stripLeadingSlash(path), baseUrl).toString());
}
export function joinResourceUrl(baseUrl, path) {
  return new URL(stripLeadingSlash(path), baseUrl).toString();
}
async function buildApiError(response) {
  const bodyText = await response.text();
  const body = parseJsonBody(bodyText);
  const message = extractErrorMessage(body, bodyText) ?? `API ${response.status}`;
  return new ApiError(response.status, message, body);
}
function parseJsonBody(bodyText) {
  if (bodyText.trim() === "") {
    return void 0;
  }
  try {
    return JSON.parse(bodyText);
  } catch {
    return bodyText;
  }
}
function extractErrorMessage(body, bodyText) {
  if (typeof body === "string" && body.trim() !== "") {
    return body.trim();
  }
  if (typeof body === "object" && body !== null) {
    const error = body.error;
    if (typeof error === "string" && error.trim() !== "") {
      return error.trim();
    }
  }
  if (bodyText.trim() !== "") {
    return bodyText.trim();
  }
  return void 0;
}
