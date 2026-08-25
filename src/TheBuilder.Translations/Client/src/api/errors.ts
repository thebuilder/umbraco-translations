/**
 * The generated client's `throwOnError: true` throws the parsed response body and nothing else, so
 * a 409 is indistinguishable from a 400 and a bare-string body arrives as an object with no
 * `message`. Optimistic editing needs the status to tell "your value lost a race" apart from "your
 * value is invalid", so responses are unwrapped here instead.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }

  get isConflict(): boolean {
    return this.status === 409;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isValidation(): boolean {
    return this.status === 400;
  }
}

/** The 409 body from the message endpoints, so a conflict can be reconciled without a refetch. */
export interface MessageConflict {
  code: string;
  message: string;
  currentVersion?: number | null;
  currentValue?: string | null;
  updatedAt?: string | null;
  updatedBy?: string | null;
}

export const conflictOf = (error: unknown): MessageConflict | undefined =>
  error instanceof ApiError && error.isConflict && isRecord(error.body) && typeof error.body.code === "string"
    ? (error.body as unknown as MessageConflict)
    : undefined;

/** Normalises anything thrown by a request into an ApiError, including network failures. */
export const toApiError = (error: unknown): ApiError =>
  error instanceof ApiError ? error : new ApiError(0, messageOf(error), undefined, error);

interface ApiResult<T> {
  data?: T;
  error?: unknown;
  // Optional in the generated client: a request that never reached the server has no response.
  response?: Response;
}

/**
 * Turns a generated-client result into the value, or throws an ApiError carrying the status.
 * Callers keep receiving plain data, so this stays invisible to everything but error handling.
 */
export const unwrap = async <T>(result: Promise<ApiResult<T>>): Promise<T> => {
  const { data, error, response } = await result;
  if (!response) throw new ApiError(0, messageOf(error) || "The request did not reach the server.", codeOf(error), error);
  if (!response.ok) {
    // A message is always produced: an empty string here would surface as a blank error in the UI.
    const message = messageOf(error) || response.statusText || `The request failed with status ${response.status}.`;
    throw new ApiError(response.status, message, codeOf(error), error);
  }
  return data as T;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const codeOf = (body: unknown): string | undefined =>
  isRecord(body) && typeof body.code === "string" ? body.code : undefined;

// ASP.NET returns bare strings from BadRequest(string) and objects from ProblemDetails, so both
// shapes have to be unwrapped before falling back to the status text.
const messageOf = (body: unknown): string => {
  if (typeof body === "string") return summarise(body);
  if (body instanceof Error) return summarise(body.message);
  if (isRecord(body)) {
    for (const key of ["message", "detail", "title"] as const) {
      const value = body[key];
      if (typeof value === "string" && value.length > 0) return summarise(value);
    }
  }
  return "";
};

/** Longer than a sentence somebody wrote for a person to read, and shorter than a paragraph. */
const READABLE = 300;

/**
 * The first line of it, and not too much of that.
 *
 * An unhandled server exception puts its whole stack trace in ProblemDetails' `detail`, and this
 * message ends up in a notification a couple of lines tall: a synchronization that hit a 429
 * reported four thousand characters of middleware frames, with the one sentence explaining it
 * scrolled off the top. Every message the API means to be read is a single short line, so keeping
 * the first line loses nothing that was written for a person -- and the whole body is still on
 * `ApiError.body` for anything that wants it.
 */
const summarise = (message: string): string => {
  const first = message.split("\n", 1)[0]!.trim();
  return first.length > READABLE ? `${first.slice(0, READABLE - 1).trimEnd()}…` : first;
};
