import Link from "next/link";

export function Footer() {
  return (
    <footer className="footer">
      <div className="footerIdentity">
        <span className="muted">ShepherdStudy</span>
        <span className="footerDbsCredit">
          With gratitude to the{" "}
          <a href="https://dbs.org/" target="_blank" rel="noreferrer">
            Digital Bible Society
          </a>{" "}
          for global Scripture resources.
        </span>
      </div>
      <div className="footerLinks">
        <Link href="/info">Info</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/donate">Donate</Link>
      </div>
    </footer>
  );
}
