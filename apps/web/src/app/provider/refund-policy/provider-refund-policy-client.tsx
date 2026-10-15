"use client";

import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Info,
  PackageOpen,
  Pencil,
  Plus,
  RotateCcw,
} from "lucide-react";
import {useRouter} from "next/navigation";
import {useMemo, useState} from "react";

import {
  REFUND_ELIGIBILITY_STAGES,
  REFUND_POLICY_TERMS_MAX_LENGTH,
  type RefundEligibilityStage,
} from "@feasta/shared-types";

import {FormField} from "@/components/forms/form-field";
import {PageHeading} from "@/components/layout/page-heading";
import {ConfirmationDialog} from "@/components/shared/confirmation-dialog";
import {StatusBadge} from "@/components/shared/status-badge";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {
  publishProviderRefundPolicy,
  setPackageRefundPolicyOverride,
  type RefundPolicyDraftPayload,
} from "@/lib/provider/refund-policy/provider-refund-policy-client";
import type {
  ProviderPackageRefundPolicyDto,
  ProviderRefundPolicyDto,
  ProviderRefundPolicyPageDto,
} from "@/lib/provider/refund-policy/provider-refund-policy-types";
import {
  formatBasisPoints,
  validateRefundPolicy,
  type RefundPercentValues,
} from "@/lib/provider/refund-policy/provider-refund-policy-validation";

const stagePresentation: Record<RefundEligibilityStage, {
  title: string;
  description: string;
}> = {
  preparation_not_started: {
    title: "Preparation Not Started",
    description: "Before your team starts preparing for the event.",
  },
  preparation_started: {
    title: "Preparation Started",
    description: "After preparation, procurement, or event setup has started.",
  },
  service_started: {
    title: "Service Started",
    description: "Once the actual event service has begun.",
  },
};

type EditorTarget =
  | {kind: "provider"; policy: ProviderRefundPolicyDto | null}
  | {kind: "package"; package: ProviderPackageRefundPolicyDto};

type Feedback = {tone: "success" | "error"; message: string} | null;

