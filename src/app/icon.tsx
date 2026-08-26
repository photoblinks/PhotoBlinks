import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// Branded favicon — same Aperture mark and brand green used in the
// header/footer logo and the default OG image, replacing the unbranded
// default Next.js favicon.ico.
export default function Icon() {
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
          borderRadius: 6,
        }}
      >
        <svg
          width="24"
          height="24"
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
    { ...size },
  );
}
