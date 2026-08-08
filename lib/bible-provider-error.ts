export type BibleProviderErrorCode =
  | "unavailable"
  | "invalid_response"
  | "not_found"
  | "quota_exhausted"
  | "request_too_large"
  | "not_configured";

export class BibleProviderError extends Error {
  constructor(
    message: string,
    readonly provider: "dbs" | "esv",
    readonly code: BibleProviderErrorCode,
    readonly status?: number,
    readonly retryAfterSeconds?: number
  ) {
    super(message);
    this.name = "BibleProviderError";
  }
}

export function getBibleProviderPublicError(error: BibleProviderError) {
  if (error.provider === "esv") {
    if (error.code === "quota_exhausted" || error.status === 429) {
      return {
        message:
          "The shared ESV request allowance is temporarily exhausted. Please try another translation or return later.",
        status: 429,
        retryAfterSeconds: error.retryAfterSeconds
      };
    }
    if (error.code === "request_too_large") {
      return {
        message:
          "That ESV selection is larger than the edition's usage limits. Please choose a shorter passage.",
        status: 400,
        retryAfterSeconds: undefined
      };
    }
    if (error.code === "not_configured") {
      return {
        message:
          "ESV text is not configured right now. Please choose another translation.",
        status: 503,
        retryAfterSeconds: undefined
      };
    }
    return {
      message:
        "ESV text is temporarily unavailable. Please try again or choose another translation.",
      status: error.code === "not_found" ? 404 : 503,
      retryAfterSeconds: error.retryAfterSeconds
    };
  }

  return {
    message: "The selected Bible edition is temporarily unavailable.",
    status: error.code === "not_found" ? 404 : 503,
    retryAfterSeconds: error.retryAfterSeconds
  };
}

export function bibleProviderErrorResponse(error: BibleProviderError) {
  const mapped = getBibleProviderPublicError(error);
  const headers = mapped.retryAfterSeconds
    ? { "Retry-After": String(mapped.retryAfterSeconds) }
    : undefined;
  return Response.json(
    { error: mapped.message, provider: error.provider },
    { status: mapped.status, headers }
  );
}
