import { headers } from "next/headers";

export const CAPTCHA_FAILED_MESSAGE = "Please complete the security check and try again.";

/** Verifies a Cloudflare Turnstile token server-side. With no secret
 * configured it passes in development and fails closed in production, so a
 * missing env var can never silently disable the check. */
export async function verifyTurnstile(token: FormDataEntryValue | null | undefined): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (process.env.NODE_ENV === "production") console.error("TURNSTILE_SECRET_KEY is not set");
    return process.env.NODE_ENV !== "production";
  }
  if (typeof token !== "string" || !token || token.length > 2048) return false;

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip);

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    const result = (await res.json()) as { success?: boolean };
    return result.success === true;
  } catch (err) {
    console.error("Turnstile verification failed", err instanceof Error ? err.message : err);
    return false;
  }
}
