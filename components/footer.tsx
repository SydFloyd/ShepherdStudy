import Link from "next/link";

export function Footer() {
  return (
    <footer className="footer">
      <span className="muted">ShepherdStudy</span>
      <div className="footerLinks">
        <Link href="/info">Info</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
      </div>
    </footer>
  );
}
