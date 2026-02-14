import { headers } from "next/headers";

export const REQUEST_ID_HEADER = "x-request-id";

export function getRequestIdFromHeaders(
  values: Headers | Record<string, string | string[] | undefined>
) {
  if (values instanceof Headers) {
    return values.get(REQUEST_ID_HEADER);
  }

  const value = values[REQUEST_ID_HEADER];
  return Array.isArray(value) ? value[0] : value ?? null;
}

export async function getRequestId() {
  const headerStore = await headers();
  return headerStore.get(REQUEST_ID_HEADER) ?? "unknown";
}

