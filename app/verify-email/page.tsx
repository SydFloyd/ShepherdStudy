import Link from "next/link";

import { TurnstileSubmit } from "@/components/turnstile-submit";
import { DEFAULT_TURNSTILE_SITE_KEY } from "@/lib/turnstile-config";

type VerifyEmailPageProps = {
  searchParams: Promise<{
    registered?: string | string[];
    sent?: string | string[];
    delivery?: string | string[];
    error?: string | string[];
  }>;
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function VerifyEmailPage({
  searchParams
}: VerifyEmailPageProps) {
  const params = await searchParams;
  const registered = firstValue(params.registered) === "1";
  const sent = firstValue(params.sent) === "1";
  const deliveryFailed = firstValue(params.delivery) === "failed";
  const error = firstValue(params.error);
  const siteKey =
    process.env.TURNSTILE_SITE_KEY?.trim() || DEFAULT_TURNSTILE_SITE_KEY;

  return (
    <section className="card">
      <h1>Verify your email</h1>
      {registered ? (
        <p>Account created. Check your inbox for a verification link.</p>
      ) : null}
      {sent ? (
        <p>
          If that address belongs to an unverified account, a new link is on
          its way.
        </p>
      ) : null}
      {deliveryFailed ? (
        <p className="muted" role="alert">
          We could not send the first message. You can request another link
          below.
        </p>
      ) : null}
      {error === "invalid" ? (
        <p className="muted" role="alert">
          That verification link is invalid or expired. Request a fresh one.
        </p>
      ) : null}
      {error === "unavailable" ? (
        <p className="muted" role="alert">
          Verification is temporarily unavailable. Please try again.
        </p>
      ) : null}
      {error === "verification" || error === "rate_limited" ? (
        <p className="muted" role="alert">
          {error === "rate_limited"
            ? "Too many requests. Please try again later."
            : "Verification failed. Please try again."}
        </p>
      ) : null}

      <form
        className="grid"
        method="post"
        action="/api/auth/verification/request-form"
      >
        <label>
          Email
          <input name="email" type="email" required maxLength={254} />
        </label>
        <TurnstileSubmit siteKey={siteKey} label="Send verification link" />
      </form>
      <p className="muted">
        Already verified? <Link href="/login">Log in</Link>
      </p>
    </section>
  );
}
