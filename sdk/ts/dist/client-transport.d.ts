export type QueryValue = string | number | boolean | undefined;
export declare function fetchJSON<T>(fetchImpl: typeof fetch, url: URL, headers: Headers): Promise<T>;
export declare function appendQuery(url: URL, query?: Record<string, QueryValue>): void;
export declare function ensureTrailingSlash(value: string): string;
export declare function stripLeadingSlash(value: string): string;
export declare function joinBaseUrl(baseUrl: string, path: string): string;
export declare function joinResourceUrl(baseUrl: string, path: string): string;
