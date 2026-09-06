import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

/** Read-only star row for a single comment's whole-number rating. */
export function StarRatingDisplay({ rating, className }: { rating: number; className?: string }) {
  return (
    <div className={cn("flex items-center gap-0.5", className)} aria-label={`Rated ${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          aria-hidden="true"
          className={cn("size-3.5", star <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground")}
        />
      ))}
    </div>
  );
}
