import { Skeleton } from "@/components/ui/skeleton";

/** Instant loading state for /admin/performance while the server component
 * fetches the performance RPCs. Mirrors the page layout. */
export default function PerformanceLoading() {
  return (
    <div>
      <Skeleton className="mb-6 h-8 w-72" />
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <Skeleton className="h-14 w-56" />
        <Skeleton className="h-14 w-40" />
        <Skeleton className="h-14 w-40" />
        <Skeleton className="h-8 w-24" />
      </div>
      <Skeleton className="mb-6 h-6 w-40" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="mb-6 mt-6 h-6 w-44" />
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
      <Skeleton className="mb-6 h-6 w-32" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
