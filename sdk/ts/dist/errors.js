export class CaSessionSourceError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "CaSessionSourceError";
  }
}

export class ApiError extends CaSessionSourceError {
  constructor(status, message, body) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export class EventStreamError extends CaSessionSourceError {
  constructor(message, options) {
    super(message, options);
    this.name = "EventStreamError";
  }
}
