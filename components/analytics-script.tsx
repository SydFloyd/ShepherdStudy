export function AnalyticsScript() {
  const src = process.env.NEXT_PUBLIC_ANALYTICS_SCRIPT_SRC;
  const domain = process.env.NEXT_PUBLIC_ANALYTICS_DOMAIN;

  if (!src || !domain) {
    return null;
  }

  return <script defer data-domain={domain} src={src} />;
}
