export default function PrivacyPage() {
  return (
    <section className="card legalPage">
      <h1>Privacy Policy</h1>
      <p className="muted">Last updated: August 4, 2026</p>

      <h2>What We Collect</h2>
      <p>
        ShepherdStudy stores account details (email, display name, preferred Bible
        translation), study conversation history, saved memorization passages and
        attempt scores, short-lived hashed account-recovery tokens, and operational
        logs required to keep the service secure and reliable. Memorization answers
        are assessed in the request but are not retained after the score is saved.
      </p>

      <h2>How We Use Data</h2>
      <p>
        We use your data to provide study features, generate AI responses, monitor
        abuse, and improve product reliability. When you request memorization
        suggestions, saved passage references may be sent to OpenAI; your written
        recall answers are not sent for recommendations. We do not sell your
        personal data.
      </p>

      <h2>Third-Party Services</h2>
      <p>
        AI responses are generated through OpenAI. Postmark processes account emails.
        Stripe processes optional contributions and associated payment information;
        ShepherdStudy does not receive full card details. Error monitoring is handled
        by Sentry. Hosting and database infrastructure may process data as required to
        operate the service.
      </p>

      <h2>Retention</h2>
      <p>
        Study history and memorization progress remain available until you delete
        them, request account deletion, or we remove data for legal/compliance
        reasons. Verification and password-reset links expire automatically.
        Operational logs are retained according to infrastructure defaults and
        security needs.
      </p>

      <h2>Your Choices</h2>
      <p>
        You can stop using the service at any time. To request account or data
        deletion, contact the site administrator.
      </p>
    </section>
  );
}
