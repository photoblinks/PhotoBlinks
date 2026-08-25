export function formatPricing(pricingType: "free" | "paid" | "unknown", price: number | null) {
  if (pricingType === "free") return "Free";
  if (pricingType === "paid") return price != null ? `₹${price.toLocaleString("en-IN")}` : "Paid";
  return "Price Unknown";
}
