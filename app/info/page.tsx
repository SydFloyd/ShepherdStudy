import Link from "next/link";

export default function InfoPage() {
  return (
    <section className="grid two">
      <article className="card">
        <h1>Shepherd Study</h1>
        <p className="muted">
          A Christ-centered study companion built to help you explore Scripture,
          understand context, and continue meaningful study over time.
        </p>
        <p>
          <Link href="/study">Start studying</Link>
        </p>
      </article>

      <article className="card">
        <h2>What You Can Do</h2>
        <ul>
          <li>Study passages with AI-generated context and recommendations</li>
          <li>Ask WWJD-style questions with Scripture recommendations</li>
          <li>Save and resume your Study and WWJD history</li>
          <li>Use multiple Bible versions in a clean reading interface</li>
        </ul>
      </article>

      <article className="card">
        <h2>Free Tier</h2>
        <ul>
          <li>Study: up to 40 requests per day</li>
          <li>WWJD: up to 80 requests per day</li>
          <li>Burst protection: short per-minute request limits</li>
        </ul>
      </article>

      <article className="card">
        <h2>Sources & Licensing</h2>
        <p className="muted">
          Original-language options are powered by unfoldingWord resources.
        </p>
        <ul>
          <li>
            UHB (Hebrew Old Testament): unfoldingWord Hebrew Bible
          </li>
          <li>
            UGNT (Greek New Testament): unfoldingWord Greek New Testament
          </li>
          <li>
            License: CC BY-SA 4.0
          </li>
        </ul>
        <p>
          <a href="https://unfoldingword.org/for-translators/content">
            Source and license details
          </a>
        </p>
      </article>
    </section>
  );
}
