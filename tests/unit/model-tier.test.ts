import { getOpenAIModelForTier } from "@/lib/model-tier";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("tier model selection", () => {
  it("keeps anonymous and free traffic on the standard model", () => {
    vi.stubEnv("OPENAI_MODEL", "standard-model");
    vi.stubEnv("OPENAI_PAID_MODEL", "paid-model");

    expect(getOpenAIModelForTier("ANONYMOUS")).toBe("standard-model");
    expect(getOpenAIModelForTier("FREE")).toBe("standard-model");
  });

  it("uses the configured paid model without inventing a default upgrade", () => {
    vi.stubEnv("OPENAI_MODEL", "standard-model");
    vi.stubEnv("OPENAI_PAID_MODEL", "paid-model");
    expect(getOpenAIModelForTier("PAID")).toBe("paid-model");

    vi.stubEnv("OPENAI_PAID_MODEL", "");
    expect(getOpenAIModelForTier("PAID")).toBe("standard-model");
  });
});
