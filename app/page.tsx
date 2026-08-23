import Game from "@/components/Game";
import SiteInfo from "@/components/SiteInfo";
import { hasAppleCreds } from "@/lib/apple";
import { hasLastfmCreds } from "@/lib/lastfm";
import { DIFFICULTIES } from "@/lib/game-config";
import { FAQ, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * Structured data. The FAQPage entries mirror the copy SiteInfo renders — a
 * schema describing text the visitor cannot see is a spam signal, so both read
 * from lib/site.ts.
 */
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: `${SITE_URL}/`,
      name: SITE_NAME,
      description: SITE_DESCRIPTION,
      inLanguage: "en",
    },
    {
      "@type": ["VideoGame", "WebApplication"],
      "@id": `${SITE_URL}/#game`,
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      description: SITE_DESCRIPTION,
      applicationCategory: "GameApplication",
      genre: ["Music", "Quiz", "Puzzle"],
      gamePlatform: "Web browser",
      playMode: "SinglePlayer",
      operatingSystem: "Any",
      browserRequirements: "Requires JavaScript and Web Audio support",
      inLanguage: "en",
      isAccessibleForFree: true,
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
      },
      audience: { "@type": "Audience", audienceType: "Music fans" },
      keywords: DIFFICULTIES.map((d) => d.label).join(", "),
      isPartOf: { "@id": `${SITE_URL}/#website` },
    },
    {
      "@type": "FAQPage",
      "@id": `${SITE_URL}/#faq`,
      mainEntity: FAQ.map(({ q, a }) => ({
        "@type": "Question",
        name: q,
        acceptedAnswer: { "@type": "Answer", text: a },
      })),
    },
  ],
};

export default function Home() {
  return (
    <>
      <Game ready={hasAppleCreds() && hasLastfmCreds()} />
      <SiteInfo />
      <script
        type="application/ld+json"
        // Escaping "<" keeps a stray "</script>" in any future copy from
        // closing this tag early.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
    </>
  );
}
