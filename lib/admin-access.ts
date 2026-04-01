function parseAdminEmails(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }

  return raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0);
}

function getConfiguredAdminEmails(): string[] {
  const single = process.env.ADMIN_EMAIL;
  const multi = process.env.ADMIN_EMAILS;

  const merged = [single, multi].filter(Boolean).join(",");
  return parseAdminEmails(merged);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) {
    return false;
  }

  const configured = getConfiguredAdminEmails();
  if (configured.length === 0) {
    return false;
  }

  return configured.includes(email.trim().toLowerCase());
}
