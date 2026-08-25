import { Button } from "@/components/ui/button";
import { buildGoToLocationUrl } from "@/lib/geo";

export function GoToLocationButton({
  mapUrl,
  latitude,
  longitude,
}: {
  mapUrl?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}) {
  const href = buildGoToLocationUrl({ mapUrl, latitude, longitude });
  if (!href) return null;

  return (
    <Button
      render={<a href={href} target="_blank" rel="noopener noreferrer" />}
      className="w-full sm:w-auto"
    >
      Go to Location
    </Button>
  );
}
