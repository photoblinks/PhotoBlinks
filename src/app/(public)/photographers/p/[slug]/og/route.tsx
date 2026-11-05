import { ImageResponse } from "next/og";
import { getPublicPhotographerBySlug } from "@/lib/public-data";
import { isAllowedR2ImageUrl } from "@/lib/r2/upload";

// Rich share card (WhatsApp, Facebook, X…) for a photographer: logo, studio
// name, location, starting price, over the banner when there is one.
export const revalidate = 604800;

const SIZE = { width: 1200, height: 630 };

/** Fetches an R2 image and inlines it, only when it is a format the OG
 * renderer is known to decode (JPEG/PNG). Anything else, or any failure,
 * falls back to the gradient/initial so the card still renders. */
async function loadImage(url: string | null): Promise<string | null> {
  if (!url || !isAllowedR2ImageUrl(url)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !/^image\/(jpeg|png)$/.test(type)) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length > 4 * 1024 * 1024) return null;
    return `data:${type};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await getPublicPhotographerBySlug(slug);
  if (!p) return new Response("Not found", { status: 404 });

  const [banner, logo] = await Promise.all([loadImage(p.bannerUrl), loadImage(p.logoUrl ?? p.avatarUrl)]);
  const price = p.startingPrice != null ? `From ₹${p.startingPrice.toLocaleString("en-IN")}` : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background: "linear-gradient(135deg, #16382a 0%, #2f8f4e 100%)",
        }}
      >
        {banner && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={banner} alt="" width={SIZE.width} height={SIZE.height} style={{ position: "absolute", objectFit: "cover" }} />
        )}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: SIZE.width,
            height: SIZE.height,
            display: "flex",
            background: banner ? "rgba(0,0,0,0.6)" : "transparent",
          }}
        />
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            gap: 56,
            padding: "0 80px",
            width: "100%",
          }}
        >
          <div
            style={{
              width: 260,
              height: 260,
              borderRadius: 130,
              border: "8px solid white",
              background: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" width={244} height={244} style={{ objectFit: "cover", borderRadius: 122 }} />
            ) : (
              <div style={{ display: "flex", fontSize: 120, fontWeight: 700, color: "#16382a" }}>
                {p.studioName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", color: "white", flex: 1 }}>
            <div style={{ display: "flex", fontSize: 28, letterSpacing: 5, textTransform: "uppercase", opacity: 0.85 }}>
              Pre-wedding photographer
            </div>
            <div style={{ display: "flex", fontSize: 64, fontWeight: 700, lineHeight: 1.1, marginTop: 14, maxWidth: 700 }}>
              {p.studioName}
            </div>
            <div style={{ display: "flex", fontSize: 36, marginTop: 16, opacity: 0.9 }}>
              {p.city}, {p.state.name}
            </div>
            {price && (
              <div
                style={{
                  display: "flex",
                  alignSelf: "flex-start",
                  marginTop: 28,
                  padding: "10px 28px",
                  borderRadius: 999,
                  background: "white",
                  color: "#16382a",
                  fontSize: 38,
                  fontWeight: 700,
                }}
              >
                {price}
              </div>
            )}
            <div style={{ display: "flex", fontSize: 26, marginTop: 34, opacity: 0.8 }}>photoblinks.com</div>
          </div>
        </div>
      </div>
    ),
    { ...SIZE },
  );
}
