"use client";

import {useState} from "react";

import {feastaToast} from "@/components/feedback/toast";
import {FormField} from "@/components/forms/form-field";
import {CheckboxField} from "@/components/forms/selection-controls";
import {Button} from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import type {
  AdminAgreementTemplate,
  AgreementTypeRecord,
} from "@/lib/admin/file-maintenance/admin-document-catalog-types";
import {updateAdminAgreementType} from "@/lib/admin/file-maintenance/admin-document-catalog-client";
import {currentPublishedVersion} from "@/lib/documents/agreement-version-history";

const PRODUCT_AGREEMENT_TYPE_CODES = new Set([
  "provider_agreement",
  "terms_of_service",
  "privacy_policy",
]);

const PURPOSE_NOTES: Record<AgreementTypeRecord["purpose"], string> = {
  provider_onboarding: "System purpose: provider onboarding",
  platform_terms: "System purpose: platform terms",
  privacy_notice: "System purpose: privacy notice",
  custom: "System purpose: custom",
};

function productAgreementTypes(types: readonly AgreementTypeRecord[]) {
  return types.filter((type) => PRODUCT_AGREEMENT_TYPE_CODES.has(type.code));
}

export function AgreementTypePickerDialog({
  open,
  types,
  onOpenChange,
  onContinue,
}: {
  open: boolean;
  types: readonly AgreementTypeRecord[];
  onOpenChange: (open: boolean) => void;
  onContinue: (type: AgreementTypeRecord) => void;
}) {
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const activeTypes = productAgreementTypes(types)
    .filter((type) => type.isActive)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));

  const close = (next: boolean) => {
    if (!next) {
      setSelectedCode(null);
      setError(undefined);
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>What agreement do you want to create?</DialogTitle>
          <DialogDescription>
            Choose an agreement type. The type decides what the agreement is for.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3" role="radiogroup" aria-label="Agreement type">
          {activeTypes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active agreement types are available.</p>
          ) : activeTypes.map((type) => {
            const selected = selectedCode === type.code;
            return (
              <button
                key={type.code}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`grid gap-1 rounded-lg border p-4 text-left ${selected ? "border-primary" : "border-border"}`}
                onClick={() => {
                  setSelectedCode(type.code);
                  setError(undefined);
                }}
              >
                <span className="font-bold">{type.name}</span>
                <span className="text-sm text-muted-foreground">{type.description}</span>
              </button>
            );
          })}
        </div>
        {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => close(false)}>Cancel</Button>
          <Button
            type="button"
            onClick={() => {
              const selected = activeTypes.find((type) => type.code === selectedCode);
              if (!selected) {
                setError("Choose an agreement type.");
                return;
              }
              setSelectedCode(null);
              setError(undefined);
              onContinue(selected);
            }}
          >
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SingletonAgreementDialog({
  type,
  agreement,
  onOpenChange,
  onOpenAgreement,
  onCreateVersion,
}: {
  type: AgreementTypeRecord | null;
  agreement: AdminAgreementTemplate | null;
  onOpenChange: (open: boolean) => void;
  onOpenAgreement: () => void;
  onCreateVersion: () => void;
}) {
  const current = agreement ? currentPublishedVersion(agreement) : null;
  const draft = agreement?.versions?.find((version) => version.status === "draft");
  return (
    <Dialog open={Boolean(type && agreement)} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-xl">
        <DialogHeader>
          <DialogTitle>{type ? `${type.name} already exists.` : "Agreement already exists."}</DialogTitle>
          <DialogDescription>
            This agreement type can have only one agreement. Create a new version to change it.
          </DialogDescription>
        </DialogHeader>
        {current ? (
          <p className="text-sm font-bold">Current version: {current.version}</p>
        ) : (
          <p className="text-sm font-bold">
            {draft ? `Draft version: ${draft.version}` : "No published version yet."}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onOpenAgreement}>Open agreement</Button>
          {current ? (
            <Button type="button" onClick={onCreateVersion}>Create new version</Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AgreementTypeManagerDialog({
  open,
  types,
  onOpenChange,
  onType,
}: {
  open: boolean;
  types: readonly AgreementTypeRecord[];
  onOpenChange: (open: boolean) => void;
  onType: (type: AgreementTypeRecord) => void;
}) {
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const managedTypes = productAgreementTypes(types);

  return (
    <Dialog open={open} onOpenChange={(next) => {
      if (!next && !pendingCode) {
        setError(undefined);
        onOpenChange(false);
      }
      if (next) onOpenChange(true);
    }}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Agreement types</DialogTitle>
          <DialogDescription>
            Names, descriptions, and active status can be changed. Purpose, singleton behavior, and system identity stay protected.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6">
          {managedTypes.map((type) => (
            <AgreementTypeEditor
              key={`${type.code}:${type.name}:${type.sortOrder}:${type.isActive}`}
              type={type}
              pending={pendingCode === type.code}
              onSave={async (input) => {
                setPendingCode(type.code);
                setError(undefined);
                try {
                  const result = await updateAdminAgreementType(input);
                  onType(result.agreementType ?? {...type, ...input});
                  feastaToast.success("Agreement type updated.");
                } catch (saveError: unknown) {
                  setError(saveError instanceof Error ? saveError.message : "The agreement type could not be saved.");
                } finally {
                  setPendingCode(null);
                }
              }}
            />
          ))}
        </div>
        {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
        <DialogFooter>
          <Button type="button" variant="secondary" disabled={Boolean(pendingCode)} onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AgreementTypeEditor({
  type,
  pending,
  onSave,
}: {
  type: AgreementTypeRecord;
  pending: boolean;
  onSave: (input: {
    code: string;
    name: string;
    description: string;
    isActive: boolean;
    sortOrder: number;
  }) => Promise<void>;
}) {
  const [name, setName] = useState(type.name);
  const [description, setDescription] = useState(type.description);
  const [isActive, setIsActive] = useState(type.isActive);
  const [localError, setLocalError] = useState<string>();

  return (
    <form
      className="grid gap-4 rounded-lg border border-border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const nextName = name.trim().replace(/\s+/g, " ");
        if (nextName.length < 2 || nextName.length > 120) {
          setLocalError("Enter a name between 2 and 120 characters.");
          return;
        }
        setLocalError(undefined);
        void onSave({
          code: type.code,
          name: nextName,
          description: description.trim(),
          isActive,
          sortOrder: type.sortOrder,
        });
      }}
    >
      <div>
        <h3 className="font-bold">{type.name}</h3>
        <p className="text-sm text-muted-foreground">{PURPOSE_NOTES[type.purpose]}</p>
      </div>
      <FormField label="Name" required>
        <Input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} />
      </FormField>
      <FormField label="Description">
        <Textarea value={description} maxLength={500} onChange={(event) => setDescription(event.target.value)} />
      </FormField>
      <CheckboxField
        label="Active"
        description="Inactive types are hidden when adding an agreement."
        checked={isActive}
        onChange={(event) => setIsActive(event.target.checked)}
      />
      {localError ? <p className="text-sm text-destructive" role="alert">{localError}</p> : null}
      <div>
        <Button type="submit" size="compact" loading={pending} loadingLabel="Saving">Save type</Button>
      </div>
    </form>
  );
}
