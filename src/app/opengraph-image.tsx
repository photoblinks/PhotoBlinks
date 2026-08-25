import { ImageResponse } from "next/og";

export const alt = "PhotoBlinks — Photoshoot Locations";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Default social-share image for any public page that doesn't set its own
// openGraph.images (location/studio pages override this with a real photo).
// Built from the project's actual brand colors and the same Aperture mark
// used in the Header/Footer logo, rather than a generic placeholder.
export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #16382a 0%, #2f8f4e 100%)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <svg
            width="100"
            height="100"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="m14.31 8 5.74 9.94" />
            <path d="M9.69 8h11.48" />
            <path d="m7.38 12 5.74-9.94" />
            <path d="M9.69 16 3.95 6.06" />
            <path d="M14.31 16H2.83" />
            <path d="m16.62 12-5.74 9.94" />
          </svg>
          <div style={{ display: "flex", color: "white", fontSize: 92, fontWeight: 700 }}>
            PhotoBlinks
          </div>
        </div>
        <div
          style={{
            display: "flex",
            color: "rgba(255,255,255,0.85)",
            fontSize: 34,
            marginTop: 20,
            letterSpacing: 8,
            textTransform: "uppercase",
          }}
        >
          Photoshoot Locations
        </div>
      </div>
    ),
    { ...size },
  );
}
