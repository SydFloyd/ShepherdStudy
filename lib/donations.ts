const DEFAULT_MINIMUM_CENTS = 300;
const DEFAULT_MAXIMUM_CENTS = 50_000;
const STRIPE_MINIMUM_CENTS = 50;
const HARD_MAXIMUM_CENTS = 1_000_000;

export type DonationLimits = {
  minimumCents: number;
  maximumCents: number;
};

function parseUsdCents(value: string | undefined) {
  const normalized = value?.trim() ?? "";
  const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) {
    return null;
  }

  const dollars = Number(match[1]);
  const cents = Number((match[2] ?? "").padEnd(2, "0"));
  const total = dollars * 100 + cents;
  return Number.isSafeInteger(total) ? total : null;
}

function configuredLimit(
  value: string | undefined,
  fallback: number,
  minimum: number
) {
  const parsed = parseUsdCents(value);
  if (parsed === null || parsed < minimum) {
    return fallback;
  }
  return Math.min(parsed, HARD_MAXIMUM_CENTS);
}

export function getDonationLimits(): DonationLimits {
  const minimumCents = configuredLimit(
    process.env.DONATION_MIN_USD,
    DEFAULT_MINIMUM_CENTS,
    STRIPE_MINIMUM_CENTS
  );
  const configuredMaximum = configuredLimit(
    process.env.DONATION_MAX_USD,
    DEFAULT_MAXIMUM_CENTS,
    STRIPE_MINIMUM_CENTS
  );

  return {
    minimumCents,
    maximumCents: Math.max(minimumCents, configuredMaximum)
  };
}

export function parseDonationAmount(
  value: string,
  limits = getDonationLimits()
) {
  const cents = parseUsdCents(value);
  if (
    cents === null ||
    cents < limits.minimumCents ||
    cents > limits.maximumCents
  ) {
    return null;
  }
  return cents;
}

export function formatUsdInput(cents: number) {
  return (cents / 100).toFixed(2);
}

function isLocalHostname(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

export function getDonationOrigin(requestUrl?: string) {
  const configured = process.env.NEXTAUTH_URL?.trim();
  const candidate = configured || requestUrl;
  if (!candidate) {
    throw new Error("NEXTAUTH_URL is required to create donation checkout links.");
  }

  const url = new URL(candidate);
  if (
    url.username ||
    url.password ||
    (url.protocol !== "https:" &&
      !(url.protocol === "http:" && isLocalHostname(url.hostname)))
  ) {
    throw new Error("Donation checkout requires a trusted HTTPS origin.");
  }

  return url.origin;
}

export const __testables = {
  DEFAULT_MAXIMUM_CENTS,
  DEFAULT_MINIMUM_CENTS,
  HARD_MAXIMUM_CENTS,
  parseUsdCents
};
