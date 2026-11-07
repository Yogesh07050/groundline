// The one error type routes and services throw on purpose. Anything else that
// reaches the error handler is treated as a bug: logged in full, opaque to clients.
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (what: string) => new AppError(404, 'not_found', `${what} not found.`);

export const fieldError = (field: string, message: string, status = 400, code = 'validation_error') =>
  new AppError(status, code, message, { fields: { [field]: message } });
