"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { ImagePlus } from "lucide-react";
import Link from "next/link";
import { uploadPhotographerFileToR2 } from "@/lib/r2/upload-client";
import { PACKAGE_SERVICES, PACKAGE_TYPE_LABEL, type PackageType, type PhotographerPackage } from "@/lib/photographer-options";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import type { PackageFormState } from "./actions";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024;

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

/** Create/edit form for one package. The type is fixed by the page (new:
 * from the chosen section; edit: from the stored package). All checks here
 * are convenience — the server action re-validates everything. */
export function PackageForm({
  action,
  packageType,
  existing,
}: {
  action: (state: PackageFormState, formData: FormData) => Promise<PackageFormState>;
  packageType: PackageType;
  existing?: PhotographerPackage;
}) {
  // Submitted through a handler (not <form action>) so a validation error
  // never resets what the photographer typed.
  const [state, setState] = useState<PackageFormState>({});
  const [pending, startTransition] = useTransition();
  const [bannerUrl, setBannerUrl] = useState(existing?.bannerImageUrl ?? "");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setUploadError("Only JPEG, PNG, and WebP images are allowed.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setUploadError("File is too large. Maximum size is 10 MB.");
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const { publicUrl } = await uploadPhotographerFileToR2(file, "package");
      setBannerUrl(publicUrl);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (uploading || pending) return;
        const formData = new FormData(e.currentTarget);
        startTransition(async () => setState(await action(state, formData)));
      }}
      className="mt-6"
    >
      <input type="hidden" name="package_type" value={packageType} />
      <input type="hidden" name="banner_image_url" value={bannerUrl} />

      <FieldGroup>
        <p className="rounded-lg bg-pb-brand/5 px-3 py-2 text-sm text-pb-brand">{PACKAGE_TYPE_LABEL[packageType]}</p>

        <section className="flex flex-col gap-4">
          <h2 className="font-heading text-lg font-semibold">Basic details</h2>
          <Field>
            <FieldLabel htmlFor="name">Package name *</FieldLabel>
            <Input id="name" name="name" defaultValue={existing?.name} maxLength={80} required />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="actual_price">Actual price (₹) *</FieldLabel>
              <Input id="actual_price" name="actual_price" type="number" min={1} defaultValue={existing?.actualPrice} required />
            </Field>
            <Field>
              <FieldLabel htmlFor="offer_price">Offer price (₹)</FieldLabel>
              <Input id="offer_price" name="offer_price" type="number" min={0} defaultValue={existing?.offerPrice ?? ""} />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="banner">Banner image</FieldLabel>
            <input
              id="banner"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFile}
              disabled={uploading}
              className="sr-only"
            />
            {bannerUrl ? (
              <div className="flex flex-col gap-2">
                <div className="relative aspect-16/9 w-full max-w-md overflow-hidden rounded-xl border">
                  <Image src={bannerUrl} alt="Banner preview" fill sizes="448px" className="object-cover" />
                </div>
                <div className="flex gap-2">
                  <label
                    htmlFor="banner"
                    className="inline-flex h-8 cursor-pointer items-center rounded-lg border px-3 text-sm font-medium hover:bg-muted"
                  >
                    {uploading ? "Uploading…" : "Replace image"}
                  </label>
                  <Button type="button" variant="outline" size="sm" onClick={() => setBannerUrl("")}>
                    Remove
                  </Button>
                </div>
              </div>
            ) : (
              <label
                htmlFor="banner"
                className="flex aspect-16/9 w-full max-w-md cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-sm text-muted-foreground transition-colors hover:border-pb-brand hover:text-pb-brand"
              >
                <ImagePlus className="size-8" strokeWidth={1.5} />
                <span className="font-medium">{uploading ? "Uploading…" : "Click to upload banner image"}</span>
                <span className="text-xs">JPEG, PNG or WebP, up to 10 MB</span>
              </label>
            )}
            {uploadError && <FieldError>{uploadError}</FieldError>}
          </Field>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-lg font-semibold">Photography &amp; videography services</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {PACKAGE_SERVICES.map((service) => (
              <label key={service} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="services"
                  value={service}
                  defaultChecked={existing?.services.includes(service)}
                  className="size-4"
                />
                {service}
              </label>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <div>
            <h2 className="font-heading text-lg font-semibold">Deliverables</h2>
            <p className="text-xs text-muted-foreground">Leave a field empty to hide it from the customer card.</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="edited_pictures_count">Edited pictures</FieldLabel>
              <Input id="edited_pictures_count" name="edited_pictures_count" type="number" min={0} defaultValue={existing?.editedPicturesCount ?? ""} />
            </Field>
            <Field>
              <FieldLabel htmlFor="edited_videos_count">Edited videos (min 2)</FieldLabel>
              <Input id="edited_videos_count" name="edited_videos_count" type="number" min={2} defaultValue={existing?.editedVideosCount ?? ""} />
            </Field>
            <Field>
              <FieldLabel htmlFor="save_the_date_video_count">Save The Date videos</FieldLabel>
              <Input id="save_the_date_video_count" name="save_the_date_video_count" type="number" min={0} defaultValue={existing?.saveTheDateVideoCount ?? ""} />
            </Field>
            <Field>
              <FieldLabel htmlFor="countdown_images_count">Countdown images</FieldLabel>
              <Input id="countdown_images_count" name="countdown_images_count" type="number" min={0} defaultValue={existing?.countdownImagesCount ?? ""} />
            </Field>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="font-heading text-lg font-semibold">Shoot duration</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="shoot_duration_unit">Unit</FieldLabel>
              <select id="shoot_duration_unit" name="shoot_duration_unit" defaultValue={existing?.shootDurationUnit ?? ""} className={selectClass}>
                <option value="">Not specified</option>
                <option value="days">Days</option>
                <option value="hours">Hours</option>
              </select>
            </Field>
            <Field>
              <FieldLabel htmlFor="shoot_duration_value">Duration</FieldLabel>
              <Input id="shoot_duration_value" name="shoot_duration_value" maxLength={30} placeholder="e.g. 2" defaultValue={existing?.shootDurationValue ?? ""} />
            </Field>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="font-heading text-lg font-semibold">Additional charges</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="travel_charges">Travel charges</FieldLabel>
              <select id="travel_charges" name="travel_charges" defaultValue={existing?.travelCharges ?? ""} className={selectClass}>
                <option value="">Not specified</option>
                <option value="extra">Extra</option>
                <option value="included">Included</option>
              </select>
            </Field>
            <Field>
              <FieldLabel htmlFor="stay_charges">Stay charges</FieldLabel>
              <select id="stay_charges" name="stay_charges" defaultValue={existing?.stayCharges ?? ""} className={selectClass}>
                <option value="">Not specified</option>
                <option value="extra">Extra</option>
                <option value="included">Included</option>
              </select>
            </Field>
          </div>
        </section>

        {state.error && <FieldError>{state.error}</FieldError>}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending || uploading}>
            {pending ? "Saving…" : existing ? "Save changes" : "Create package"}
          </Button>
          <Button render={<Link href="/photographer/packages" />} variant="ghost" size="sm">
            Cancel
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
