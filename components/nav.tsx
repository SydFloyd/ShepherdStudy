"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";

import { useAuthStatus } from "@/hooks/use-auth-status";

export function Nav() {
  const { status } = useAuthStatus();
  const isAuthenticated = status === "authenticated";

  return (
    <nav className="nav">
      <Link href="/" className="brand">
        Shepherd Study
      </Link>
      <div className="navLinks">
        <Link href="/study">Study</Link>
        <Link href="/wwjd">WWJD</Link>
        {isAuthenticated ? (
          <>
            <Link href="/account">Account</Link>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/" })}
              className="linkButton"
            >
              Sign out
            </button>
          </>
        ) : (
          <>
            <Link href="/login">Login</Link>
            <Link href="/register">Register</Link>
          </>
        )}
      </div>
    </nav>
  );
}
