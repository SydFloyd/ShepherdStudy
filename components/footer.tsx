import Link from "next/link";

export function Footer() {
  return (
    <footer className="footer">
      <span className="muted">Shepherd Study</span>
      <div className="footerLinks">
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
      </div>
    </footer>
  );
}
