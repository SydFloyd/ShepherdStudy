import { afterEach, describe, expect, it, vi } from "vitest";

import { isAdminEmail } from "@/lib/admin-access";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("admin email access", () => {
  it("fails closed when no admin email is configured", () => {
    vi.stubEnv("ADMIN_EMAIL", "");
    vi.stubEnv("ADMIN_EMAILS", "");

    expect(isAdminEmail("aimlessmania@gmail.com")).toBe(false);
  });

  it("grants access only to the configured email", () => {
    vi.stubEnv("ADMIN_EMAIL", "aimlessmania@gmail.com");
    vi.stubEnv("ADMIN_EMAILS", "");

    expect(isAdminEmail(" AIMLESSMANIA@gmail.com ")).toBe(true);
    expect(isAdminEmail("someone@example.com")).toBe(false);
  });

  it("supports a normalized comma-separated allowlist", () => {
    vi.stubEnv("ADMIN_EMAIL", "");
    vi.stubEnv(
      "ADMIN_EMAILS",
      "owner@example.com, AIMLESSMANIA@gmail.com"
    );

    expect(isAdminEmail("aimlessmania@gmail.com")).toBe(true);
    expect(isAdminEmail("owner@example.com")).toBe(true);
    expect(isAdminEmail("not-listed@example.com")).toBe(false);
  });
});
