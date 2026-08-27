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
