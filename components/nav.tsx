"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { MouseEvent as ReactMouseEvent, useEffect, useRef, useState } from "react";

import { useAuthStatus } from "@/hooks/use-auth-status";

export function Nav() {
  const { status } = useAuthStatus();
  const pathname = usePathname();
  const isAuthenticated = status === "authenticated";
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (target && accountMenuRef.current?.contains(target)) {
        return;
      }
      if (target && mobileMenuRef.current?.contains(target)) {
        return;
      }
      setAccountMenuOpen(false);
      setMobileMenuOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setAccountMenuOpen(false);
        setMobileMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    setAccountMenuOpen(false);
    setMobileMenuOpen(false);
  }, [pathname]);

  const studyHref = pathname === "/study" ? "/study?new=1" : "/study";

  function isRouteActive(route: string) {
    if (route === "/study") {
      return pathname === "/study";
    }
    return pathname === route || pathname.startsWith(`${route}/`);
  }

  function navLinkClass(route: string) {
    return `navRouteLink${isRouteActive(route) ? " navRouteLinkActive" : ""}`;
  }

  function triggerNewStudyIfOnStudy(event: ReactMouseEvent<HTMLAnchorElement>) {
    if (pathname !== "/study") {
      return;
    }
    event.preventDefault();
    window.dispatchEvent(new CustomEvent("study:new"));
  }

  return (
    <nav className="nav">
      <Link href={studyHref} className="brand" onClick={triggerNewStudyIfOnStudy}>
        <span className="brandText">{"\u2020"} ShepherdStudy</span>
      </Link>
      <div className="navMobileMenu" ref={mobileMenuRef}>
        <button
          type="button"
          className="navMobileToggle"
          onClick={() => {
            setMobileMenuOpen((current) => !current);
            setAccountMenuOpen(false);
          }}
          aria-expanded={mobileMenuOpen}
          aria-haspopup="menu"
        >
          Menu
        </button>
        {mobileMenuOpen ? (
          <div className="navMobileDropdown" role="menu">
            <Link
              href={studyHref}
              className={navLinkClass("/study")}
              onClick={triggerNewStudyIfOnStudy}
              role="menuitem"
            >
              Study
            </Link>
            <Link href="/compare" className={navLinkClass("/compare")} role="menuitem">
              Compare
            </Link>
            <Link
              href="/word-lens"
              className={navLinkClass("/word-lens")}
              role="menuitem"
            >
              Interlinear
            </Link>
            {isAuthenticated ? (
              <>
                <Link href="/account" role="menuitem">
                  Settings
                </Link>
                <button
                  type="button"
                  className="navAccountSignout"
                  role="menuitem"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    void signOut({ callbackUrl: "/" });
                  }}
                >
                  Sign out
                </button>
              </>
            ) : (
              <Link href="/login" role="menuitem">
                Sign in
              </Link>
            )}
          </div>
        ) : null}
      </div>
      <div className="navLinks">
        <Link
          href={studyHref}
          className={navLinkClass("/study")}
          onClick={triggerNewStudyIfOnStudy}
        >
          Study
        </Link>
        <Link href="/compare" className={navLinkClass("/compare")}>
          Compare
        </Link>
        <Link href="/word-lens" className={navLinkClass("/word-lens")}>
          Interlinear
        </Link>
        {isAuthenticated ? (
          <div className="navAccountMenu" ref={accountMenuRef}>
            <button
              type="button"
              className="navAccountButton"
              onClick={() => {
                setAccountMenuOpen((current) => !current);
                setMobileMenuOpen(false);
              }}
              aria-expanded={accountMenuOpen}
              aria-haspopup="menu"
            >
              Account
            </button>
            {accountMenuOpen ? (
              <div className="navAccountDropdown" role="menu">
                <Link href="/account" onClick={() => setAccountMenuOpen(false)} role="menuitem">
                  Settings
                </Link>
                <button
                  type="button"
                  className="navAccountSignout"
                  role="menuitem"
                  onClick={() => {
                    setAccountMenuOpen(false);
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
