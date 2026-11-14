"use client";
import {ProviderPackageIntegerInput, isPackageIntegerEdit} from "./provider-package-integer-input";
import {usePackageConfirmation} from "./use-package-confirmation";

import {useRef, useState} from "react";
import type {FoodChoiceGroupV2} from "@feasta/shared-types/provider-package-v2";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {parseFoodChoiceGroupsV2} from "@/lib/provider/food-choice-groups-v2";

type Draft = {group: FoodChoiceGroupV2; minimum: string; maximum: string; minimumError?: string; maximumError?: string};
const key = (text: string) => text.trim().replace(/\s+/gu, " ").normalize("NFKC").toLocaleLowerCase("en-PH");

export function ProviderPackageFoodChoices({value, onChange, disabled = false}: {
  value: FoodChoiceGroupV2[];
  onChange: (groups: FoodChoiceGroupV2[]) => void;
  disabled?: boolean;
}) {
  const {confirm, confirmationDialog} = usePackageConfirmation();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const original = useRef("");
  const opener = useRef<HTMLButtonElement | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const otherGroups = value.filter((group) => group.id !== draft?.group.id);
  const total = otherGroups.reduce((sum, group) => sum + group.options.length, 0);

  function open(button: HTMLButtonElement, group?: FoodChoiceGroupV2) {
    const next = {group: group ? {...group, options: group.options.map((option) => ({...option}))} :
      {id: crypto.randomUUID(), title: "", selectionCount: 1,
        options: [{id: crypto.randomUUID(), name: ""}, {id: crypto.randomUUID(), name: ""}]},
      minimum: String(group?.selectionCount ?? 1), maximum: String(group?.selectionCount ?? 1)};
    opener.current = button;
    original.current = JSON.stringify(next);
    setError(null);
    setDraft(next);
  }
  async function close() {
    if (draft && JSON.stringify(draft) !== original.current && !await confirm({message: "Discard unsaved food choice group changes?", confirmLabel: "Discard Changes"})) return;
    setDraft(null);
    setError(null);
  }
  function updateDraft(next: Draft) {
    setDraft(next);
    setError(null);
  }
  const selectionError = draft?.minimumError || draft?.maximumError || (draft && (!draft.minimum || !draft.maximum ||
    !isPackageIntegerEdit(draft.minimum, draft.group.options.length) ||
    !isPackageIntegerEdit(draft.maximum, draft.group.options.length))
    ? "Selection limits must be whole numbers from 1 to the number of food options."
    : draft && Number(draft.minimum) > Number(draft.maximum)
      ? "Minimum selections must be no greater than maximum selections."
      : draft && draft.minimum !== draft.maximum
        ? "V2 requires an exact selection count. Minimum and maximum selections must match." : null);
  function save() {
    if (!draft || disabled || selectionError) return;
    const {group, minimum, maximum} = draft;
    const min = Number(minimum), max = Number(maximum);
    let message: string | null = null;
    if (!group.title.trim() || group.options.some((option) => !option.name.trim())) message = "Enter a group name and a name for every food option.";
    else if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min < 1 || max < min || max > group.options.length) message = "Selection limits must be whole numbers from 1 to the number of food options, with minimum no greater than maximum.";
    else if (min !== max) message = "V2 requires an exact selection count. Minimum and maximum selections must match.";
    else if (otherGroups.some((row) => key(row.title) === key(group.title))) message = "A choice group with this name already exists.";
    else if (new Set(group.options.map((option) => key(option.name))).size !== group.options.length) message = "Food options must be unique within this group.";
    const saved = {...group, selectionCount: min};
    const next = value.some((row) => row.id === group.id) ? value.map((row) => row.id === group.id ? saved : row) : [...value, saved];
    if (!message) {
      try {parseFoodChoiceGroupsV2(next);} catch {message = "Use 2 to 10 food options per group, at most 10 groups and 50 options total. Names must meet V2 length and character limits.";}
    }
    if (message) {
      setError(message);
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    onChange(next);
    setDraft(null);
    setError(null);
  }
  return (
    <section aria-label="Customer-selectable food groups" className="space-y-4 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h4 className="font-bold">Customer-selectable food groups</h4>
          <p className="text-sm text-muted-foreground">Example: Main dish — offer 3 dishes, customer chooses exactly 1. Separate from dishes already included.</p></div>
        <Button ref={addButton} type="button" variant="secondary" disabled={disabled || value.length >= 10 || value.reduce((sum, group) => sum + group.options.length, 0) > 48}
          onClick={(event) => open(event.currentTarget)}>Add choice group</Button>
      </div>
      <p className="text-xs text-muted-foreground">Private draft only — customer booking cannot use these choices yet. Up to 10 groups, 10 dishes per group, 50 choices total.</p>
      {value.map((group, index) => <div key={group.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3">
        <div className="min-w-0 flex-1"><h5 className="break-words text-sm font-semibold">{group.title || `Choice group ${index + 1}`}</h5>
          <p className="text-sm text-muted-foreground">Choose exactly {group.selectionCount} from {group.options.length} food options</p>
          <p className="break-words text-sm">{group.options.map((option) => option.name || "Unnamed option").join(", ")}</p></div>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" disabled={disabled} aria-label={`Edit choice group ${index + 1}`} onClick={(event) => open(event.currentTarget, group)}>Edit</Button>
          <Button type="button" variant="ghost" disabled={disabled} aria-label={`Remove choice group ${index + 1}`} onClick={() => onChange(value.filter((row) => row.id !== group.id))}>Remove</Button>
        </div>
      </div>)}
      <Dialog open={draft !== null} onOpenChange={(isOpen) => {if (!isOpen) close();}}>
        <DialogContent onInteractOutside={(event) => event.preventDefault()} className="z-[70] flex max-h-[calc(100dvh-2rem)] min-w-0 max-w-xl flex-col gap-0 overflow-hidden p-0" overlayClassName="z-[60]"
          onEscapeKeyDown={(event) => event.stopPropagation()}
          onCloseAutoFocus={(event) => {event.preventDefault(); (opener.current?.isConnected ? opener.current : addButton.current)?.focus();}}>
          <DialogHeader className="shrink-0 border-b p-6 pr-14"><DialogTitle>{value.some((group) => group.id === draft?.group.id) ? "Edit Food Choice Group" : "Add Food Choice Group"}</DialogTitle>
            <DialogDescription>Set the food options customers can choose. V2 requires minimum and maximum selections to match.</DialogDescription></DialogHeader>
          {draft ? <>
            <div className="min-h-0 space-y-4 overflow-y-auto p-6">
              <label className="grid gap-2 text-sm font-medium">Group Name
                <Input autoFocus required maxLength={80} disabled={disabled} value={draft.group.title} placeholder="e.g., Main dish" onChange={(event) => updateDraft({...draft, group: {...draft.group, title: event.target.value}})} /></label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-medium">Minimum Selections<ProviderPackageIntegerInput label="Minimum Selections" maximum={draft.group.options.length} disabled={disabled} value={draft.minimum} onChange={(minimum, minimumError) => updateDraft({...draft, minimum, minimumError})} /></label>
                <label className="grid gap-2 text-sm font-medium">Maximum Selections<ProviderPackageIntegerInput label="Maximum Selections" maximum={draft.group.options.length} disabled={disabled} value={draft.maximum} onChange={(maximum, maximumError) => updateDraft({...draft, maximum, maximumError})} /></label>
              </div>
              {selectionError ? <p role="alert" className="text-sm text-destructive">{selectionError}</p> : null}
              <fieldset className="space-y-3"><legend className="text-sm font-semibold">Food Options</legend>
                {draft.group.options.map((option, index) => <div className="flex items-end gap-2" key={option.id}>
                  <label className="grid min-w-0 flex-1 gap-1 text-sm font-medium">Food option {index + 1}<Input required maxLength={120} disabled={disabled} value={option.name} onChange={(event) => updateDraft({...draft, group: {...draft.group, options: draft.group.options.map((row) => row.id === option.id ? {...row, name: event.target.value} : row)}})} /></label>
                  <Button type="button" variant="secondary" disabled={disabled || draft.group.options.length <= 2} aria-label={`Remove food option ${index + 1}`} onClick={() => updateDraft({...draft, group: {...draft.group, options: draft.group.options.filter((row) => row.id !== option.id)}})}>Remove</Button>
                </div>)}
                <Button type="button" variant="secondary" disabled={disabled || draft.group.options.length >= 10 || total + draft.group.options.length >= 50} onClick={() => updateDraft({...draft, group: {...draft.group, options: [...draft.group.options, {id: crypto.randomUUID(), name: ""}]}})}>Add dish option</Button>
              </fieldset>
              {error ? <p ref={errorRef} tabIndex={-1} role="alert" className="text-sm text-destructive">{error}</p> : null}
            </div>
            <DialogFooter className="shrink-0 border-t p-4"><Button type="button" variant="secondary" onClick={close}>Cancel</Button><Button type="button" disabled={disabled || Boolean(selectionError)} onClick={save}>Save choice group</Button></DialogFooter>
          </> : null}
        </DialogContent>
      </Dialog>
      {confirmationDialog}
    </section>
  );
}
