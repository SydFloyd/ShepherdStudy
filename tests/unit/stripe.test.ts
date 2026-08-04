import { buildDonationCheckoutParams } from "@/lib/stripe";

describe("Stripe donation checkout", () => {
  it("creates one-time USD donation parameters without app entitlements", () => {
    const params = buildDonationCheckoutParams({
      amountCents: 1_250,
      origin: "https://shepstudy.com"
    });

    expect(params.mode).toBe("payment");
    expect(params.submit_type).toBe("donate");
    expect(params.success_url).toBe(
      "https://shepstudy.com/donate?checkout=returned"
    );
    expect(params.cancel_url).toBe(
      "https://shepstudy.com/donate?checkout=canceled"
    );
    expect(params.line_items).toEqual([
      expect.objectContaining({
        quantity: 1,
        price_data: expect.objectContaining({
          currency: "usd",
          unit_amount: 1_250
        })
      })
    ]);
    expect(params.metadata).toEqual({ purpose: "donation" });
  });
});
