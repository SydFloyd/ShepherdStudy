import Link from "next/link";

export default function HomePage() {
  return (
    <section className="grid two">
      <article className="card">
        <h1>Shepherd Study MVP</h1>
        <p className="muted">
          A personalized Bible study assistant that recommends cross-references,
          practical applications, and saves your study history.
        </p>
        <p>
          <Link href="/study">Start studying</Link>
        </p>
      </article>

      <article className="card">
        <h2>What this MVP includes</h2>
        <ul>
          <li>Account registration and login</li>
          <li>OpenAI-powered recommendation engine</li>
          <li>Saved study sessions for signed-in users</li>
          <li>Dashboard with recent study history</li>
        </ul>
      </article>
    </section>
  );
}
