import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
});

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TimeToGuess",
  description:
    "A song guessing game. Hear a snippet, 0.01 seconds at first, and name the track before the clues run out.",
  // Added to the home screen it should open chrome-free, like an app. The
  // translucent bar means content runs under it, which the safe-area padding
  // in Game.tsx accounts for.
  appleWebApp: {
    capable: true,
    title: "TimeToGuess",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Draw into the notch/Dynamic Island and home-indicator area; we inset the
  // content ourselves with env(safe-area-inset-*).
  viewportFit: "cover",
  themeColor: "#141110",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${bricolage.variable} ${geist.variable} ${geistMono.variable} min-h-dvh antialiased`}
    >
      <body className="flex min-h-dvh flex-col">{children}</body>
    </html>
  );
}
