import Link from "next/link";

import { TurnstileSubmit } from "@/components/turnstile-submit";
import { DEFAULT_TURNSTILE_SITE_KEY } from "@/lib/turnstile-config";

type RegisterPageProps = {
  searchParams: Promise<{
    error?: string | string[];
    email?: string | string[];
    name?: string | string[];
  }>;
};

function firstValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const resolvedSearchParams = await searchParams;
  const error = firstValue(resolvedSearchParams.error);
  const email = firstValue(resolvedSearchParams.email);
  const name = firstValue(resolvedSearchParams.name);
  const siteKey =
    process.env.TURNSTILE_SITE_KEY?.trim() || DEFAULT_TURNSTILE_SITE_KEY;

  return (
    <section className="card">
      <h1>Create account</h1>
      <form className="grid" method="post" action="/api/register-form">
        <label>
          Name (optional)
          <input name="name" defaultValue={name} placeholder="Your name" />
        </label>
        <label>
          Email
          <input
            name="email"
            type="email"
            defaultValue={email}
            placeholder="you@example.com"
            required
            autoComplete="email"
          />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            required
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
          />
        </label>
        <TurnstileSubmit siteKey={siteKey} />
      </form>
      {error ? <p className="muted">{error}</p> : null}
      <p className="muted">
        Already have an account? <Link href="/login">Log in</Link>
      </p>
    </section>
  );
}
