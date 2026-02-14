"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const prefillEmail = params.get("email");
    const wasRegistered = params.get("registered") === "1";
    if (prefillEmail) {
      setEmail(prefillEmail);
    }
    if (wasRegistered) {
      setError("Account created. Please log in.");
    }
  }, []);

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
            type="email"
            onChange={(e) => setEmail(e.target.value)}
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
          />
        </label>
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Signing in..." : "Log in"}
        </button>
      </form>
      {error ? <p className="muted">{error}</p> : null}
      <p className="muted">
        New here? <Link href="/register">Create an account</Link>
      </p>
    </section>
  );
}
