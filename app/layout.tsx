import type { Metadata } from "next";
import { ReactNode } from "react";

import { Nav } from "@/components/nav";
import { Providers } from "@/components/providers";

import "./globals.css";

export const metadata: Metadata = {
  title: "Shepherd Study",
  description: "Personalized Bible study companion with OpenAI recommendations."
};

type Props = {
  children: ReactNode;
};

export default function RootLayout({ children }: Props) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <div className="shell">
            <Nav />
            <main className="main">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
