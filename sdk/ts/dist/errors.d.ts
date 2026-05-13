export declare class CaSessionSourceError extends Error {
  constructor(message: string, options?: ErrorOptions);
}

export declare class ApiError extends CaSessionSourceError {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body?: unknown);
}

export declare class EventStreamError extends CaSessionSourceError {
  constructor(message: string, options?: ErrorOptions);
}
