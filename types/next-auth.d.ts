import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user?: DefaultSession["user"] & {
      id: string;
    };
  }

  interface User {
    authVersion: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    authVersion?: number;
    authInvalid?: boolean;
  }
}
