"use client";
import {usePackageConfirmation} from "./use-package-confirmation";

/**
 * Temporary Web-local mirror of the private editor draft contract.
 *
 * The canonical definitions are in:
 * packages/shared-types/src/provider-package-v2.cts
 *
 * Remove this mirror after shared-type declarations are safely rebuilt.
 */
export interface IndividualServingDraftV2 {
  id: string;
  name: string;
  minimumServingsText: string;
  maximumServingsText: string;
  priceText: string;
  minimumQuantityText: string;
  maximumQuantityText: string;
}

export interface IndividualFoodDraftV2 {
  id: string;
  name: string;
  servingOptions: IndividualServingDraftV2[];
}

import {useRef, useState} from "react";
import {Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter} from "@/components/ui/dialog";
import {Button} from "@/components/ui/button";
import {packageMoneyCentavos, formatPackageCentavos} from "@/lib/provider/package-pricing-preview";

type ServingField = Exclude<
  keyof IndividualServingDraftV2,
  "id"
>;

const fields: {
  key: ServingField;
  label: string;
  placeholder: string;
}[] = [
  {key: "name", label: "Serving name", placeholder: "Family Size"},
  {key: "minimumServingsText", label: "Minimum servings", placeholder: "8"},
  {key: "maximumServingsText", label: "Maximum servings", placeholder: "10"},
  {key: "priceText", label: "Price (PHP)", placeholder: "1850.00"},
  {key: "minimumQuantityText", label: "Minimum quantity", placeholder: "1"},
  {key: "maximumQuantityText", label: "Maximum quantity", placeholder: "3"},
];

function createOption(): IndividualServingDraftV2 {
  return {
    id: `option_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`,
    name: "",
    minimumServingsText: "",
    maximumServingsText: "",
    priceText: "",
    minimumQuantityText: "",
    maximumQuantityText: "",
  };
}

