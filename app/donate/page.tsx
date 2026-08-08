import { formatUsdInput, getDonationLimits } from "@/lib/donations";

type DonatePageProps = {
  searchParams: Promise<{
    checkout?: string;
    error?: string;
  }>;
};

export default async function DonatePage({ searchParams }: DonatePageProps) {
  const params = await searchParams;
  const limits = getDonationLimits();
  const minimum = formatUsdInput(limits.minimumCents);
  const maximum = formatUsdInput(limits.maximumCents);
  const defaultAmount = formatUsdInput(
    Math.min(Math.max(1_000, limits.minimumCents), limits.maximumCents)
  );

  return (
    <section className="card legalPage">
      <h1>Support ShepherdStudy</h1>
      <p>
        ShepherdStudy is designed to stay accessible. Donations are entirely
        optional and never affect account features or support priority.
        All features, including access to ESV Scripture text, remain available
        without charge.
      </p>
      <h2>Where your donation goes</h2>
      <p>
        We commit half of every donation to the{" "}
        <a href="https://dbs.org/" target="_blank" rel="noreferrer">
          Digital Bible Society
        </a>{" "}
        in gratitude for the Scripture resources that make ShepherdStudy&apos;s
        multilingual library possible. The other half supports the hosting,
        maintenance, security, and continued improvement of ShepherdStudy.
      </p>
      {params.checkout === "returned" ? (
        <p className="donationNotice" role="status">
          Thank you for supporting ShepherdStudy. Stripe will provide the final
          payment status and any receipt.
        </p>
      ) : null}
      {params.checkout === "canceled" ? (
        <p className="muted" role="status">
          Checkout was canceled. No contribution was made.
        </p>
      ) : null}
      {params.error === "invalid" ? (
        <p className="muted" role="alert">
          Enter an amount from ${minimum} to ${maximum} USD.
        </p>
      ) : null}
      {params.error === "rate_limited" ? (
        <p className="muted" role="alert">
          Too many checkout attempts. Please try again in a few minutes.
        </p>
      ) : null}
      {params.error === "unavailable" ? (
        <p className="muted" role="alert">
          Checkout is temporarily unavailable. Please try again later.
        </p>
      ) : null}

      <form
        className="grid donationForm"
        action="/api/donations/checkout"
        method="post"
      >
        <label>
          Contribution amount (USD)
          <input
            name="amount"
            type="number"
            inputMode="decimal"
            min={minimum}
            max={maximum}
            step="0.01"
            defaultValue={defaultAmount}
            required
          />
        </label>
        <button type="submit">Continue to secure checkout</button>
      </form>

      <p className="muted donationFinePrint">
        Stripe securely processes the payment; ShepherdStudy does not receive
        your full card number. Contributions are voluntary, do not purchase
        features, ESV access, or service priority, and are not represented as
        tax-deductible.
      </p>
    </section>
  );
}
