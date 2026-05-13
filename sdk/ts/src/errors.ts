export class CaSessionSourceError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CaSessionSourceError";
  }
}

export class ApiError extends CaSessionSourceError {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export class EventStreamError extends CaSessionSourceError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "EventStreamError";
  }
}
