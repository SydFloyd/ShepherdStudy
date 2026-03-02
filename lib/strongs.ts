export function normalizeStrongCode(input: string | null | undefined) {
  if (!input) {
    return null;
  }
  const upper = input.toUpperCase();
  const match = upper.match(/([GH])(\d{1,6})/);
  if (!match) {
    return null;
  }
  const prefix = match[1];
  const rawDigits = match[2];
  let digits = rawDigits.replace(/^0+/, "");
  if (!digits) {
    digits = "0";
  }

  // UGNT strong values are commonly encoded as five digits where the last
  // digit is a variant marker (typically 0): G00320 => G32, G35880 => G3588.
  // Trim that marker while preserving normal/padded canonical input like G03588.
  if (prefix === "G" && rawDigits.length === 5 && rawDigits.endsWith("0")) {
    digits = rawDigits.slice(0, -1).replace(/^0+/, "") || "0";
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
  const matches = input.toUpperCase().match(/[GH]\d{1,6}/g) ?? [];
  const normalized = matches
    .map((code) => normalizeStrongCode(code))
    .filter((code): code is string => Boolean(code));
  return Array.from(new Set(normalized));
}