export function ProviderRefundPolicyClient({data}: {
  data: ProviderRefundPolicyPageDto;
}) {
  const router = useRouter();
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [removePackage, setRemovePackage] =
    useState<ProviderPackageRefundPolicyDto | null>(null);
  const [removing, setRemoving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  async function handleRemoveOverride() {
    if (!removePackage || removing) return;
    setRemoving(true);
    setFeedback(null);
    try {
      await setPackageRefundPolicyOverride(removePackage.packageId, null);
      setRemovePackage(null);
      setFeedback({
        tone: "success",
        message: "Package override removed. This package now uses your Provider default policy.",
      });
      router.refresh();
    } catch (caught) {
      setFeedback({tone: "error", message: refundPolicyErrorMessage(caught, true)});
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="grid min-w-0 gap-6">
      <PageHeading
        eyebrow="Provider management"
        title="Refund Policy"
        description="Define how much Customers may receive back when an accepted booking is cancelled."
      />

      {feedback ? (
        <div
          role={feedback.tone === "error" ? "alert" : "status"}
          aria-live="polite"
          className={feedback.tone === "error"
            ? "flex items-start gap-3 rounded-xl border border-destructive bg-destructive-subtle p-4 text-destructive"
            : "flex items-start gap-3 rounded-xl border border-success bg-success-subtle p-4 text-success"}
        >
          {feedback.tone === "error"
            ? <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            : <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0" />}
          <p className="font-semibold">{feedback.message}</p>
        </div>
      ) : null}

      <section aria-labelledby="provider-default-policy" className="grid gap-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="provider-default-policy" className="text-2xl font-black tracking-tight">
              Provider Default Policy
            </h2>
            <p className="mt-1 text-muted-foreground">
              This policy applies to future bookings unless a package has its own override.
            </p>
          </div>
        </div>

        {data.providerPolicy ? (
          <PolicyCard
            policy={data.providerPolicy}
            action={
              <Button
                variant="secondary"
                size="compact"
                onClick={() => {
                  setFeedback(null);
                  setEditor({kind: "provider", policy: data.providerPolicy});
                }}
              >
                <Pencil aria-hidden="true" className="size-4" />
                Edit Policy
              </Button>
            }
          />
        ) : (
          <div className="rounded-xl border border-dashed border-input bg-card p-6 sm:p-8">
            <FileText aria-hidden="true" className="size-9 text-primary" />
            <h3 className="mt-4 text-xl font-bold">Create your Provider default policy</h3>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              A Provider default policy is required before refund-policy-backed bookings can be enforced. Define all three stages to make the outcome clear for Customers.
            </p>
            <Button
              className="mt-5"
              onClick={() => {
                setFeedback(null);
                setEditor({kind: "provider", policy: null});
              }}
            >
              <Plus aria-hidden="true" className="size-5" />
              Create Policy
            </Button>
          </div>
        )}
      </section>

      {editor ? (
        <PolicyEditor
          key={editorKey(editor)}
          target={editor}
          providerPolicy={data.providerPolicy}
          onCancel={() => setEditor(null)}
          onPublished={(message) => {
            setEditor(null);
            setFeedback({tone: "success", message});
            router.refresh();
          }}
          onError={(message) => setFeedback({tone: "error", message})}
        />
      ) : null}

      <section aria-labelledby="package-overrides" className="grid gap-4">
        <div>
          <h2 id="package-overrides" className="text-2xl font-black tracking-tight">
            Package Overrides
          </h2>
          <p className="mt-1 max-w-3xl text-muted-foreground">
            A package override completely replaces your Provider default refund policy for bookings using this package. It does not merge with the default policy.
          </p>
        </div>

        {data.packages.length === 0 ? (
          <div className="rounded-xl border border-dashed border-input bg-card p-6 text-center sm:p-8">
            <PackageOpen aria-hidden="true" className="mx-auto size-9 text-muted-foreground" />
            <h3 className="mt-3 text-lg font-bold">No packages to configure</h3>
            <p className="mt-1 text-muted-foreground">
              Package refund policy options will appear here after you create a package.
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {data.packages.length === 100 ? (
              <p className="rounded-lg border border-info bg-info-subtle p-3 text-sm">
                Showing your 100 most recently created packages.
              </p>
            ) : null}
            {data.packages.map((item) => (
              <PackagePolicyCard
                key={item.packageId}
                item={item}
                providerPolicyExists={data.providerPolicy !== null}
                onEdit={() => {
                  setFeedback(null);
                  setEditor({kind: "package", package: item});
                }}
                onRemove={() => {
                  setFeedback(null);
                  setRemovePackage(item);
                }}
              />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="important-refund-information" className="rounded-xl border border-info bg-info-subtle p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <Info aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-info" />
          <div>
            <h2 id="important-refund-information" className="text-lg font-bold">
              Important Information
            </h2>
            <p className="mt-2 text-sm leading-6">
              Publishing creates a new policy version for future bookings. Existing bookings keep the refund policy they agreed to when booking. Additional terms explain your policy but never change the configured refund percentages.
            </p>
          </div>
        </div>
      </section>

      <ConfirmationDialog
        open={removePackage !== null}
        onOpenChange={(open) => {
          if (!open) setRemovePackage(null);
        }}
        title="Remove package override?"
        description="This package will use your current Provider default refund policy for future bookings. Existing bookings keep the policy they already agreed to."
        cancelLabel="Keep Override"
        confirmLabel="Remove Override"
        loadingLabel="Removing override"
        loading={removing}
        destructive
        onConfirm={handleRemoveOverride}
      />
    </div>
  );
}

function PolicyEditor({target, providerPolicy, onCancel, onPublished, onError}: {
  target: EditorTarget;
  providerPolicy: ProviderRefundPolicyDto | null;
  onCancel: () => void;
  onPublished: (message: string) => void;
  onError: (message: string) => void;
}) {
  const sourcePolicy = target.kind === "provider"
    ? target.policy
    : target.package.override ?? providerPolicy;
  const [values, setValues] = useState<RefundPercentValues>(() =>
    percentValues(sourcePolicy));
  const [terms, setTerms] = useState(sourcePolicy?.terms ?? "");
  const [errors, setErrors] = useState<ReturnType<typeof validateRefundPolicy>["errors"]>({});
  const [draft, setDraft] = useState<RefundPolicyDraftPayload | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const isPackage = target.kind === "package";
  const editing = isPackage ? target.package.override !== null : target.policy !== null;

  const preview = useMemo(() => REFUND_ELIGIBILITY_STAGES.map((stage) => ({
    stage,
    display: values[stage].trim() || "—",
  })), [values]);

  function preparePublish(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validateRefundPolicy(values, terms);
    setErrors(result.errors);
    if (!result.draft) return;
    setDraft(result.draft);
    setConfirmOpen(true);
  }

  async function publish() {
    if (!draft || submitting) return;
    setSubmitting(true);
    try {
      if (target.kind === "provider") {
        await publishProviderRefundPolicy(draft);
        onPublished("Refund policy published.");
      } else {
        await setPackageRefundPolicyOverride(target.package.packageId, draft);
        onPublished("Package refund policy updated.");
      }
      setConfirmOpen(false);
    } catch (caught) {
      setConfirmOpen(false);
      onError(refundPolicyErrorMessage(caught, target.kind === "package"));
    } finally {
      setSubmitting(false);
    }
  }

  const submitLabel = isPackage
    ? editing ? "Publish Updated Override" : "Publish Override"
    : editing ? "Publish Updated Policy" : "Publish Policy";

  return (
    <section aria-labelledby="policy-editor-heading" className="scroll-mt-6 rounded-xl border border-primary/30 bg-card p-5 shadow-sm sm:p-6">
      <form onSubmit={preparePublish} noValidate className="grid min-w-0 gap-6">
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-primary-strong">
            {isPackage ? "Package policy" : "Provider default"}
          </p>
          <h2 id="policy-editor-heading" className="mt-1 text-2xl font-black tracking-tight">
            {isPackage
              ? `${editing ? "Edit" : "Create"} Override: ${target.package.name}`
              : `${editing ? "Edit" : "Create"} Refund Policy`}
          </h2>
          {isPackage && !target.package.override && providerPolicy ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Values are prefilled from your current Provider default for convenience. Publishing saves all three rules as a complete, independent package override.
            </p>
          ) : null}
        </div>

        <fieldset className="grid gap-4">
          <legend className="text-lg font-bold">Refund percentages by stage</legend>
          <div className="grid gap-4 lg:grid-cols-3">
            {REFUND_ELIGIBILITY_STAGES.map((stage) => (
              <FormField
                key={stage}
                id={`refund-percent-${stage}`}
                label={stagePresentation[stage].title}
                description={stagePresentation[stage].description}
                error={errors[stage]}
                required
              >
                <div className="relative">
                  <Input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={values[stage]}
                    onChange={(event) => {
                      setValues((current) => ({...current, [stage]: event.target.value}));
                      setErrors((current) => ({...current, [stage]: undefined}));
                    }}
                    className="pr-14"
                  />
                  <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-4 flex items-center font-bold text-muted-foreground">%</span>
                  <span className="sr-only">Enter a percentage from zero to one hundred.</span>
                </div>
              </FormField>
            ))}
          </div>
        </fieldset>

        <FormField
          id="refund-policy-terms"
          label="Additional Policy Terms"
          description="Use this to explain your refund policy in plain language. These terms do not change the refund percentages above."
          error={errors.terms}
        >
          <Textarea
            value={terms}
            maxLength={REFUND_POLICY_TERMS_MAX_LENGTH}
            onChange={(event) => {
              setTerms(event.target.value);
              setErrors((current) => ({...current, terms: undefined}));
            }}
          />
          <p className="text-right text-sm text-muted-foreground" aria-live="polite">
            {terms.length.toLocaleString()} / {REFUND_POLICY_TERMS_MAX_LENGTH.toLocaleString()} characters
          </p>
        </FormField>

        <div className="rounded-xl bg-muted p-4 sm:p-5">
          <h3 className="font-bold">Plain-language preview</h3>
          <dl className="mt-3 grid gap-3 sm:grid-cols-3">
            {preview.map(({stage, display}) => (
              <div key={stage} className="rounded-lg bg-card p-3">
                <dt className="text-sm text-muted-foreground">
                  If {stage === "preparation_not_started"
                    ? "preparation has not started"
                    : stage === "preparation_started"
                      ? "preparation has started"
                      : "service has started"}:
                </dt>
                <dd className="mt-1 font-bold">Customer refund: {display}%</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            This preview is informational. FEASTA’s trusted backend remains authoritative.
          </p>
        </div>

        <div className="rounded-xl border border-warning bg-warning-subtle p-4 text-sm">
          <p className="font-bold">Publishing creates a new policy version.</p>
          <p className="mt-1">Existing bookings keep the refund policy they agreed to when booking.</p>
        </div>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button type="submit">{submitLabel}</Button>
        </div>
      </form>

      <ConfirmationDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={isPackage ? "Publish package refund policy?" : "Publish refund policy?"}
        description="This creates a new policy version for future bookings. Existing bookings keep their original agreed policy."
        cancelLabel="Cancel"
        confirmLabel={submitLabel}
        loadingLabel="Publishing policy"
        loading={submitting}
        onConfirm={publish}
      />
    </section>
  );
}

function PolicyCard({policy, action}: {
  policy: ProviderRefundPolicyDto;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status="published" />
          <span className="text-sm font-semibold text-muted-foreground">Version {policy.version}</span>
          <span className="text-sm text-muted-foreground">Updated {formatEffectiveAt(policy.effectiveAt)}</span>
        </div>
        {action}
      </div>
      <PolicyRules policy={policy} />
      <div className="mt-5 border-t border-border pt-4">
        <h3 className="text-sm font-bold">Additional Policy Terms</h3>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">
          {policy.terms || "No additional terms."}
        </p>
      </div>
    </div>
  );
}

function PackagePolicyCard({item, providerPolicyExists, onEdit, onRemove}: {
  item: ProviderPackageRefundPolicyDto;
  providerPolicyExists: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const editable = item.status !== "archived" && providerPolicyExists;
  return (
    <article className="min-w-0 rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="break-words text-lg font-bold">{item.name}</h3>
            <StatusBadge status={item.status} />
          </div>
          <p className="mt-2 font-semibold">
            {item.override ? "Package Override" : "Uses Provider Default"}
          </p>
          {!providerPolicyExists ? (
            <p className="mt-1 text-sm text-warning">
              Create your Provider default policy before managing package overrides.
            </p>
          ) : item.status === "archived" ? (
            <p className="mt-1 text-sm text-muted-foreground">Archived package policies cannot be changed.</p>
          ) : null}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="secondary"
            size="compact"
            disabled={!editable}
            aria-label={`${item.override ? "Edit" : "Create"} refund policy override for ${item.name}`}
            onClick={onEdit}
          >
            {item.override ? <Pencil aria-hidden="true" className="size-4" /> : <Plus aria-hidden="true" className="size-4" />}
            {item.override ? "Edit Override" : "Create Override"}
          </Button>
          {item.override ? (
            <Button
              variant="ghost"
              size="compact"
              disabled={!editable}
              aria-label={`Remove refund policy override for ${item.name}`}
              onClick={onRemove}
            >
              <RotateCcw aria-hidden="true" className="size-4" />
              Remove Override
            </Button>
          ) : null}
        </div>
      </div>
      {item.override ? (
        <>
          <PolicyRules policy={item.override} />
          <p className="mt-4 text-sm text-muted-foreground">
            Version {item.override.version} · Updated {formatEffectiveAt(item.override.effectiveAt)}
          </p>
        </>
      ) : null}
    </article>
  );
}

function PolicyRules({policy}: {policy: ProviderRefundPolicyDto}) {
  return (
    <dl className="mt-5 grid gap-3 sm:grid-cols-3">
      {policy.rules.map((rule) => (
        <div key={rule.stage} className="min-w-0 rounded-lg bg-muted p-4">
          <dt className="text-sm font-semibold text-muted-foreground">
            {stagePresentation[rule.stage].title}
          </dt>
          <dd className="mt-1 text-2xl font-black">
            {formatBasisPoints(rule.refundBasisPoints)}%
          </dd>
        </div>
      ))}
    </dl>
  );
}

function percentValues(policy: ProviderRefundPolicyDto | null): RefundPercentValues {
  const defaults: RefundPercentValues = {
    preparation_not_started: "100",
    preparation_started: "50",
    service_started: "0",
  };
  if (!policy) return defaults;
  for (const rule of policy.rules) {
    defaults[rule.stage] = formatBasisPoints(rule.refundBasisPoints);
  }
  return defaults;
}

function editorKey(editor: EditorTarget): string {
  return editor.kind === "provider"
    ? `provider-${editor.policy?.version ?? "new"}`
    : `package-${editor.package.packageId}-${editor.package.override?.version ?? "new"}`;
}

function formatEffectiveAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "date unavailable";
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(date);
}

export function refundPolicyErrorMessage(caught: unknown, packageAction = false): string {
  const code = typeof caught === "object" && caught && "code" in caught
    ? String((caught as {code?: unknown}).code).replace(/^functions\//u, "")
    : caught instanceof Error ? caught.message : "";
  if (code === "permission-denied") {
    return packageAction
      ? "This package is not available for your Provider account."
      : "You don't have permission to manage this refund policy.";
  }
  if (code === "not-found" || code === "invalid-package-id") {
    return "This package is not available for your Provider account.";
  }
  if (code === "invalid-argument") {
    return "Check the refund percentages and try again.";
  }
  if (code === "failed-precondition") {
    return "This refund policy can’t be updated right now.";
  }
  if (code === "unauthenticated" || code === "session-expired") {
    return "Your session has expired. Sign in again to continue.";
  }
  return "We couldn't update the refund policy. Please try again.";
}