export function ProviderPackageIndividualFood({
  value,
  onChange,
  disabled = false,
}: {
  value: IndividualFoodDraftV2;
  onChange: (value: IndividualFoodDraftV2) => void;
  disabled?: boolean;
}) {
  const {confirm, confirmationDialog} = usePackageConfirmation();
  const [draft, setDraft] = useState<IndividualServingDraftV2 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const original = useRef<IndividualServingDraftV2 | null>(null);
  const invoker = useRef<HTMLButtonElement | null>(null);
  const editing = draft !== null && value.servingOptions.some((row) => row.id === draft.id);
  function open(option: IndividualServingDraftV2, button: HTMLButtonElement) {
    original.current = {...option}; invoker.current = button;
    setError(null); setDraft({...option});
  }
  async function close() {
    if (JSON.stringify(draft) !== JSON.stringify(original.current) && !await confirm({message: "Discard unsaved serving size changes?", confirmLabel: "Discard Changes"})) return;
    setDraft(null);
  }
  function save() {
    if (!draft || disabled) return;
    const name = draft.name.trim().replace(/\s+/gu, " ");
    const key = (text: string) => text.trim().replace(/\s+/gu, " ").normalize("NFKC").toLocaleLowerCase("en-PH");
    const integer = (text: string, max: number) => /^\d+$/u.test(text) && Number.isSafeInteger(Number(text)) && Number(text) >= 1 && Number(text) <= max;
    const price = packageMoneyCentavos(draft.priceText);
    let message: string | null = null;
    if (!name || name.length > 80 || /[\p{Cc}\p{Cf}]/u.test(name)) message = "Enter a serving name of 1 to 80 safe characters.";
    else if (value.servingOptions.some((row) => row.id !== draft.id && key(row.name) === key(name))) message = "A serving size with this name already exists.";
    else if (!integer(draft.minimumServingsText, 10000) || !integer(draft.maximumServingsText, 10000) || Number(draft.minimumServingsText) > Number(draft.maximumServingsText)) message = "Enter whole serving counts from 1 to 10,000, with minimum no greater than maximum.";
    else if (!integer(draft.minimumQuantityText, 100) || !integer(draft.maximumQuantityText, 100) || Number(draft.minimumQuantityText) > Number(draft.maximumQuantityText)) message = "Enter whole quantities from 1 to 100, with minimum no greater than maximum.";
    else if (price === null || price <= 0 || price * Number(draft.maximumQuantityText) > 1000000000) message = "Enter a positive PHP price with at most two decimal places. Price times maximum quantity cannot exceed PHP 10,000,000.";
    else if (!editing && value.servingOptions.length >= 8) message = "A maximum of eight serving sizes is allowed.";
    if (message) {setError(message); return;}
    const saved = {...draft, name};
    onChange({...value, servingOptions: editing ? value.servingOptions.map((row) => row.id === saved.id ? saved : row) : [...value.servingOptions, saved]});
    setDraft(null);
  }

  return (
    <section
      aria-label="Individual food product"
      className="grid gap-4 rounded-2xl border border-border bg-muted/20 p-4 sm:p-5"
    >
      <div className="space-y-1">
        <h3 className="text-base font-semibold">
          Individual food product
        </h3>
        <p className="text-sm text-muted-foreground">
          Set up one food product with up to eight serving sizes.
          Unfinished entries can be saved as private editor progress.
          Customer ordering is not available yet.
        </p>
      </div>

      <label className="grid gap-2 text-sm font-medium">
        Food product name
        <input
          className="h-11 rounded-lg border border-input bg-background px-3 text-foreground"
          value={value.name}
          placeholder="e.g. Pancit Canton Bilao"
          maxLength={120}
          disabled={disabled}
          onChange={(event) =>
            onChange({...value, name: event.target.value})
          }
        />
      </label>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="text-sm font-semibold">
          Serving sizes ({value.servingOptions.length}/8)
        </h4>

        <button
          type="button"
          className="rounded-lg border border-primary px-3 py-2 text-sm font-medium text-primary disabled:opacity-50"
          disabled={disabled || value.servingOptions.length >= 8}
          onClick={(event) => open(createOption(), event.currentTarget)}
        >
          Add serving size
        </button>
      </div>

      {value.servingOptions.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          No serving sizes added yet.
        </p>
      ) : null}

      {value.servingOptions.map((option, index) => (
        <div key={option.id} role="group" aria-label={`Serving option ${index + 1}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background p-4">
          <div className="space-y-1"><h5 className="font-semibold">{option.name || "Unnamed serving size"}</h5>
            <p className="text-sm text-muted-foreground">{option.minimumServingsText || "Incomplete"} - {option.maximumServingsText || "Incomplete"} servings | {packageMoneyCentavos(option.priceText) === null ? "Price incomplete" : formatPackageCentavos(packageMoneyCentavos(option.priceText)!)} | Quantity {option.minimumQuantityText || "Incomplete"} - {option.maximumQuantityText || "Incomplete"}</p></div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" disabled={disabled} aria-label={`Edit serving option ${index + 1}`} onClick={(event) => open(option, event.currentTarget)}>Edit</Button>
            <Button type="button" variant="secondary" disabled={disabled} aria-label={`Remove serving option ${index + 1}`} onClick={async () => {
              if (await confirm({message: `Remove ${option.name || "this serving size"}?`, confirmLabel: "Remove"})) onChange({...value, servingOptions: value.servingOptions.filter((row) => row.id !== option.id)});
            }}>Remove</Button>
          </div>
        </div>
      ))}
      <Dialog open={draft !== null} onOpenChange={(open) => {if (!open) close();}}>
        <DialogContent onInteractOutside={(event) => event.preventDefault()} onCloseAutoFocus={(event) => {event.preventDefault(); invoker.current?.focus();}}>
          <DialogHeader><DialogTitle>{editing ? "Edit Serving Size" : "Add Serving Size"}</DialogTitle>
            <DialogDescription>Set the serving range, PHP price and order quantities. Changes stay in this wizard until saved.</DialogDescription></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {fields.map((field) => <label key={field.key} className="grid gap-1 text-sm font-medium">{field.label}
              <input className="h-11 rounded-lg border border-input bg-background px-3" value={draft?.[field.key] ?? ""} placeholder={field.placeholder} maxLength={field.key === "name" ? 80 : 64} disabled={disabled}
                inputMode={field.key === "name" ? "text" : field.key === "priceText" ? "decimal" : "numeric"}
                onChange={(event) => {setDraft((current) => current ? {...current, [field.key]: event.target.value} : current); setError(null);}}
                onKeyDown={(event) => {if (event.key === "Enter") {event.preventDefault(); save();}}} />
            </label>)}
          </div>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter><Button type="button" variant="secondary" onClick={close}>Cancel</Button>
            <Button type="button" disabled={disabled} onClick={save}>{editing ? "Save Changes" : "Save Serving Size"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="text-xs text-muted-foreground">
        These fields are private draft data. Prices are not used
        in customer bookings or payment calculations.
      </p>
      {confirmationDialog}
    </section>
  );
}