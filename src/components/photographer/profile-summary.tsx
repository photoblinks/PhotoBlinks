import { Badge } from "@/components/ui/badge";

export type PhotographerProfileData = {
  display_name: string;
  studio_name?: string | null;
  country_name?: string | null;
  state_name?: string | null;
  city?: string | null;
  bio?: string | null;
  phone_number: string;
  whatsapp_number?: string | null;
  instagram_url?: string | null;
  portfolio_url?: string | null;
  avatar_url?: string | null;
  is_active: boolean;
  suspended_at?: string | null;
};

type Props = {
  profile: PhotographerProfileData;
  email?: string;
};

export function PhotographerProfileSummary({ profile, email }: Props) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-muted text-xl font-semibold text-muted-foreground">
          {profile.display_name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold">{profile.display_name}</p>
          {profile.studio_name && (
            <p className="truncate text-sm text-muted-foreground">{profile.studio_name}</p>
          )}
          {email && (
            <p className="truncate text-sm text-muted-foreground">{email}</p>
          )}
        </div>
        <Badge
          variant={profile.is_active ? "default" : "destructive"}
          className="ml-auto shrink-0"
        >
          {profile.is_active ? "Active" : "Suspended"}
        </Badge>
      </div>

      {profile.bio && (
        <p className="text-sm text-muted-foreground">{profile.bio}</p>
      )}

      <dl className="space-y-1 text-sm">
        {(profile.city || profile.state_name || profile.country_name) && (
          <div className="flex gap-2">
            <dt className="shrink-0 text-muted-foreground">Location</dt>
            <dd>{[profile.city, profile.state_name, profile.country_name].filter(Boolean).join(", ")}</dd>
          </div>
        )}
        <div className="flex gap-2">
          <dt className="shrink-0 text-muted-foreground">Phone</dt>
          <dd>{profile.phone_number}</dd>
        </div>
        {profile.whatsapp_number && (
          <div className="flex gap-2">
            <dt className="shrink-0 text-muted-foreground">WhatsApp</dt>
            <dd>{profile.whatsapp_number}</dd>
          </div>
        )}
        {profile.instagram_url && (
          <div className="flex gap-2">
            <dt className="shrink-0 text-muted-foreground">Instagram</dt>
            <dd>
              <a
                href={profile.instagram_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                {profile.instagram_url.replace("https://", "")}
              </a>
            </dd>
          </div>
        )}
        {profile.portfolio_url && (
          <div className="flex gap-2">
            <dt className="shrink-0 text-muted-foreground">Portfolio</dt>
            <dd>
              <a
                href={profile.portfolio_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                {profile.portfolio_url.replace("https://", "")}
              </a>
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}
