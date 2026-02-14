import { NextRequest, NextResponse } from "next/server";

import { logEvent } from "@/lib/logger";
import { REQUEST_ID_HEADER } from "@/lib/request-context";

export function proxy(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders
    }
  });

  response.headers.set(REQUEST_ID_HEADER, requestId);

  logEvent("info", "request.received", {
    requestId,
    method: req.method,
    path: req.nextUrl.pathname
  });

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
