"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import { useFavourites } from "./favourites-provider";
import { StarRatingInput } from "./star-rating-input";
import { StarRatingDisplay } from "./star-rating-display";
import { createLocationComment, loadMoreLocationComments } from "@/app/(public)/location/[slug]/comment-actions";
import type { LocationRatingSummary, PublicLocationComment } from "@/lib/public-data";
import { LOCATION_COMMENTS_PAGE_SIZE } from "@/lib/public-data";

const MAX_COMMENT_LENGTH = 1000;

function formatCommentDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Comments + ratings section on a location detail page — public read
 * (approved only), sign-in-gated write. A rating (1-5) is required on
 * every submission; the written comment is optional, so a visitor can
 * leave just a rating. Reuses FavouritesProvider's client-side signed-in
 * state (see that file) rather than adding a second auth-check effect. */
export function LocationComments({
  locationId,
  initialComments,
  initialCount,
  ratingSummary,
}: {
  locationId: string;
  initialComments: PublicLocationComment[];
  initialCount: number;
  ratingSummary: LocationRatingSummary;
}) {
  const { ready, signedIn } = useFavourites();
  const pathname = usePathname();
  const router = useRouter();

  const [comments, setComments] = useState(initialComments);
  const [hasMore, setHasMore] = useState(initialComments.length === LOCATION_COMMENTS_PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);

  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (rating < 1 || rating > 5) {
      setFormError("Please choose a star rating.");
      return;
    }
    const trimmed = text.trim();
    if (trimmed.length > MAX_COMMENT_LENGTH) {
      setFormError(`Comments must be ${MAX_COMMENT_LENGTH} characters or fewer.`);
      return;
    }

    setSubmitting(true);
    setFormError(null);
    const formData = new FormData();
    formData.set("rating", String(rating));
    formData.set("comment", trimmed);
    const result = await createLocationComment(locationId, formData);
    setSubmitting(false);

    if ("error" in result) {
      if (result.error === "sign_in_required") {
        router.push(`/sign-in?next=${encodeURIComponent(pathname)}`);
        return;
      }
      setFormError(
        result.error === "too_long"
          ? `Comments must be ${MAX_COMMENT_LENGTH} characters or fewer.`
          : result.error === "invalid_rating"
            ? "Please choose a star rating."
            : "Couldn't submit your rating. Please try again.",
      );
      return;
    }

    setRating(0);
    setText("");
    setSubmitted(true);
  }

  async function handleLoadMore() {
    setLoadingMore(true);
    const next = await loadMoreLocationComments(locationId, comments.length);
    setComments((prev) => [...prev, ...next]);
    setHasMore(next.length === LOCATION_COMMENTS_PAGE_SIZE);
    setLoadingMore(false);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="font-heading text-xl font-semibold">Comments ({initialCount})</h2>
        {ratingSummary.count > 0 && (
          <span className="flex items-center gap-1 text-sm text-muted-foreground">
            <Star className="size-4 fill-amber-400 text-amber-400" aria-hidden="true" />
            <span className="font-medium text-foreground">{ratingSummary.average}</span>
            <span>
              ({ratingSummary.count} rating{ratingSummary.count === 1 ? "" : "s"})
            </span>
          </span>
        )}
      </div>

      {submitted && (
        <p role="status" className="mb-4 rounded-lg bg-pb-brand/10 p-3 text-sm text-pb-brand">
          Your rating has been submitted and is awaiting approval.
        </p>
      )}

      <div className="mb-6">
        {!ready ? null : !signedIn ? (
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <p className="text-sm font-medium">Want to share your experience?</p>
            <Link
              href={`/sign-in?next=${encodeURIComponent(pathname)}`}
              className="mt-2 inline-block text-sm font-medium text-pb-brand hover:underline"
            >
              Sign in to comment
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-4 shadow-sm">
            <Field>
              <FieldLabel>Your rating</FieldLabel>
              <StarRatingInput value={rating} onChange={setRating} />
            </Field>
            <Field className="mt-4">
              <FieldLabel htmlFor="location-comment">Comment (optional)</FieldLabel>
              <Textarea
                id="location-comment"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={4}
                maxLength={MAX_COMMENT_LENGTH}
                placeholder="Share your experience visiting this location…"
              />
              {formError && <FieldError>{formError}</FieldError>}
            </Field>
            <div className="mt-3">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Submitting…" : "Submit"}
              </Button>
            </div>
          </form>
        )}
      </div>

      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No comments yet. Be the first to share your experience!
        </p>
      ) : (
        <div className="flex flex-col divide-y overflow-hidden rounded-xl border bg-white shadow-sm">
          {comments.map((comment) => (
            <div key={comment.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{comment.authorName}</span>
                <StarRatingDisplay rating={comment.rating} />
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">{formatCommentDate(comment.created_at)}</span>
              </div>
              {comment.comment && (
                <p className="mt-2 text-sm leading-relaxed text-foreground/90">{comment.comment}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {hasMore && (
        <div className="mt-4 text-center">
          <Button type="button" variant="outline" size="sm" onClick={handleLoadMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load more comments"}
          </Button>
        </div>
      )}
    </div>
  );
}
