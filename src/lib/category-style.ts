import { Droplet, Landmark, MapPin, Mountain, TreePalm, type LucideIcon } from "lucide-react";

const CATEGORY_STYLES: Record<string, { color: string; icon: LucideIcon }> = {
  beach: { color: "#f97316", icon: TreePalm },
  waterfall: { color: "#0ea5e9", icon: Droplet },
  temple: { color: "#8b5cf6", icon: Landmark },
  hill: { color: "#92400e", icon: Mountain },
  mountain: { color: "#92400e", icon: Mountain },
};

const DEFAULT_STYLE = { color: "#16382a", icon: MapPin };

/** Marker color + icon for a category slug, used on the locations map. */
export function getCategoryMarkerStyle(categorySlug: string | undefined) {
  if (!categorySlug) return DEFAULT_STYLE;
  return CATEGORY_STYLES[categorySlug] ?? DEFAULT_STYLE;
}
