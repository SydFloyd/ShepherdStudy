"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { useEffect, useRef, useState } from "react";

import { useAuthStatus } from "@/hooks/use-auth-status";

export function Nav() {
  const { status } = useAuthStatus();
  const isAuthenticated = status === "authenticated";
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current) {
        return;
      }
      const target = event.target as Node | null;
      if (target && menuRef.current.contains(target)) {
        return;
      }
      setMenuOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <nav className="nav">
      <Link href="/study" className="brand">
        Shepherd Study
      </Link>
      <div className="navLinks">
        <Link href="/study">Study</Link>
        <Link href="/wwjd">WWJD</Link>
        {isAuthenticated ? (
          <div className="navAccountMenu" ref={menuRef}>
            <button
              type="button"
              className="navAccountButton"
              onClick={() => setMenuOpen((current) => !current)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
            >
              Account
            </button>
            {menuOpen ? (
              <div className="navAccountDropdown" role="menu">
                <Link href="/account" onClick={() => setMenuOpen(false)} role="menuitem">
                  Settings
                </Link>
                <button
                  type="button"
                  className="navAccountSignout"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    void signOut({ callbackUrl: "/" });
                  }}
                >
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <Link href="/login">Sign in</Link>
        )}
      </div>
    </nav>
  );
}
