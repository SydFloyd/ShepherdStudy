import { PrismaClient } from "@prisma/client";

declare global {
  var prisma: PrismaClient | undefined;
}

export const prisma =
  global.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    transactionOptions: {
      // Reduce transient quota transaction failures during short DB/pool stalls.
      maxWait: 10_000,
      timeout: 15_000
    }
  });

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}
