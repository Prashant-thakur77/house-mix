import type { Metadata, Viewport } from "next";
import { Doto, Geist, Geist_Mono, Saira_Condensed } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const saira = Saira_Condensed({ variable: "--font-saira", subsets: ["latin"], weight: ["500", "600", "700"], display: "swap" });
const doto = Doto({ variable: "--font-doto", subsets: ["latin"], weight: ["900"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "House Mix", template: "%s · House Mix" },
  description: "Turn tonight's lineup into a crowd-programmed run-of-show, with Qloo evidence behind every pick.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F1F1F1" },
    { media: "(prefers-color-scheme: dark)", color: "#0A0A0A" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} ${saira.variable} ${doto.variable} h-full`}>
      <body className="min-h-full">
        <a href="#main" className="sr-only rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50">
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
