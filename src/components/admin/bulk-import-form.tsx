"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldRequiredMark,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Option = { id: string; name: string };
type StateOption = Option & { country_id: string };

type RowStatus =
  | "NEW"
  | "WARNING"
  | "INVALID"
  | "DUPLICATE_IN_FILE"
  | "EXISTING_LOCATION"
  | "SLUG_CONFLICT";

type RowProblem = { field?: string; message: string; kind: "error" | "warning" };

type ValidatedRow = {
  excelRow: number;
  name: string | null;
  city: string | null;
  status: RowStatus;
  problems: RowProblem[];
  notes: string[];
  slug: string | null;
};

type ValidationResult = {
  summary: {
    totalRows: number;
    validRows: number;
    warningRows: number;
    errorRows: number;
    duplicateRows: number;
  };
  rows: ValidatedRow[];
  workbookWarnings: string[];
  templateVersion: string | null;
};

type CreateRowReport = { excelRow: number; name: string | null; reason: string };

type CreateResult = {
  requested: number;
  created: { excelRow: number; name: string }[];
  skipped: CreateRowReport[];
  failed: CreateRowReport[];
};

const STATUS_LABEL: Record<RowStatus, string> = {
  NEW: "New",
  WARNING: "Warning",
  INVALID: "Error",
  DUPLICATE_IN_FILE: "Duplicate in file",
  EXISTING_LOCATION: "Already exists",
  SLUG_CONFLICT: "Slug conflict",
};

const STATUS_CLASS: Record<RowStatus, string> = {
  NEW: "text-emerald-600",
  WARNING: "text-amber-600",
  INVALID: "text-destructive",
  DUPLICATE_IN_FILE: "text-orange-600",
  EXISTING_LOCATION: "text-orange-600",
  SLUG_CONFLICT: "text-orange-600",
};

