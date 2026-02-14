import Link from "next/link";
import { redirect } from "next/navigation";

type LoginPageProps = {
  searchParams: Promise<{
    email?: string | string[];
    registered?: string | string[];
    error?: string | string[];
    view?: string | string[];
  }>;
};

function firstValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = await searchParams;
  const forceView = firstValue(resolvedSearchParams.view) === "1";

  if (!forceView) {
    redirect("/api/auth/signin?callbackUrl=/study");
  }

  return (
    <section className="card">
      <h1>Log in</h1>
      <p className="muted">
        Continue to the secure sign-in page.
      </p>
      <p className="muted">
        <Link href="/api/auth/signin?callbackUrl=/study">Open secure sign-in</Link>
      </p>
    </section>
  );
}
