"use client";

import Link from "next/link";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { parseJsonSafe } from "@/lib/study-client-utils";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedName = name.trim();

    let response: Response;
    try {
      response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: normalizedName,
          email: normalizedEmail,
          password
        })
      });
    } catch {
      setError("Unable to reach registration service. Please try again.");
      setIsSubmitting(false);
      return;
    }

    if (!response.ok) {
      const data = (await parseJsonSafe(response)) as { error?: string };
      setError(data.error ?? "Unable to create account.");
      setIsSubmitting(false);
      return;
    }

    try {
      const signInResult = await signIn("credentials", {
        email: normalizedEmail,
        password,
        redirect: false
      });

      if (signInResult?.error) {
        Sentry.withScope((scope) => {
          scope.setTag("event", "register_auto_login_fallback");
          scope.setTag("source", "register_page");
          scope.setLevel("info");
          scope.setExtra("reason", signInResult.error);
          scope.setExtra("emailDomain", normalizedEmail.split("@")[1] ?? "unknown");
          Sentry.captureMessage("register_auto_login_fallback");
        });
        router.push(`/login?registered=1&email=${encodeURIComponent(normalizedEmail)}`);
        router.refresh();
        return;
      }
    } catch {
      Sentry.withScope((scope) => {
        scope.setTag("event", "register_auto_login_fallback");
        scope.setTag("source", "register_page");
        scope.setLevel("info");
        scope.setExtra("reason", "sign_in_exception");
        scope.setExtra("emailDomain", normalizedEmail.split("@")[1] ?? "unknown");
        Sentry.captureMessage("register_auto_login_fallback");
      });
      router.push(`/login?registered=1&email=${encodeURIComponent(normalizedEmail)}`);
      router.refresh();
      return;
    }

    router.push("/study");
    router.refresh();
  }

  return (
    <section className="card">
      <h1>Create account</h1>
      <form className="grid" onSubmit={onSubmit}>
        <label>
          Name (optional)
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
          />
        </label>
        <label>
          Email
          <input
            value={email}
            type="email"
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />
        </label>
        <label>
          Password
          <input
            value={password}
            type="password"
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </label>
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Creating..." : "Create account"}
        </button>
      </form>
      {error ? <p className="muted">{error}</p> : null}
      <p className="muted">
        Already have an account? <Link href="/login">Log in</Link>
      </p>
    </section>
  );
}
