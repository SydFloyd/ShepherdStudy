type LogLevel = "info" | "warn" | "error";

const REDACT_KEYS = new Set([
  "password",
  "passwordHash",
  "authorization",
  "cookie",
  "set-cookie",
  "content",
  "message",
  "prompt",
  "history",
  "query",
  "usertext",
  "reply",
  "answer",
  "context",
  "email",
  "token",
  "tokenhash",
  "apikey",
  "api_key"
]);

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item));
  }

  if (value && typeof value === "object") {
    const input = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};

    for (const [key, next] of Object.entries(input)) {
      if (REDACT_KEYS.has(key.toLowerCase())) {
        output[key] = "[redacted]";
      } else if (next instanceof Error) {
        output[key] = {
          name: next.name,
          message: next.message,
          stack: process.env.NODE_ENV === "production" ? undefined : next.stack
        };
      } else {
        output[key] = sanitize(next);
      }
    }

    return output;
  }

  return value;
}

export function logEvent(
  level: LogLevel,
  event: string,
  meta: Record<string, unknown> = {}
) {
  const sanitizedMeta = sanitize(meta) as Record<string, unknown>;
  const payload = {
    level,
    event,
    ts: new Date().toISOString(),
    ...sanitizedMeta
  };

  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.info(line);
}

export function getRequestMeta(input: {
  requestId: string;
  route: string;
  method?: string;
  userId?: string | null;
}) {
  return {
    requestId: input.requestId,
    route: input.route,
    method: input.method,
    userId: input.userId ?? undefined
  };
}
