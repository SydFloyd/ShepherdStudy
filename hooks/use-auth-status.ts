"use client";

import { useCallback, useEffect, useState } from "react";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

type AuthUser = {
  id?: string;
  email?: string | null;
  name?: string | null;
};

type SessionPayload = {
  user?: AuthUser;
};

export function useAuthStatus() {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/auth/session", {
      method: "GET",
      cache: "no-store",
      credentials: "include"
    }).catch(() => null);

    if (!response?.ok) {
      setStatus("unauthenticated");
      setUser(null);
      return;
    }

    const data = (await response.json().catch(() => null)) as SessionPayload | null;
    if (data?.user?.email || data?.user?.id) {
      setStatus("authenticated");
      setUser(data.user);
      return;
    }

    setStatus("unauthenticated");
    setUser(null);
  }, []);

  useEffect(() => {
    void refresh();

    function onVisibility() {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    }

    window.addEventListener("focus", onVisibility);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onVisibility);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  return { status, user, refresh };
}
