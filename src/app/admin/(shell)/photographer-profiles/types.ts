export type PhotographerStatus = "active" | "on_hold" | "suspended" | "draft";

export const PHOTOGRAPHER_STATUS_LABEL: Record<PhotographerStatus, string> = {
  active: "Active",
  on_hold: "On hold",
  suspended: "Suspended",
  draft: "Draft",
};

/** Row shape returned by the get_admin_photographer_profiles RPC. */
export type PhotographerProfileRow = {
  id: string;
  /** null for an unclaimed (bulk-imported) profile. */
  user_id: string | null;
  email: string | null;
  display_name: string;
  studio_name: string;
  bio: string | null;
  phone_number: string;
  whatsapp_number: string;
  instagram_url: string | null;
  portfolio_url: string | null;
  country_id: string;
  state_id: string;
  city: string;
  country_name: string | null;
  state_name: string | null;
  is_active: boolean;
  suspended_at: string | null;
  status: PhotographerStatus;
  created_at: string;
  last_sign_in_at: string | null;
};
