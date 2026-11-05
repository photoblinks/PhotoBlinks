/** Fixed choices for the pre-wedding fields on a photographer profile. The
 * photographer form renders these as checkboxes and the server action
 * validates submissions against them, so stored values are always one of
 * these strings. */
export const PHOTOGRAPHER_SERVICES = [
  "Pre-wedding shoots",
  "Candid photography",
  "Cinematic video",
  "Drone shots",
  "Outdoor locations",
  "Studio / indoor shoots",
  "Save-the-date videos",
  "Albums & prints",
] as const;

export const PHOTOGRAPHER_LANGUAGES = [
  "English",
  "Hindi",
  "Kannada",
  "Malayalam",
  "Tamil",
  "Telugu",
  "Konkani",
  "Tulu",
  "Marathi",
  "Bengali",
] as const;

export const PACKAGE_TYPES = ["regular", "destination"] as const;
export type PackageType = (typeof PACKAGE_TYPES)[number];

export const PACKAGE_TYPE_LABEL: Record<PackageType, string> = {
  regular: "Regular Pre-Wedding Shoot",
  destination: "Destination Pre-Wedding Shoot",
};

export const MAX_PACKAGES_PER_TYPE = 3;

export const PACKAGE_SERVICES = [
  "Candid Photographer",
  "Candid Videographer",
  "Traditional Photographer",
  "Traditional Videographer",
  "Semi-Candid Photographer",
  "Semi-Candid Videographer",
  "Drone",
] as const;

/** Row shape shared by the manage page and the public card. Optional fields
 * are null when the photographer did not offer them — the card omits them. */
export type PhotographerPackage = {
  id: string;
  packageType: PackageType;
  name: string;
  actualPrice: number;
  offerPrice: number | null;
  bannerImageUrl: string | null;
  services: string[];
  editedPicturesCount: number | null;
  editedVideosCount: number | null;
  saveTheDateVideoCount: number | null;
  countdownImagesCount: number | null;
  shootDurationUnit: "days" | "hours" | null;
  shootDurationValue: string | null;
  travelCharges: "extra" | "included" | null;
  stayCharges: "extra" | "included" | null;
  isVisible: boolean;
};

export type PackageRow = {
  id: string;
  package_type: PackageType;
  name: string;
  actual_price: number;
  offer_price: number | null;
  banner_image_url: string | null;
  services: string[];
  edited_pictures_count: number | null;
  edited_videos_count: number | null;
  save_the_date_video_count: number | null;
  countdown_images_count: number | null;
  shoot_duration_unit: "days" | "hours" | null;
  shoot_duration_value: string | null;
  travel_charges: "extra" | "included" | null;
  stay_charges: "extra" | "included" | null;
  is_visible: boolean;
};

export const PACKAGE_COLUMNS =
  "id, package_type, name, actual_price, offer_price, banner_image_url, services, edited_pictures_count, edited_videos_count, save_the_date_video_count, countdown_images_count, shoot_duration_unit, shoot_duration_value, travel_charges, stay_charges, is_visible";

export function toPhotographerPackage(row: PackageRow): PhotographerPackage {
  return {
    id: row.id,
    packageType: row.package_type,
    name: row.name,
    actualPrice: row.actual_price,
    offerPrice: row.offer_price,
    bannerImageUrl: row.banner_image_url,
    services: row.services,
    editedPicturesCount: row.edited_pictures_count,
    editedVideosCount: row.edited_videos_count,
    saveTheDateVideoCount: row.save_the_date_video_count,
    countdownImagesCount: row.countdown_images_count,
    shootDurationUnit: row.shoot_duration_unit,
    shootDurationValue: row.shoot_duration_value,
    travelCharges: row.travel_charges,
    stayCharges: row.stay_charges,
    isVisible: row.is_visible,
  };
}

/** True for an https link on youtube.com / youtu.be (channel, video or short link). */
export function isYouTubeUrl(value: string): boolean {
  try {
    const { protocol, hostname } = new URL(value);
    const host = hostname.replace(/^www\./, "");
    return protocol === "https:" && (host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be");
  } catch {
    return false;
  }
}
