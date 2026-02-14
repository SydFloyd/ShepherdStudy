"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
  const router = useRouter();
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const queryError = mapAuthError(errorCode);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const result = await signIn("credentials", {
      email: email.trim().toLowerCase(),
      password,
      redirect: false
    }).catch(() => null);

    if (!result || result.error || result.ok !== true) {
      setError("Unable to sign in. Check your email and password.");
      setIsSubmitting(false);
      return;
    }

    router.push("/study");
    router.refresh();
  }

  return (
    <section className="card">
      <h1>Log in</h1>
      <form className="grid" onSubmit={onSubmit}>
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
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Signing in..." : "Log in"}
        </button>
      </form>
      {wasRegistered ? <p className="muted">Account created. Please log in.</p> : null}
      {error ? <p className="muted">{error}</p> : null}
      {!error && queryError ? <p className="muted">{queryError}</p> : null}
      <p className="muted">
        New here? <Link href="/register">Create an account</Link>
      </p>
    </section>
  );
}
