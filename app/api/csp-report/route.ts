import { extractCspViolations } from "@/lib/csp-report";
import { getRequestMeta, logEvent } from "@/lib/logger";
import {
  readJsonBody,
  requestBodyErrorResponse
} from "@/lib/request-body";
import { getRequestId } from "@/lib/request-context";

const ALLOWED_CONTENT_TYPES = [
  "application/csp-report",
  "application/reports+json",
  "application/json"
];

export async function POST(request: Request) {
  const requestId = await getRequestId();
  const requestMeta = getRequestMeta({
    requestId,
    route: "/api/csp-report",
    method: request.method
  });
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!ALLOWED_CONTENT_TYPES.some((type) => contentType.startsWith(type))) {
    return new Response(null, {
      status: 415,
      headers: { "Cache-Control": "no-store" }
    });
  }

  try {
    const violations = extractCspViolations(
      await readJsonBody(request, 32 * 1024)
    );
    if (violations.length > 0) {
      logEvent("warn", "csp.violation", {
        ...requestMeta,
        violations
      });
    }
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    return (
      requestBodyErrorResponse(error) ??
      new Response(null, {
        status: 400,
        headers: { "Cache-Control": "no-store" }
      })
    );
  }
}
