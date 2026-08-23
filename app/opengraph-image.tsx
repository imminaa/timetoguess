import { ImageResponse } from "next/og";
import { STAGES } from "@/lib/game-config";
import { BRAND, OG_IMAGE_ALT, SITE_NAME } from "@/lib/site";

export const alt = OG_IMAGE_ALT;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The social card. Satori supports flexbox only — no grid, and every element
 * with more than one child needs an explicit display value.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: BRAND.bg,
          // Amber wash off the top-left, echoing the accent in the app.
          backgroundImage: `radial-gradient(900px 500px at 8% -10%, ${BRAND.accent}26, transparent)`,
          color: BRAND.ink,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 64,
              height: 64,
              borderRadius: 999,
              background: BRAND.accent,
            }}
          >
            <div
              style={{
                width: 18,
                height: 18,
                borderRadius: 999,
                background: BRAND.bg,
              }}
            />
          </div>
          <div style={{ fontSize: 38, fontWeight: 700, letterSpacing: -0.5 }}>
            {SITE_NAME}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 88,
              fontWeight: 700,
              letterSpacing: -3,
              lineHeight: 1.05,
            }}
          >
            Name that tune.
          </div>
          <div
            style={{
              marginTop: 22,
              fontSize: 34,
              lineHeight: 1.35,
              color: BRAND.dim,
              maxWidth: 900,
            }}
          >
            A song guessing game. The first clip is a tenth of a second — every
            wrong guess buys you more.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {STAGES.map((s, i) => (
            <div
              key={s}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "12px 26px",
                borderRadius: 999,
                fontSize: 27,
                border: `2px solid ${i === 1 ? BRAND.accent : BRAND.line}`,
                background: i === 1 ? `${BRAND.accent}1f` : BRAND.surface,
                color: i === 1 ? BRAND.accent : BRAND.dim,
              }}
            >
              {s}s
            </div>
          ))}
        </div>
      </div>
    ),
    size
  );
}
