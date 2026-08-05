import Link from "next/link";

export default function InfoPage() {
  return (
    <section className="grid infoPageGrid">
      <article className="card infoHeroCard">
        <h1>ShepherdStudy</h1>
        <p>
          Our mission is to make faithful, accessible, and meaningful study of
          God&apos;s Word available to anyone by combining trustworthy Scripture
          data with thoughtful AI assistance. ShepherdStudy keeps a small local
          Scripture library for dependable access and original-language study,
          while its wider multilingual catalog is provided dynamically by the
          Digital Bible Society.
        </p>
      </article>

      <article className="card infoFreeCard">
        <h2>Contact Us</h2>
        <p>
          We would love to hear your feedback. Please contact us at{" "}
          <a href="mailto:contact@shepstudy.com">contact@shepstudy.com</a>.
        </p>
      </article>

      <article className="card infoLicenseCard">
        <h2>Scripture Sources &amp; Licensing</h2>
        <p className="infoDbsThanks">
          We are deeply grateful to the{" "}
          <a href="https://dbs.org/" target="_blank" rel="noreferrer">
            Digital Bible Society
          </a>{" "}
          for making a remarkable collection of translated Bibles available to
          people around the world. Most translated editions in ShepherdStudy are
          retrieved from their service only when needed and cached carefully;
          the full DBS library is not copied into our database.
        </p>
        <p>
          Copyright and edition details are shown with Scripture text when they
          are supplied by the source. ShepherdStudy&apos;s local library contains
          WEB, KJV, and ASV editions sourced from{" "}
          <a href="https://ebible.org/" target="_blank" rel="noreferrer">
            eBible.org
          </a>
          {", together with these original-language resources:"}
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
          <a
            href="https://unfoldingword.org/for-translators/content"
            target="_blank"
            rel="noreferrer"
          >
            unfoldingWord source and license details
          </a>
        </p>
      </article>

      <article className="card infoFeaturesCard">
        <h2>Features</h2>
        <h3>
          <Link href="/study">Study</Link>
        </h3>
        <p>
          Explore passages and receive context with recommendations for deeper
          study and practical application.
        </p>
        <h3>
          <Link href="/compare">Compare</Link>
        </h3>
        <p>
          View two Bible translations side by side with linked verse-level
          differences and quick chapter navigation.
        </p>
        <h3>
          <Link href="/word-lens">Interlinear</Link>
        </h3>
        <p>
          Analyze one verse at a time in original language with AI-assisted
          word-by-word transliteration, translation, and morphology support.
        </p>
        <h3>
          <Link href="/memorize">Memorize</Link>
        </h3>
        <p>
          Save a verse, contiguous passage, or whole chapter; practice recall
          with word-level feedback; and test both the text and its address.
        </p>
      </article>
    </section>
  );
}
