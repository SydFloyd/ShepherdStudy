import Stripe from "stripe";

type DonationCheckoutInput = {
  amountCents: number;
  origin: string;
  requestId: string;
};

let cachedClient: { secretKey: string; client: Stripe } | null = null;

function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is required.");
  }

  if (cachedClient?.secretKey === secretKey) {
    return cachedClient.client;
  }

  const client = new Stripe(secretKey, {
    appInfo: { name: "ShepherdStudy" },
    maxNetworkRetries: 2,
    timeout: 10_000
  });
  cachedClient = { secretKey, client };
  return client;
}

export function buildDonationCheckoutParams(
  input: Pick<DonationCheckoutInput, "amountCents" | "origin">
): Stripe.Checkout.SessionCreateParams {
  return {
    mode: "payment",
    submit_type: "donate",
    success_url: `${input.origin}/donate?checkout=returned`,
    cancel_url: `${input.origin}/donate?checkout=canceled`,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: input.amountCents,
          product_data: {
            name: "Support ShepherdStudy",
            description:
              "Optional support that does not affect account features or priority."
          }
        }
      }
    ],
    metadata: { purpose: "donation" },
    payment_intent_data: { metadata: { purpose: "donation" } },
    custom_text: {
      submit: {
        message:
          "Thank you for supporting ShepherdStudy. Contributions do not unlock features or priority."
      }
    }
  };
}

export async function createDonationCheckoutSession(
  input: DonationCheckoutInput
) {
  const session = await getStripeClient().checkout.sessions.create(
    buildDonationCheckoutParams(input),
    { idempotencyKey: `donation-checkout:${input.requestId}` }
  );

  if (!session.url) {
    throw new Error("Stripe did not return a hosted Checkout URL.");
  }

  const checkoutUrl = new URL(session.url);
  if (
    checkoutUrl.protocol !== "https:" ||
    checkoutUrl.hostname !== "checkout.stripe.com"
  ) {
    throw new Error("Stripe returned an unexpected Checkout URL.");
  }

  return checkoutUrl;
}
