import type { Metadata } from "next";
import { ReactNode } from "react";

import { AnalyticsScript } from "@/components/analytics-script";
import { Footer } from "@/components/footer";
import { Nav } from "@/components/nav";
import { Providers } from "@/components/providers";

import "./globals.css";

export const metadata: Metadata = {
  title: "ShepherdStudy",
  description: "Personalized Bible study companion with OpenAI recommendations.",
  icons: {
    icon: "/branding/shepherdstudy_small.png",
    shortcut: "/branding/shepherdstudy_small.png",
    apple: "/branding/shepherdstudy_small.png"
  }
};

type Props = {
  children: ReactNode;
};

export default function RootLayout({ children }: Props) {
  return (
    <html lang="en">
      <body>
        <AnalyticsScript />
        <Providers>
          <div className="shell">
            <Nav />
            <main className="main">{children}</main>
            <Footer />
          </div>
        </Providers>
      </body>
    </html>
  );
}
