export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Extra fields returned with the error (e.g. what a conflict is about). */
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}
