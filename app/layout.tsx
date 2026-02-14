import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { ReactNode } from "react";

import { AnalyticsScript } from "@/components/analytics-script";
import { Footer } from "@/components/footer";
import { Nav } from "@/components/nav";
import { Providers } from "@/components/providers";
import { authOptions } from "@/lib/auth";

import "./globals.css";

export const metadata: Metadata = {
  title: "Shepherd Study",
  description: "Personalized Bible study companion with OpenAI recommendations."
};

type Props = {
  children: ReactNode;
};

export default async function RootLayout({ children }: Props) {
  const session = await getServerSession(authOptions);

  return (
    <html lang="en">
      <body>
        <AnalyticsScript />
        <Providers session={session}>
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
