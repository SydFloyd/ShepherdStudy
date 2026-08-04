"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

import { TURNSTILE_ACTION } from "@/lib/turnstile-config";

type TurnstileWidgetId = string;

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      callback: (token: string) => void;
      "error-callback": () => void;
      "expired-callback": () => void;
      "response-field": boolean;
    }
  ) => TurnstileWidgetId;
  remove: (widgetId: TurnstileWidgetId) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

type TurnstileSubmitProps = {
  siteKey: string;
  label?: string;
};

export function TurnstileSubmit({
  siteKey,
  label = "Create account"
}: TurnstileSubmitProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<TurnstileWidgetId | null>(null);
  const [token, setToken] = useState("");
  const [scriptFailed, setScriptFailed] = useState(false);

  const renderWidget = useCallback(() => {
    if (
      !window.turnstile ||
      !containerRef.current ||
      widgetIdRef.current !== null
    ) {
      return;
    }

    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      action: TURNSTILE_ACTION,
      callback: setToken,
      "expired-callback": () => setToken(""),
      "error-callback": () => setToken(""),
      "response-field": false
    });
  }, [siteKey]);

  useEffect(
    () => () => {
      if (widgetIdRef.current !== null) {
        window.turnstile?.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    },
    []
  );

  return (
    <>
      <div
        ref={containerRef}
        className="cf-turnstile"
        data-sitekey={siteKey}
        data-action={TURNSTILE_ACTION}
      />
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={renderWidget}
        onError={() => {
          setScriptFailed(true);
          setToken("");
        }}
      />
      <input type="hidden" name="cf-turnstile-response" value={token} />
      {scriptFailed ? (
        <p className="muted" role="alert">
          Verification could not load. Refresh the page to try again.
        </p>
      ) : null}
      <button type="submit" disabled={!token || scriptFailed}>
        {label}
      </button>
    </>
  );
}
