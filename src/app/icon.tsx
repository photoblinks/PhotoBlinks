import { ImageResponse } from "next/og";

export const contentType = "image/png";

// Google requires favicon dimensions to be a multiple of 48px (192), and the
// brand asks for 512x512 too — serve both from the same mark.
const SIZES = [192, 512];

export function generateImageMetadata() {
  return SIZES.map((s) => ({
    id: String(s),
    size: { width: s, height: s },
    contentType,
  }));
}

// Branded favicon — same Aperture mark and brand green used in the
// header/footer logo and the default OG image.
export default async function Icon({ id }: { id: Promise<string | number> }) {
  const s = Number(await id);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#16382a",
          borderRadius: Math.round(s * 0.1875),
        }}
      >
        <svg
          width={Math.round(s * 0.75)}
          height={Math.round(s * 0.75)}
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="1.75"
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
      </div>
    ),
    { width: s, height: s },
  );
}
