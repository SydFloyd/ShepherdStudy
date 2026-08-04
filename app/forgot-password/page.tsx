import Link from "next/link";

import { TurnstileSubmit } from "@/components/turnstile-submit";
import { DEFAULT_TURNSTILE_SITE_KEY } from "@/lib/turnstile-config";

type ForgotPasswordPageProps = {
  searchParams: Promise<{
    sent?: string | string[];
    error?: string | string[];
  }>;
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function ForgotPasswordPage({
  searchParams
}: ForgotPasswordPageProps) {
  const params = await searchParams;
  const sent = firstValue(params.sent) === "1";
  const error = firstValue(params.error);
  const siteKey =
    process.env.TURNSTILE_SITE_KEY?.trim() || DEFAULT_TURNSTILE_SITE_KEY;

  return (
    <section className="card">
      <h1>Reset your password</h1>
      <p>Enter your account email and we’ll send a one-time reset link.</p>
      {sent ? (
        <p>
          If an account exists for that address, a password reset link is on
          its way.
        </p>
      ) : null}
      {error ? (
        <p className="muted" role="alert">
          {error === "rate_limited"
            ? "Too many requests. Please try again later."
            : "Verification failed. Please try again."}
        </p>
      ) : null}
      <form
        className="grid"
        method="post"
        action="/api/auth/password-reset/request-form"
      >
        <label>
          Email
          <input name="email" type="email" required maxLength={254} />
        </label>
        <TurnstileSubmit siteKey={siteKey} label="Send reset link" />
      </form>
      <p className="muted">
        Remembered it? <Link href="/login">Back to login</Link>
      </p>
    </section>
  );
}
