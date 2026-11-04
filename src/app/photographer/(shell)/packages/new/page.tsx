import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PACKAGE_TYPES, type PackageType } from "@/lib/photographer-options";
import { PackageForm } from "../package-form";
import { createPackage } from "../actions";

export const metadata: Metadata = {
  title: "New Package",
  robots: { index: false, follow: true },
};

export default async function NewPackagePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  if (!PACKAGE_TYPES.includes(type as PackageType)) redirect("/photographer/packages");

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <Link href="/photographer/packages" className="text-sm text-muted-foreground hover:text-foreground">
        ← Back to packages
      </Link>
      <h1 className="font-heading mt-3 text-2xl font-semibold">New package</h1>
      <PackageForm action={createPackage} packageType={type as PackageType} />
    </div>
  );
}
