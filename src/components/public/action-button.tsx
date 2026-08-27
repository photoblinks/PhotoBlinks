import { CalendarCheck, Globe, Phone, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ActionType } from "@/lib/public-data";

const ACTION_CONFIG: Record<ActionType, { label: string; icon: LucideIcon }> = {
  book_now: { label: "Book Now", icon: CalendarCheck },
  website: { label: "Visit Website", icon: Globe },
  call_now: { label: "Call Now", icon: Phone },
};

export function ActionButton({
  actionType,
  actionValue,
  className,
}: {
  actionType?: ActionType | null;
  actionValue?: string | null;
  className?: string;
}) {
  if (!actionType || !actionValue) return null;

  const { label, icon: Icon } = ACTION_CONFIG[actionType];
  const isExternalLink = actionType !== "call_now";
  const href = actionType === "call_now" ? `tel:${actionValue}` : actionValue;

  return (
    <Button
      render={
        <a
          href={href}
          target={isExternalLink ? "_blank" : undefined}
          rel={isExternalLink ? "noopener noreferrer" : undefined}
        />
      }
      variant="outline"
      className={cn(
        "w-full border border-pb-brand bg-white text-pb-brand hover:bg-pb-brand/5",
        className,
      )}
    >
      <Icon className="size-4" />
      {label}
    </Button>
  );
}
