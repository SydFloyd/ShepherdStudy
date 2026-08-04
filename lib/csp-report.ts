type CspViolation = {
  documentPath: string;
  blockedTarget: string;
  directive: string;
  disposition: string;
};

function safeText(value: unknown, maximum: number) {
  return typeof value === "string" ? value.slice(0, maximum) : "unknown";
}

function safeDirective(value: unknown) {
  const directive = safeText(value, 64).toLowerCase();
  return /^[a-z0-9-]+$/.test(directive) ? directive : "unknown";
}

function safeResource(value: unknown) {
  if (typeof value !== "string" || !value) {
    return "unknown";
  }
  if (["inline", "eval"].includes(value)) {
    return value;
  }
  if (value.startsWith("data:")) {
    return "data:";
  }
  if (value.startsWith("blob:")) {
    return "blob:";
  }

  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`.slice(0, 512);
  } catch {
    return "invalid-url";
  }
}

function safeBlockedResource(value: unknown) {
  const resource = safeResource(value);
  if (
    ["unknown", "inline", "eval", "data:", "blob:", "invalid-url"].includes(
      resource
    )
  ) {
    return resource;
  }

  try {
    return new URL(resource).origin;
  } catch {
    return "invalid-url";
  }
}

function violationFromBody(body: Record<string, unknown>): CspViolation {
  return {
    documentPath: safeResource(body.documentURL ?? body["document-uri"]),
    blockedTarget: safeBlockedResource(
      body.blockedURL ?? body["blocked-uri"]
    ),
    directive: safeDirective(
      body.effectiveDirective ?? body["effective-directive"]
    ),
    disposition: safeText(body.disposition, 16)
  };
}

export function extractCspViolations(payload: unknown): CspViolation[] {
  if (Array.isArray(payload)) {
    return payload
      .slice(0, 10)
      .flatMap((report) => {
        if (!report || typeof report !== "object") {
          return [];
        }
        const body = (report as { body?: unknown }).body;
        return body && typeof body === "object" && !Array.isArray(body)
          ? [violationFromBody(body as Record<string, unknown>)]
          : [];
      });
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return [];
  }
  const legacy = (payload as { "csp-report"?: unknown })["csp-report"];
  return legacy && typeof legacy === "object" && !Array.isArray(legacy)
    ? [violationFromBody(legacy as Record<string, unknown>)]
    : [];
}

export const __testables = { safeBlockedResource, safeResource };
