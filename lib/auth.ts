import bcrypt from "bcryptjs";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

import { logEvent } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const isProduction = process.env.NODE_ENV === "production";

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
  providers: [
    CredentialsProvider({
      name: "Email & Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials, req) {
        const requestHost =
          (req?.headers?.host as string | undefined) ??
          (req?.headers?.["x-forwarded-host"] as string | undefined);
        const userAgent =
          (req?.headers?.["user-agent"] as string | undefined) ?? "unknown";

        if (!credentials?.email || !credentials.password) {
          logEvent("warn", "auth.authorize.missing_credentials", {
            route: "/api/auth/callback/credentials",
            host: requestHost,
            userAgent
          });
          return null;
        }

        const normalizedEmail = credentials.email.toLowerCase();
        const user = await prisma.user.findUnique({
          where: { email: normalizedEmail }
        });

        if (!user) {
          logEvent("warn", "auth.authorize.user_not_found", {
            route: "/api/auth/callback/credentials",
            host: requestHost,
            userAgent,
            email: normalizedEmail
          });
          return null;
        }

        const validPassword = await bcrypt.compare(
          credentials.password,
          user.passwordHash
        );

        if (!validPassword) {
          logEvent("warn", "auth.authorize.invalid_password", {
            route: "/api/auth/callback/credentials",
            host: requestHost,
            userAgent,
            userId: user.id
          });
          return null;
        }

        logEvent("info", "auth.authorize.success", {
          route: "/api/auth/callback/credentials",
          host: requestHost,
          userAgent,
          userId: user.id
        });
        return {
          id: user.id,
          email: user.email,
          name: user.name ?? undefined
        };
      }
    })
  ],
  callbacks: {
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) {
        return `${baseUrl}${url}`;
      }

      try {
        const target = new URL(url);
        const allowed = new URL(baseUrl);
        if (target.origin === allowed.origin) {
          return url;
        }
      } catch {
        // Ignore invalid redirect targets and fall back to base URL.
      }

      return baseUrl;
    },
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
