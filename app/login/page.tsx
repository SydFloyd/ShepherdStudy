import Link from "next/link";
import { headers } from "next/headers";

type LoginPageProps = {
  searchParams: Promise<{
    email?: string | string[];
    registered?: string | string[];
    error?: string | string[];
  }>;
};

function firstValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

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

async function getCsrfToken(): Promise<string | null> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  if (!host) {
    return null;
  }

  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const csrfResponse = await fetch(`${protocol}://${host}/api/auth/csrf`, {
    cache: "no-store"
  }).catch(() => null);

  if (!csrfResponse?.ok) {
    return null;
  }

  const csrfPayload = (await csrfResponse.json().catch(() => null)) as
    | { csrfToken?: string }
    | null;
  return csrfPayload?.csrfToken ?? null;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = await searchParams;
  const email = firstValue(resolvedSearchParams.email);
  const wasRegistered = firstValue(resolvedSearchParams.registered) === "1";
  const authError = mapAuthError(firstValue(resolvedSearchParams.error));
  const csrfToken = await getCsrfToken();

  return (
    <section className="card">
      <h1>Log in</h1>
      {csrfToken ? (
        <form className="grid" method="post" action="/api/auth/callback/credentials">
          <input type="hidden" name="csrfToken" value={csrfToken} />
          <input type="hidden" name="callbackUrl" value="/study" />
          <label>
            Email
            <input name="email" type="email" defaultValue={email} required />
          </label>
          <label>
            Password
            <input name="password" type="password" required />
          </label>
          <button type="submit">Log in</button>
        </form>
      ) : (
        <p className="muted">
          Unable to load secure login form. Use the{" "}
          <Link href="/api/auth/signin?callbackUrl=/study">secure sign-in page</Link>.
        </p>
      )}
      {wasRegistered ? <p className="muted">Account created. Please log in.</p> : null}
      {authError ? <p className="muted">{authError}</p> : null}
      <p className="muted">
        New here? <Link href="/register">Create an account</Link>
      </p>
    </section>
  );
}
