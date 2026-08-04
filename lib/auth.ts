import bcrypt from "bcryptjs";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

import {
  checkLoginRateLimit,
  clearLoginAccountFailures,
  recordLoginFailure
} from "@/lib/auth-rate-limit";
import { logEvent } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getRequestIdFromHeaders } from "@/lib/request-context";

const isProduction = process.env.NODE_ENV === "production";
const DUMMY_PASSWORD_HASH =
  "$2a$12$WxRHto5.ew3mUPD8Q.ff0eqsFed0Za6XH0CSWvnCMYW35NgbHe9hK";

if (isProduction && !process.env.NEXTAUTH_SECRET) {
  throw new Error("NEXTAUTH_SECRET is required in production.");
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  useSecureCookies: isProduction,
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 14
  },
  pages: {
    signIn: "/login"
  },
  providers: [
    CredentialsProvider({
      name: "Email & Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials, request) {
        const rawEmail = credentials?.email?.trim();
        const password = credentials?.password;
        if (
          !rawEmail ||
          rawEmail.length > 254 ||
          !password ||
          password.length > 128
        ) {
          return null;
        }

        const normalizedEmail = rawEmail.normalize("NFKC").toLowerCase();
        const requestHeaders = request.headers ?? {};
        const requestId = getRequestIdFromHeaders(requestHeaders) ?? "unknown";
        try {
          const rateLimit = await checkLoginRateLimit({
            headers: requestHeaders,
            normalizedEmail
          });
          if (!rateLimit.allowed) {
            logEvent("warn", "auth.login_rate_limited", {
              requestId,
              scope: rateLimit.scope,
              retryAfterSeconds: rateLimit.retryAfterSeconds
            });
            return null;
          }
        } catch (error) {
          logEvent("error", "auth.login_rate_limit_failure", {
            requestId,
            error
          });
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: normalizedEmail }
        });

        const validPassword = await bcrypt.compare(
          password,
          user?.passwordHash ?? DUMMY_PASSWORD_HASH
        );

        if (!user || !validPassword) {
          try {
            const rateLimit = await recordLoginFailure({
              headers: requestHeaders,
              normalizedEmail
            });
            if (!rateLimit.allowed) {
              logEvent("warn", "auth.login_rate_limited", {
                requestId,
                scope: rateLimit.scope,
                retryAfterSeconds: rateLimit.retryAfterSeconds
              });
            }
          } catch (error) {
            logEvent("error", "auth.login_failure_recording_failed", {
              requestId,
              error
            });
          }
          return null;
        }

        try {
          await clearLoginAccountFailures({
            headers: requestHeaders,
            normalizedEmail
          });
        } catch (error) {
          logEvent("warn", "auth.login_failure_cleanup_failed", {
            requestId,
            error
          });
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? undefined
        };
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }

      return session;
    }
  }
};
