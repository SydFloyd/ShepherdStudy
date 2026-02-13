"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";

export function Nav() {
  const { data } = useSession();

  return (
    <nav className="nav">
      <Link href="/" className="brand">
        Shepherd Study
      </Link>
      <div className="navLinks">
        <Link href="/study">Study</Link>
        <Link href="/wwjd">WWJD</Link>
        {data?.user ? (
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/" })}
            className="linkButton"
          >
            Sign out
          </button>
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
