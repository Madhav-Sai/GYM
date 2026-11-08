import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Providers } from "@/lib/providers";

export const metadata: Metadata = { title: "GYM", description: "Personal training & health platform", robots: { index: false, follow: false } };
export const viewport: Viewport = { themeColor: "#0A0A0B", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
