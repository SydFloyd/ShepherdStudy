import * as Sentry from "@sentry/nextjs";

export function captureServerException(
  error: unknown,
  context?: Record<string, string | number | boolean | null | undefined>
) {
  Sentry.withScope((scope) => {
    if (context) {
      for (const [key, value] of Object.entries(context)) {
        scope.setTag(key, String(value));
      }
    }
    Sentry.captureException(error);
  });
}
