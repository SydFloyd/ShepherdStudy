import { LoginForm } from "./login-form";

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

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = await searchParams;

  return (
    <LoginForm
      initialEmail={firstValue(resolvedSearchParams.email)}
      wasRegistered={firstValue(resolvedSearchParams.registered) === "1"}
      errorCode={firstValue(resolvedSearchParams.error)}
    />
  );
}