function Stat({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold ${className ?? ""}`}>{value}</div>
    </div>
  );
}

export function BulkImportForm({
  countries,
  states,
}: {
  countries: Option[];
  states: StateOption[];
}) {
  const [countryId, setCountryId] = useState("");
  const [stateId, setStateId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [creating, setCreating] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [createResult, setCreateResult] = useState<CreateResult | null>(null);

  const statesForCountry = states.filter((state) => state.country_id === countryId);
  const canDownload = Boolean(countryId && stateId);
  const canValidate = Boolean(countryId && stateId && file);
  const creatableCount = result ? result.summary.validRows + result.summary.warningRows : 0;
  const canCreate = Boolean(
    result &&
      file &&
      creatableCount > 0 &&
      result.summary.errorRows === 0 &&
      result.summary.duplicateRows === 0 &&
      (result.summary.warningRows === 0 || acknowledged),
  );

  function resetResults() {
    setResult(null);
    setCreateResult(null);
    setAcknowledged(false);
  }

  function handleCountryChange(value: string) {
    setCountryId(value);
    setStateId("");
    resetResults();
  }

  function handleStateChange(value: string) {
    setStateId(value);
    resetResults();
  }

  function handleFileChange(file: File | null) {
    setFile(file);
    resetResults();
  }

  async function handleDownload() {
    setError(null);
    if (!countryId || !stateId) {
      setError("Select a country and state first.");
      return;
    }

    setDownloading(true);
    try {
      const params = new URLSearchParams({ countryId, stateId });
      const response = await fetch(
        `/api/admin/locations/bulk-import/template?${params.toString()}`,
      );

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Could not generate the template.");
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const filename =
        disposition.match(/filename="([^"]+)"/)?.[1] ?? "photoblinks-location-import.xlsx";

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate the template.");
    } finally {
      setDownloading(false);
    }
  }

  async function handleValidate() {
    setError(null);
    resetResults();
    if (!file || !countryId || !stateId) {
      setError("Select a country, state, and Excel file first.");
      return;
    }

    setValidating(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("countryId", countryId);
      body.append("stateId", stateId);

      const response = await fetch("/api/admin/locations/bulk-import/validate", {
        method: "POST",
        body,
      });

      const data = (await response.json().catch(() => null)) as
        | { error?: string }
        | ValidationResult
        | null;

      if (!response.ok) {
        throw new Error(
          data && "error" in data && data.error ? data.error : "Could not validate the file.",
        );
      }

      setResult(data as ValidationResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not validate the file.");
    } finally {
      setValidating(false);
    }
  }

  async function handleCreate() {
    setError(null);
    if (!file || !countryId || !stateId || !canCreate) return;

    setCreating(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("countryId", countryId);
      body.append("stateId", stateId);
      body.append("acknowledgeWarnings", String(acknowledged));

      const response = await fetch("/api/admin/locations/bulk-import/create", {
        method: "POST",
        body,
      });
      const data = (await response.json().catch(() => null)) as
        | { error?: string }
        | CreateResult
        | null;

      if (!response.ok) {
        throw new Error(
          data && "error" in data && data.error ? data.error : "Could not create the locations.",
        );
      }

      setCreateResult(data as CreateResult);
      // Reset upload state so the same file cannot be submitted twice.
      setResult(null);
      setAcknowledged(false);
      setFile(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the locations.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="bulk-country">
          Country
          <FieldRequiredMark />
        </FieldLabel>
        <Select
          name="bulk-country"
          value={countryId || null}
          onValueChange={(value) => handleCountryChange(String(value ?? ""))}
        >
          <SelectTrigger id="bulk-country" className="w-full">
            <SelectValue placeholder="Select a country" />
          </SelectTrigger>
          <SelectContent>
            {countries.map((country) => (
              <SelectItem key={country.id} value={country.id}>
                {country.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field>
        <FieldLabel htmlFor="bulk-state">
          State
          <FieldRequiredMark />
        </FieldLabel>
        <Select
          name="bulk-state"
          value={stateId || null}
          onValueChange={(value) => handleStateChange(String(value ?? ""))}
          disabled={!countryId}
        >
          <SelectTrigger id="bulk-state" className="w-full">
            <SelectValue placeholder={countryId ? "Select a state" : "Select a country first"} />
          </SelectTrigger>
          <SelectContent>
            {statesForCountry.map((state) => (
              <SelectItem key={state.id} value={state.id}>
                {state.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field>
        <Button type="button" onClick={handleDownload} disabled={!canDownload || downloading}>
          {downloading ? "Generating…" : "Download Official Excel Template"}
        </Button>
        <FieldDescription>
          The template is generated for the selected Country and State, which apply to every row
          you import. Country and State are not columns in the workbook.
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel htmlFor="bulk-file">Upload Excel</FieldLabel>
        <Input
          id="bulk-file"
          type="file"
          accept=".xlsx"
          onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
        />
        {file && <FieldDescription>Selected: {file.name}</FieldDescription>}
      </Field>

      <Field>
        <Button type="button" onClick={handleValidate} disabled={!canValidate || validating}>
          {validating ? "Validating…" : "Validate Excel"}
        </Button>
        <FieldDescription>
          Parses and validates the workbook without creating any locations. Creation only happens
          after you confirm below.
        </FieldDescription>
      </Field>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {result && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat label="Total rows" value={result.summary.totalRows} />
            <Stat label="Valid" value={result.summary.validRows} className="text-emerald-600" />
            <Stat label="Errors" value={result.summary.errorRows} className="text-destructive" />
            <Stat label="Warnings" value={result.summary.warningRows} className="text-amber-600" />
            <Stat label="Duplicates" value={result.summary.duplicateRows} className="text-orange-600" />
          </div>

          {result.workbookWarnings.map((warning) => (
            <p key={warning} className="text-sm text-amber-600">
              {warning}
            </p>
          ))}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14">Row</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Problems</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.map((row) => (
                <TableRow key={row.excelRow}>
                  <TableCell>{row.excelRow}</TableCell>
                  <TableCell>
                    <div className="font-medium">{row.name ?? "—"}</div>
                    {row.city && <div className="text-xs text-muted-foreground">{row.city}</div>}
                  </TableCell>
                  <TableCell>
                    <span className={`text-sm font-medium ${STATUS_CLASS[row.status]}`}>
                      {STATUS_LABEL[row.status]}
                    </span>
                  </TableCell>
                  <TableCell>
                    {row.problems.map((problem, index) => (
                      <div
                        key={index}
                        className={`text-sm ${problem.kind === "error" ? "text-destructive" : "text-amber-600"}`}
                      >
                        {problem.field ? `${problem.field}: ${problem.message}` : problem.message}
                      </div>
                    ))}
                    {row.notes.map((note, index) => (
                      <div key={index} className="text-sm text-muted-foreground">
                        {note}
                      </div>
                    ))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {result.summary.errorRows > 0 || result.summary.duplicateRows > 0 ? (
            <p className="text-sm text-muted-foreground">
              Validation complete — no locations were created. Fix the errors and upload again.
            </p>
          ) : creatableCount > 0 ? (
            <div className="space-y-3 rounded-lg border p-4">
              <p className="text-sm">
                Validation complete — <strong>{creatableCount}</strong> new location(s) ready.
                They are created as <strong>drafts</strong>; nothing is published.
              </p>
              {result.summary.warningRows > 0 && (
                <label className="flex items-start gap-2 text-sm text-amber-600">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={acknowledged}
                    onChange={(event) => setAcknowledged(event.target.checked)}
                  />
                  <span>
                    {result.summary.warningRows} row(s) have warnings (some cells will be ignored,
                    see above). I understand and want to continue.
                  </span>
                </label>
              )}
              <Button type="button" onClick={handleCreate} disabled={!canCreate || creating}>
                {creating ? "Creating…" : "Create Draft Locations"}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No new locations to create.</p>
          )}
        </div>
      )}

      {createResult && (
        <div className="space-y-3 rounded-lg border p-4">
          <p className="text-sm font-medium">
            Import completed — {createResult.created.length} draft location(s) created.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Requested" value={createResult.requested} />
            <Stat label="Created" value={createResult.created.length} className="text-emerald-600" />
            <Stat label="Skipped" value={createResult.skipped.length} className="text-orange-600" />
            <Stat label="Failed" value={createResult.failed.length} className="text-destructive" />
          </div>
          <p className="text-sm text-muted-foreground">
            All created locations are drafts and are not visible publicly.
          </p>
          {createResult.created.length > 0 && (
            <ul className="list-disc pl-5 text-sm">
              {createResult.created.map((location) => (
                <li key={location.excelRow}>{location.name}</li>
              ))}
            </ul>
          )}
          {createResult.skipped.map((row) => (
            <div key={row.excelRow} className="text-sm text-orange-600">
              Row {row.excelRow} — {row.name ?? "—"}: {row.reason}
            </div>
          ))}
          {createResult.failed.map((row) => (
            <div key={row.excelRow} className="text-sm text-destructive">
              Row {row.excelRow} — {row.name ?? "—"}: {row.reason}
            </div>
          ))}
          <Link href="/admin/locations" className="text-sm font-medium underline">
            Go to Locations
          </Link>
        </div>
      )}
    </FieldGroup>
  );
}
