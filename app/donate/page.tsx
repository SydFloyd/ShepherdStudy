function donationUrl() {
  const configured = process.env.NEXT_PUBLIC_DONATION_URL?.trim();
  if (!configured) {
    return null;
  }

  try {
    const url = new URL(configured);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export default function DonatePage() {
  const url = donationUrl();

  return (
    <section className="card legalPage">
      <h1>Support ShepherdStudy</h1>
      <p>
        ShepherdStudy is designed to stay accessible. Donations are entirely
        optional and never affect account features or support priority.
      </p>
      {url ? (
        <p>
          <a href={url} rel="noreferrer">
            Make an optional donation
          </a>
        </p>
      ) : (
        <p className="muted">Donations are not currently being accepted.</p>
      )}
    </section>
  );
}
