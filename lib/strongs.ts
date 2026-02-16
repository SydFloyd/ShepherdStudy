export function normalizeStrongCode(input: string | null | undefined) {
  if (!input) {
    return null;
  }
  const upper = input.toUpperCase();
  const match = upper.match(/[GH](\d{1,6})/);
  if (!match) {
    return null;
  }
  const prefix = upper.includes("H") ? "H" : "G";
  let digits = match[1].replace(/^0+/, "");
  if (!digits) {
    digits = "0";
  }

  // UGNT strong values are often encoded with an extra trailing variant digit
  // (e.g. G30560 => G3056, G09760 => G976). Canonicalize to base Strong's.
  if (prefix === "G" && Number(digits) > 5624 && digits.length >= 4) {
    digits = digits.slice(0, -1);
    digits = digits.replace(/^0+/, "") || "0";
  }

  const numeric = String(Number(digits));
  if (!Number.isFinite(Number(numeric))) {
    return null;
  }
  return `${prefix}${numeric}`;
}

export function extractStrongCandidates(input: string | null | undefined) {
  if (!input) {
    return [];
  }
  const matches = input.toUpperCase().match(/[GH]\d{1,5}/g) ?? [];
  const normalized = matches
    .map((code) => normalizeStrongCode(code))
    .filter((code): code is string => Boolean(code));
  return Array.from(new Set(normalized));
}
