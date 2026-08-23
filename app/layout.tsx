import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import {
  OG_IMAGE_ALT,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_URL,
} from "@/lib/site";
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
  // Lets every relative URL below (OG image, canonical) resolve to an absolute
  // one. Without it Next.js errors on relative metadata URLs at build time.
  metadataBase: new URL(SITE_URL),
  title: {
    // Searchers type the genre, not the brand, so the genre leads the title.
    default: `${SITE_NAME} — Song Guessing Game: Name the Track in a Split Second`,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  category: "games",
  // Largely ignored by Google, still read by some other engines. Cheap to keep
  // honest; not a substitute for the body copy in SiteInfo.
  keywords: [
    "song guessing game",
    "guess the song",
    "music quiz",
    "name that tune",
    "heardle alternative",
    "guess the song from one second",
    "music trivia game",
    "audio quiz",
    "free online music game",
  ],
  // One host, or ranking signals split between the apex and the deploy URL.
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    url: "/",
    locale: "en_US",
    // Resolved from app/opengraph-image.tsx, but stated explicitly so the alt
    // text is under our control.
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: OG_IMAGE_ALT }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    images: [{ url: "/opengraph-image", alt: OG_IMAGE_ALT }],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      // Let Google show the full OG card and an untruncated snippet.
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  // Added to the home screen it should open chrome-free, like an app. The
  // translucent bar means content runs under it, which the safe-area padding
  // in Game.tsx accounts for.
  appleWebApp: {
    capable: true,
    title: SITE_NAME,
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Draw into the notch/Dynamic Island and home-indicator area; we inset the
  // content ourselves with env(safe-area-inset-*).
  viewportFit: "cover",
  themeColor: "#2a0e10",
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
