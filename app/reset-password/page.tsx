import Link from "next/link";

type ResetPasswordPageProps = {
  searchParams: Promise<{
    token?: string | string[];
    error?: string | string[];
  }>;
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function ResetPasswordPage({
  searchParams
}: ResetPasswordPageProps) {
  const params = await searchParams;
  const token = firstValue(params.token);
  const error = firstValue(params.error);

  if (!token) {
    return (
      <section className="card">
        <h1>Reset your password</h1>
        <p className="muted">This reset link is invalid or incomplete.</p>
        <p>
          <Link href="/forgot-password">Request a new link</Link>
        </p>
      </section>
    );
  }

  return (
    <section className="card">
      <h1>Choose a new password</h1>
      {error ? (
        <p className="muted" role="alert">
          {error === "password_mismatch"
            ? "The passwords did not match."
            : error === "invalid_password"
              ? "Use a password between 8 and 128 characters."
              : "That reset link is invalid or expired. Request a new one."}
        </p>
      ) : null}
      <form
        className="grid"
        method="post"
        action="/api/auth/password-reset/confirm-form"
      >
        <input type="hidden" name="token" value={token} />
        <label>
          New password
          <input
            name="password"
            type="password"
            required
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
          />
        </label>
        <label>
          Confirm new password
          <input
            name="confirmPassword"
            type="password"
            required
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
          />
        </label>
        <button type="submit">Update password</button>
      </form>
    </section>
  );
}
