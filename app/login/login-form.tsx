"use client";

import Link from "next/link";
import { getCsrfToken } from "next-auth/react";
import { useEffect, useState } from "react";

type LoginFormProps = {
  initialEmail: string;
  wasRegistered: boolean;
  errorCode: string;
};

function mapAuthError(errorCode: string): string {
  switch (errorCode) {
    case "CredentialsSignin":
      return "Unable to sign in. Check your email and password.";
    case "AccessDenied":
      return "Access denied for this account.";
    case "Configuration":
      return "Authentication is temporarily unavailable.";
    default:
      return errorCode ? "Unable to sign in." : "";
  }
}

export function LoginForm({ initialEmail, wasRegistered, errorCode }: LoginFormProps) {
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [csrfToken, setCsrfToken] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const queryError = mapAuthError(errorCode);

  useEffect(() => {
    getCsrfToken()
      .then((token) => {
        if (token) {
          setCsrfToken(token);
        }
      })
      .catch(() => {
        setCsrfToken("");
      });
  }, []);

  return (
    <section className="card">
      <h1>Log in</h1>
      <form
        className="grid"
        method="post"
        action="/api/auth/callback/credentials"
        onSubmit={() => setIsSubmitting(true)}
      >
        <input type="hidden" name="csrfToken" value={csrfToken} />
        <input type="hidden" name="callbackUrl" value="/study" />
        <label>
          Email
          <input
            value={email}
            name="email"
            type="email"
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            value={password}
            name="password"
            type="password"
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <button type="submit" disabled={isSubmitting || !csrfToken}>
          {isSubmitting ? "Signing in..." : "Log in"}
        </button>
      </form>
      {wasRegistered ? <p className="muted">Account created. Please log in.</p> : null}
      {queryError ? <p className="muted">{queryError}</p> : null}
      {!csrfToken ? (
        <p className="muted">Preparing secure sign-in...</p>
      ) : null}
      <p className="muted">
        New here? <Link href="/register">Create an account</Link>
      </p>
    </section>
  );
}
