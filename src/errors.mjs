export class ApiError extends Error {
  constructor(status, code, message, retryAfterSeconds) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export const badUpstream = () => new ApiError(502, 'UPSTREAM_DATA_INVALID',
  'Panta returned an unsupported response. No evidence brief was created.');
