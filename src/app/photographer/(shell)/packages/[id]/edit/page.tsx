import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PACKAGE_COLUMNS, toPhotographerPackage, type PackageRow } from "@/lib/photographer-options";
import { PackageForm } from "../../package-form";
import { updatePackage } from "../../actions";

export const metadata: Metadata = {
  title: "Edit Package",
  robots: { index: false, follow: true },
};

export default async function EditPackagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in/photographer");

  const { data } = await supabase
    .from("photographer_packages")
    .select(PACKAGE_COLUMNS)
    .eq("id", id)
    .eq("photographer_id", user.id)
    .maybeSingle();
  if (!data) notFound();

  const pkg = toPhotographerPackage(data as PackageRow);

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <Link href="/photographer/packages" className="text-sm text-muted-foreground hover:text-foreground">
        ← Back to packages
      </Link>
      <h1 className="font-heading mt-3 text-2xl font-semibold">Edit package</h1>
      <PackageForm action={updatePackage.bind(null, id)} packageType={pkg.packageType} existing={pkg} />
    </div>
  );
}
