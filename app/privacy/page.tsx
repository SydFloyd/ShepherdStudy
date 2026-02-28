export default function PrivacyPage() {
  return (
    <section className="card legalPage">
      <h1>Privacy Policy</h1>
      <p className="muted">Last updated: February 14, 2026</p>

      <h2>What We Collect</h2>
      <p>
        ShepherdStudy stores account details (email, display name), study and WWJD
        conversation history, and operational logs required to keep the service
        secure and reliable.
      </p>

      <h2>How We Use Data</h2>
      <p>
        We use your data to provide study features, generate AI responses, monitor
        abuse, and improve product reliability. We do not sell your personal data.
      </p>

      <h2>Third-Party Services</h2>
      <p>
        AI responses are generated through OpenAI. Error monitoring is handled by
        Sentry. Hosting and database infrastructure may process data as required to
        operate the service.
      </p>

      <h2>Retention</h2>
      <p>
        Study history remains available until you request deletion or we remove data
        for legal/compliance reasons. Operational logs are retained according to
        infrastructure defaults and security needs.
      </p>

      <h2>Your Choices</h2>
      <p>
        You can stop using the service at any time. To request account or data
        deletion, contact the site administrator.
      </p>
    </section>
  );
}
