import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { PackageCard } from "@/components/public/package-card";
import {
  MAX_PACKAGES_PER_TYPE,
  PACKAGE_COLUMNS,
  PACKAGE_TYPES,
  PACKAGE_TYPE_LABEL,
  toPhotographerPackage,
  type PackageRow,
} from "@/lib/photographer-options";
import { deletePackage, setPackageVisibility } from "./actions";

export const metadata: Metadata = {
  title: "My Packages",
  robots: { index: false, follow: true },
};

export default async function PhotographerPackagesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const { saved } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in/photographer");

  const { data } = await supabase
    .from("photographer_packages")
    .select(PACKAGE_COLUMNS)
    .eq("photographer_id", user.id)
    .order("created_at");
  const packages = ((data ?? []) as PackageRow[]).map(toPhotographerPackage);

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <h1 className="font-heading text-2xl font-semibold">My Packages</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Create up to {MAX_PACKAGES_PER_TYPE} packages for each shoot type. They appear on your public photographer
        page as soon as you save them (once your profile is approved).
      </p>

      {saved && (
        <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">Package saved.</p>
      )}

      {PACKAGE_TYPES.map((type) => {
        const ofType = packages.filter((p) => p.packageType === type);
        return (
          <section key={type} className="mt-10">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-heading text-xl font-semibold">{PACKAGE_TYPE_LABEL[type]}</h2>
              {ofType.length < MAX_PACKAGES_PER_TYPE ? (
                <Button render={<Link href={`/photographer/packages/new?type=${type}`} />} size="sm">
                  Add package ({ofType.length}/{MAX_PACKAGES_PER_TYPE})
                </Button>
              ) : (
                <span className="text-sm text-muted-foreground">
                  Maximum of {MAX_PACKAGES_PER_TYPE} reached
                </span>
              )}
            </div>

            {ofType.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                No {PACKAGE_TYPE_LABEL[type].toLowerCase()} packages yet.
              </p>
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {ofType.map((pkg) => (
                  <div key={pkg.id} className="flex flex-col gap-3">
                    <div className={pkg.isVisible ? "" : "opacity-50"}>
                      <PackageCard pkg={pkg} />
                    </div>
                    {!pkg.isVisible && (
                      <p className="text-xs font-medium text-amber-700">Hidden — not shown on your public page.</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button render={<Link href={`/photographer/packages/${pkg.id}/edit`} />} variant="outline" size="sm">
                        Edit
                      </Button>
                      <form action={setPackageVisibility}>
                        <input type="hidden" name="id" value={pkg.id} />
                        <input type="hidden" name="visible" value={String(!pkg.isVisible)} />
                        <Button type="submit" variant="outline" size="sm">
                          {pkg.isVisible ? "Hide" : "Show"}
                        </Button>
                      </form>
                      <form action={deletePackage}>
                        <input type="hidden" name="id" value={pkg.id} />
                        <Button type="submit" variant="destructive" size="sm">
                          Delete
                        </Button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
