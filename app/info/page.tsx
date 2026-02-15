import Link from "next/link";

export default function InfoPage() {
  return (
    <section className="grid infoPageGrid">
      <article className="card infoHeroCard">
        <h1>Shepherd Study</h1>
        <p className="muted">
          A Christ-centered Bible study companion designed to help people engage
          Scripture with clarity, humility, and practical obedience.
        </p>
        <p>
          Our mission is to make faithful, accessible, and meaningful study of
          God&apos;s Word available to anyone by combining trustworthy Scripture
          data with thoughtful AI assistance. Bible versions are stored directly
          by Shepherd Study, independent of third-party APIs, and are not
          subject to outside changes.
        </p>
      </article>

      <article className="card infoFeaturesCard">
        <h2>Features</h2>
        <h3>
          <Link href="/study">Study</Link>
        </h3>
        <p>
          Explore passages, receive context and recommendations, and analyze
          meaningful original-language deltas and word-level details.
        </p>
        <h3>
          <Link href="/wwjd">ShepherdAI</Link>
        </h3>
        <p>
          Ask questions from a Christ-centered perspective and receive
          Scripture-grounded responses with recommended verses for reflection.
        </p>
      </article>

      <article className="card infoFreeCard">
        <h2>Free To Use</h2>
        <p>
          Shepherd Study is free to use. For expanded access, please contact us.
        </p>
        <p>
          <a href="mailto:shepstudy@gmail.com">shepstudy@gmail.com</a>
        </p>
      </article>

      <article className="card infoLicenseCard">
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
