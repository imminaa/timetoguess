import { ImageResponse } from "next/og";
import { BRAND, SITE_NAME } from "@/lib/site";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";
export const alt = `${SITE_NAME} icon`;

/**
 * iOS ignores SVG favicons and will not composite transparency onto a home
 * screen, so the touch icon is a rendered PNG with an opaque amber field.
 */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: BRAND.accent,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 116,
            height: 116,
            borderRadius: 999,
            border: `12px solid ${BRAND.bg}`,
          }}
        >
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 999,
              background: BRAND.bg,
            }}
          />
        </div>
      </div>
    ),
    size
  );
}
