/** Builds a wa.me click-to-chat link from a stored WhatsApp number. wa.me
 * requires digits only (no leading "+", spaces, or dashes) — stripping
 * everything but digits preserves a country code typed as "+91 98765 43210"
 * or "919876543210" without corrupting it. */
export function buildWhatsAppLink(whatsappNumber: string) {
  return `https://wa.me/${whatsappNumber.replace(/\D/g, "")}`;
}

export function formatPricing(pricingType: "free" | "paid" | "unknown", price: number | null) {
  if (pricingType === "free") return "Free";
  if (pricingType === "paid") return price != null ? `₹${price.toLocaleString("en-IN")}` : "Paid";
  return "Price Unknown";
}

/** Card/popup pricing badge — just the category, never the exact amount
 * (the exact amount/conditions live in the Entry Fee detail field shown on
 * the location's own page). */
export function formatPricingLabel(pricingType: "free" | "paid" | "unknown") {
  if (pricingType === "free") return "Free";
  if (pricingType === "paid") return "Paid";
  return "Price Unknown";
}
