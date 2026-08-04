const DEFAULT_MAX_BODY_BYTES = 256 * 1024;

type RequestBodyErrorCode =
  | "body_too_large"
  | "invalid_content_length"
  | "invalid_json"
  | "invalid_form_encoding";

export class RequestBodyError extends Error {
  readonly code: RequestBodyErrorCode;
  readonly status: 400 | 413 | 415;

  constructor(input: {
    code: RequestBodyErrorCode;
    message: string;
    status: 400 | 413 | 415;
  }) {
    super(input.message);
    this.name = "RequestBodyError";
    this.code = input.code;
    this.status = input.status;
  }
}

function assertContentLength(request: Request, maxBytes: number) {
  const rawLength = request.headers.get("content-length");
  if (!rawLength) {
    return;
  }

  const contentLength = Number(rawLength);
  if (!Number.isSafeInteger(contentLength) || contentLength < 0) {
    throw new RequestBodyError({
      code: "invalid_content_length",
      message: "Invalid Content-Length header.",
      status: 400
    });
  }

  if (contentLength > maxBytes) {
    throw new RequestBodyError({
      code: "body_too_large",
      message: "Request body is too large.",
      status: 413
    });
  }
}

export async function readRequestBodyText(
  request: Request,
  maxBytes = DEFAULT_MAX_BODY_BYTES
) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new TypeError("maxBytes must be a positive safe integer.");
  }

  assertContentLength(request, maxBytes);

  if (!request.body) {
    return "";
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let body = "";
  let bytesRead = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      bytesRead += value.byteLength;
      if (bytesRead > maxBytes) {
        await reader.cancel("Request body is too large.");
        throw new RequestBodyError({
          code: "body_too_large",
          message: "Request body is too large.",
          status: 413
        });
      }

      body += decoder.decode(value, { stream: true });
    }

    body += decoder.decode();
    return body;
  } catch (error) {
    if (error instanceof RequestBodyError) {
      throw error;
    }

    throw new RequestBodyError({
      code: "invalid_json",
      message: "Request body must be valid UTF-8.",
      status: 400
    });
  } finally {
    reader.releaseLock();
  }
}

export async function readJsonBody(
  request: Request,
  maxBytes = DEFAULT_MAX_BODY_BYTES
): Promise<unknown> {
  const body = await readRequestBodyText(request, maxBytes);

  try {
    return JSON.parse(body);
  } catch {
    throw new RequestBodyError({
      code: "invalid_json",
      message: "Request body must contain valid JSON.",
      status: 400
    });
  }
}

export async function readUrlEncodedBody(
  request: Request,
  maxBytes = 16 * 1024
) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/x-www-form-urlencoded")) {
    throw new RequestBodyError({
      code: "invalid_form_encoding",
      message: "Form body must be URL encoded.",
      status: 415
    });
  }

  return new URLSearchParams(await readRequestBodyText(request, maxBytes));
}

export function requestBodyErrorResponse(error: unknown): Response | null {
  if (!(error instanceof RequestBodyError)) {
    return null;
  }

  return Response.json(
    { error: error.message },
    {
      status: error.status,
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
