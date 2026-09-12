"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel, FieldError, FieldDescription } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { reportLocation } from "@/app/(public)/location/[slug]/report-actions";

const MAX_MESSAGE_LENGTH = 1000;

const REPORT_TYPE_OPTIONS = [
  { value: "incorrect_information", label: "Incorrect information" },
  { value: "location_closed", label: "Location appears closed" },
  { value: "wrong_location", label: "Wrong location/details" },
  { value: "inappropriate_content", label: "Inappropriate content" },
  { value: "duplicate", label: "Duplicate location" },
  { value: "other", label: "Other" },
] as const;

const ERROR_MESSAGES: Record<string, string> = {
  invalid_type: "Please choose a report reason.",
  too_long: `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.`,
  empty_message: "Please describe the issue.",
  location_not_found: "This location is no longer available.",
  rate_limited: "You've submitted too many reports recently. Please try again later.",
  failed: "Couldn't submit your report. Please try again.",
};

/** Low-emphasis "Report this location" control — a small ghost/outline
 * button next to Favourite/Share, deliberately not styled like the
 * page's primary (pricing/contact) action. Opens a dialog with the report
 * form; works for both signed-in and anonymous visitors, since reporting
 * doesn't require an account. */
export function ReportLocationButton({ locationId }: { locationId: string }) {
  const [open, setOpen] = useState(false);
  const [reportType, setReportType] = useState<string>("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  function resetAndClose(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setReportType("");
      setMessage("");
      setFormError(null);
      setSubmitted(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!reportType) {
      setFormError("Please choose a report reason.");
      return;
    }
    if (!message.trim()) {
      setFormError("Please describe the issue.");
      return;
    }

    setSubmitting(true);
    setFormError(null);
    const formData = new FormData();
    formData.set("report_type", reportType);
    formData.set("message", message.trim());
    const result = await reportLocation(locationId, formData);
    setSubmitting(false);

    if ("error" in result) {
      setFormError(ERROR_MESSAGES[result.error] ?? ERROR_MESSAGES.failed);
      return;
    }
    setSubmitted(true);
  }

  return (
    <Dialog open={open} onOpenChange={resetAndClose}>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)} className="text-muted-foreground">
        <Flag className="size-4" />
        Report
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report this location</DialogTitle>
          <DialogDescription>
            Reports are reviewed by the PhotoBlinks team. Submitting a report does not
            automatically change this location.
          </DialogDescription>
        </DialogHeader>

        {submitted ? (
          <p role="status" className="rounded-lg bg-pb-brand/10 p-3 text-sm text-pb-brand">
            Thanks — your report has been submitted for review.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Field>
              <FieldLabel htmlFor="report-type">Reason</FieldLabel>
              <Select value={reportType} onValueChange={(value) => setReportType(value ?? "")}>
                <SelectTrigger id="report-type" className="w-full">
                  <SelectValue placeholder="Select a reason" />
                </SelectTrigger>
                <SelectContent>
                  {REPORT_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="report-message">What&apos;s wrong?</FieldLabel>
              <Textarea
                id="report-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                maxLength={MAX_MESSAGE_LENGTH}
                placeholder="Describe the issue…"
                required
              />
              <FieldDescription>{message.length}/{MAX_MESSAGE_LENGTH}</FieldDescription>
              {formError && <FieldError>{formError}</FieldError>}
            </Field>
            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Submitting…" : "Submit report"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
