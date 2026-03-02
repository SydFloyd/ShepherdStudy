const KNOWN_DB_UNAVAILABLE_CODES = new Set([
  "P1001", // Can't reach database server.
  "P1002", // Database server timed out.
  "P2024", // Timed out fetching a connection from the pool.
  "P2028" // Transaction API error (often pool/start timeout).
]);

const DB_UNAVAILABLE_MESSAGE_RE =
  /can't reach database server|database server.*timed out|unable to start a transaction in the given time|timed out fetching a new connection|connection (?:was )?closed|connection terminated unexpectedly/i;

type PrismaLikeError = {
  code?: string;
  message?: string;
};

export function isPrismaDatabaseUnavailableError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const prismaError = error as PrismaLikeError;
  if (typeof prismaError.code === "string") {
    if (KNOWN_DB_UNAVAILABLE_CODES.has(prismaError.code)) {
      return true;
    }
  }

  return (
    typeof prismaError.message === "string" &&
    DB_UNAVAILABLE_MESSAGE_RE.test(prismaError.message)
  );
}
