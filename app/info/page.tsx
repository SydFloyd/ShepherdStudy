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
          ESV Scripture text is retrieved on demand from Crossway&apos;s official
          service and kept only in a small, expiring shared cache. All
          ShepherdStudy features and ESV access are offered without charge.
          Scripture quotations marked &ldquo;ESV&rdquo; are from the{" "}
          <a href="https://www.esv.org/" target="_blank" rel="noreferrer">
            ESV&reg; Bible (The Holy Bible, English Standard Version&reg;)
          </a>
          , &copy; 2001 by Crossway, a publishing ministry of Good News
          Publishers. Used by permission. All rights reserved. The ESV text may
          not be quoted in any publication made available to the public by a
          Creative Commons license. The ESV may not be translated into any
          other language.
        </p>
        <p>
          Users may not copy or download more than 500 verses of the ESV Bible
          or more than one half of any book of the ESV Bible.
        </p>
        <p>
          <a href="https://api.esv.org/" target="_blank" rel="noreferrer">
            ESV API conditions of use
          </a>
          {" | "}
          <a
            href="https://www.crossway.org/permissions/"
            target="_blank"
            rel="noreferrer"
          >
            Crossway permissions
          </a>
        </p>
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
