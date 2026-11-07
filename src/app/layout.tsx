import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const display = Bricolage_Grotesque({ variable: "--font-display", subsets: ["latin"] });
const body = IBM_Plex_Sans({ variable: "--font-body", subsets: ["latin", "greek"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: "Founder",
  description: "Start and run an AI consultancy in a realistic simulated market.",
  appleWebApp: { capable: true, title: "Founder", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F3F5F7" },
    { media: "(prefers-color-scheme: dark)", color: "#0E1626" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
