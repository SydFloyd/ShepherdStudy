import bcrypt from "bcryptjs";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

import { prisma } from "@/lib/prisma";

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
      async authorize(credentials) {
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
        const user = await prisma.user.findUnique({
          where: { email: normalizedEmail }
        });

        const validPassword = await bcrypt.compare(
          password,
          user?.passwordHash ?? DUMMY_PASSWORD_HASH
        );

        if (!user || !validPassword) {
          return null;
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
