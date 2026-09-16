import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Oswald } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// docs/BUILD.md §11: "bold, condensed sans for headlines/hero numerals" — Oswald is the pick for
// now; confirm it reads correctly at the hero's large size against the actual mockups.
const oswald = Oswald({
  variable: "--font-oswald",
  weight: ["500", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Chalkline",
  description: "One habit. Two mates. Ten seconds.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Chalkline",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// docs/BUILD.md §12: fonts + PWA meta only in this step. manifest.json and the service worker are
// deferred to the dedicated PWA-installability pass, not the auth path.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${oswald.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
