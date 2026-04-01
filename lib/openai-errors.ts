type OpenAiErrorLike = {
  status?: unknown;
  code?: unknown;
  type?: unknown;
  message?: unknown;
};

export type OpenAiUserFacingError = {
  status: number;
  code: string | null;
  message: string;
};

function asString(input: unknown): string | null {
  return typeof input === "string" && input.trim().length > 0 ? input : null;
}

function asNumber(input: unknown): number | null {
  return typeof input === "number" && Number.isFinite(input) ? input : null;
}

export function mapOpenAiErrorToResponse(
  error: unknown
): OpenAiUserFacingError | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  const maybe = error as OpenAiErrorLike;
  const status = asNumber(maybe.status);
  const code = asString(maybe.code);
  const type = asString(maybe.type);
  const message = asString(maybe.message)?.toLowerCase() ?? "";
  const errorKey = code ?? type ?? null;

  const isInsufficientQuota =
    code === "insufficient_quota" ||
    type === "insufficient_quota" ||
    message.includes("exceeded your current quota");

  if (isInsufficientQuota) {
    return {
      status: 429,
      code: errorKey,
      message:
        "OpenAI quota is unavailable for the configured API key/project. Verify billing and use a key from the billed OpenAI project."
    };
  }

  if (status === 429) {
    return {
      status: 429,
      code: errorKey,
      message:
        "OpenAI rate limit reached. Please wait briefly and try again."
    };
  }

  if (status === 401 || status === 403) {
    return {
      status,
      code: errorKey,
      message:
        "OpenAI credentials are not authorized for this request. Verify OPENAI_API_KEY (and OPENAI_PROJECT if used)."
    };
  }

  if (status && status >= 500) {
    return {
      status: 502,
      code: errorKey,
      message:
        "OpenAI is temporarily unavailable. Please retry in a moment."
    };
  }

  return null;
}
