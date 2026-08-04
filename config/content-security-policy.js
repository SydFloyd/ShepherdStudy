/* eslint-disable no-undef */

function httpOrigin(value) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function directive(name, values) {
  return `${name} ${unique(values).join(" ")}`;
}

function buildContentSecurityPolicy() {
  const turnstileOrigin = "https://challenges.cloudflare.com";
  const analyticsOrigin = httpOrigin(
    process.env.NEXT_PUBLIC_ANALYTICS_SCRIPT_SRC
  );
  const sentryOrigin = httpOrigin(
    process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN
  );
  const isDevelopment = process.env.NODE_ENV === "development";

  return [
    directive("default-src", ["'self'"]),
    directive("script-src", [
      "'self'",
      "'unsafe-inline'",
      ...(isDevelopment ? ["'unsafe-eval'"] : []),
      turnstileOrigin,
      analyticsOrigin
    ]),
    directive("style-src", ["'self'", "'unsafe-inline'"]),
    directive("img-src", ["'self'", "data:", "blob:"]),
    directive("font-src", ["'self'", "data:"]),
    directive("connect-src", [
      "'self'",
      ...(isDevelopment ? ["ws:", "http:"] : []),
      turnstileOrigin,
      analyticsOrigin,
      sentryOrigin
    ]),
    directive("frame-src", [turnstileOrigin]),
    directive("worker-src", ["'self'", "blob:"]),
    directive("manifest-src", ["'self'"]),
    directive("object-src", ["'none'"]),
    directive("base-uri", ["'self'"]),
    directive("form-action", ["'self'"]),
    directive("frame-ancestors", ["'none'"]),
    "upgrade-insecure-requests",
    "report-uri /api/csp-report"
  ].join("; ");
}

module.exports = { buildContentSecurityPolicy, httpOrigin };
