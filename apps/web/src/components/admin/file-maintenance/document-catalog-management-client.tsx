"use client";

import {Plus} from "lucide-react";
import {
  useMemo,
  useState,
  useTransition,
  type Dispatch,
  type FormEvent,
  type ReactNode,
  type SetStateAction,
} from "react";

import {AgreementVersionDialogs} from "@/components/admin/file-maintenance/agreement-version-dialogs";
import {DataTable, type DataTableColumn} from "@/components/data/data-table";
import {FilterToolbar} from "@/components/data/filter-toolbar";
import {feastaToast} from "@/components/feedback/toast";
import {FormField} from "@/components/forms/form-field";
import {CheckboxField} from "@/components/forms/selection-controls";
import {ConfirmationDialog} from "@/components/shared/confirmation-dialog";
import {Badge} from "@/components/ui/badge";
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
import {Select} from "@/components/ui/select";
import {Textarea} from "@/components/ui/textarea";
import {
  createAdminAgreementTemplate,
  createAdminBusinessDocumentType,
  deleteAdminAgreementTemplate,
  deleteAdminBusinessDocumentType,
  discontinueAdminAgreementTemplate,
  discontinueAdminBusinessDocumentType,
  reactivateAdminAgreementTemplate,
  reactivateAdminBusinessDocumentType,
  updateAdminAgreementTemplate,
  updateAdminBusinessDocumentType,
} from "@/lib/admin/file-maintenance/admin-document-catalog-client";
import type {
  AdminAgreementTemplate,
  AdminBusinessDocumentRule,
  AdminBusinessDocumentType,
  AgreementSection,
  AgreementVersionRecord,
  DocumentCatalogStatus,
} from "@/lib/admin/file-maintenance/admin-document-catalog-types";
import {
  bodyToSections,
  currentPublishedVersion,
  sectionsToBody,
} from "@/lib/documents/agreement-version-history";
import {
  FileMaintenanceRecordActions,
  type FileMaintenanceLifecycleAction,
} from "@/components/admin/file-maintenance/file-maintenance-record-actions";
import type {
  AdminServiceCategory,
} from "@/lib/admin/file-maintenance/admin-service-category-types";

type StatusFilter = "all" | DocumentCatalogStatus;
type LifecycleAction =
  FileMaintenanceLifecycleAction;

const SERVICE_TYPES = ["catering", "addon", "both"] as const;

type RuleTargetMode =
  | "all"
  | "service_type"
  | "service_category";

function ruleTargetMode(
  rule: AdminBusinessDocumentRule,
): RuleTargetMode {
  if (rule.serviceCategoryCodes.length > 0) {
    return "service_category";
  }

  if (rule.serviceTypes.length > 0) {
    return "service_type";
  }

  return "all";
}

function normalizeDocumentCode(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "_")
    .replaceAll(/^_+|_+$/gu, "");
}

function statusLabel(status: DocumentCatalogStatus): string {
  return status === "active" ? "Active" : "Discontinued";
}

function useCatalogFilter<T extends {name: string; status: DocumentCatalogStatus}>(
  records: readonly T[],
  search: string,
  status: StatusFilter,
  extra?: (record: T, query: string) => boolean,
) {
  return useMemo(() => {
    const query = search.trim().toLowerCase();
    return records
      .filter((record) => {
        if (status !== "all" && record.status !== status) return false;
        if (!query) return true;
        return record.name.toLowerCase().includes(query) ||
          (extra ? extra(record, query) : false);
      })
      .sort((left, right) =>
        left.name.localeCompare(right.name, undefined, {sensitivity: "base"}),
      );
  }, [extra, records, search, status]);
}

export function AgreementTemplateManagement({
  initialAgreements,
}: {
  initialAgreements: AdminAgreementTemplate[];
}) {
  const [agreements, setAgreements] = useState(initialAgreements);
  const [searchValue, setSearchValue] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<AdminAgreementTemplate | null>(null);
  const [draft, setDraft] = useState(emptyAgreement());
  const [formError, setFormError] = useState<string>();
  const [pendingRecord, setPendingRecord] = useState<AdminAgreementTemplate | null>(null);
  const [pendingAction, setPendingAction] = useState<LifecycleAction | null>(null);
  const [versionAgreement, setVersionAgreement] = useState<AdminAgreementTemplate | null>(null);
  const [versionMode, setVersionMode] = useState<"history" | "create" | "edit" | "view" | null>(null);
  const [versionSource, setVersionSource] = useState<AgreementVersionRecord | null>(null);
  const [isPending, startTransition] = useTransition();
  const publishedVersion = editing ? currentPublishedVersion(editing) : null;
  const filtered = useCatalogFilter(agreements, search, status, (record, query) =>
    record.code.includes(query) || record.version.toLowerCase().includes(query),
  );

  const columns = useMemo<DataTableColumn<AdminAgreementTemplate>[]>(() => [
    {
      id: "name",
      header: "Agreement",
      cell: (agreement) => (
        <div className="min-w-0">
          <p className="break-words font-bold">{agreement.name}</p>
          <p className="mt-1 break-all text-xs text-muted-foreground">
            {agreement.code} · Version {agreement.version}
          </p>
        </div>
      ),
    },
    {
      id: "onboarding",
      header: "Provider onboarding",
      cell: (agreement) => agreement.useForProviderOnboarding ? "Current agreement" : "Not assigned",
    },
    {
      id: "status",
      header: "Status",
      cell: (agreement) => (
        <Badge tone={agreement.status === "active" ? "success" : "warning"}>
          {statusLabel(agreement.status)}
        </Badge>
      ),
    },
  ], []);

  const openCreate = () => {
    setEditing(null);
    setDraft(emptyAgreement());
    setFormError(undefined);
    setEditorOpen(true);
  };

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = draft.name.trim().replace(/\s+/g, " ");
    if (name.length < 2) {
      setFormError("Enter an agreement name between 2 and 120 characters.");
      return;
    }
    const locked = editing ? currentPublishedVersion(editing) : null;
    let sections: AgreementSection[];
    if (locked) {
      sections = locked.sections;
    } else {
      try {
        sections = bodyToSections(draft.body);
      } catch (error: unknown) {
        setFormError(error instanceof Error ? error.message : "The agreement text is invalid.");
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/u.test(draft.effectiveDate)) {
        setFormError("Enter an effective date as YYYY-MM-DD.");
        return;
      }
    }
    startTransition(async () => {
      try {
        const input = {
          code: editing?.code ?? normalizeDocumentCode(name),
          categoryCode: "agreements",
          name,
          summary: draft.summary.trim(),
          version: locked ? locked.version : draft.version.trim(),
          effectiveDate: locked ? locked.effectiveDate : draft.effectiveDate,
          sections,
          useForProviderOnboarding: draft.useForProviderOnboarding,
        };
        if (input.code.length < 2 || input.version.length < 1) {
          setFormError("Enter a name and version that can identify this agreement.");
          return;
        }
        const result = editing
          ? await updateAdminAgreementTemplate(input)
          : await createAdminAgreementTemplate(input);
        const next: AdminAgreementTemplate = result?.agreement ?? {
          ...input,
          status: "active",
          sortName: name.toLowerCase(),
          versions: editing?.versions,
        };
        setAgreements((current) => {
          const withoutEdited = editing
            ? current.filter((agreement) => agreement.code !== editing.code)
            : current;
          const cleared = next.useForProviderOnboarding
            ? withoutEdited.map((agreement) => ({...agreement, useForProviderOnboarding: false}))
            : withoutEdited;
          return [...cleared.filter((agreement) => agreement.code !== next.code), next];
        });
        feastaToast.success(editing ? "Agreement updated." : "Agreement created.");
        setEditorOpen(false);
      } catch (error: unknown) {
        setFormError(error instanceof Error ? error.message : "The agreement could not be saved.");
      }
    });
  };

  const openVersions = (
    mode: "history" | "create" | "edit" | "view",
    source: AgreementVersionRecord | null,
  ) => {
    if (!editing) return;
    setVersionAgreement(editing);
    setVersionSource(source);
    setVersionMode(mode);
    setEditorOpen(false);
  };

  return (
    <>
    <CatalogSection
      title="Agreements and contracts"
      description="Publish the agreement providers read during onboarding. Mark one active agreement as the current provider onboarding agreement."
      actionLabel="Add agreement"
      onCreate={openCreate}
      searchValue={searchValue}
      onSearchChange={setSearchValue}
      onSearchSubmit={setSearch}
      onClear={() => {
        setSearchValue("");
        setSearch("");
        setStatus("all");
      }}
      status={status}
      onStatus={setStatus}
      columns={columns}
      rows={filtered}
      getRowId={(agreement) => agreement.code}
      caption="Agreements"
      emptyTitle="No agreements found"
      rowActions={(agreement) => (
        <FileMaintenanceRecordActions
          status={agreement.status}
          disabled={isPending}
          onEdit={() => {
            setEditing(agreement);
            setDraft({
              name: agreement.name,
              summary: agreement.summary,
              version: agreement.version,
              effectiveDate: agreement.effectiveDate,
              body: sectionsToBody(agreement.sections),
              useForProviderOnboarding: agreement.useForProviderOnboarding,
            });
            setFormError(undefined);
            setEditorOpen(true);
          }}
          onAction={(action) => {
            setPendingRecord(agreement);
            setPendingAction(action);
          }}
        />
      )}
      editorOpen={editorOpen}
      editorTitle={editing ? "Edit agreement" : "Add agreement"}
      editorDescription={publishedVersion
        ? "Published versions cannot be edited. Create a new version to change the agreement text or effective date."
        : "Saving publishes this first version. Use a heading line that starts with # for each section, and separate paragraphs with a blank line."}
      wide
      onEditorOpenChange={(open) => {
        if (!isPending) setEditorOpen(open);
      }}
      onSave={save}
      formError={formError}
      isPending={isPending}
      confirm={pendingRecord && pendingAction ? {
        title: `${pendingAction[0].toUpperCase()}${pendingAction.slice(1)} ${pendingRecord.name}?`,
        description: "The current provider onboarding agreement must be reassigned before it can be discontinued.",
        confirmLabel: pendingAction[0].toUpperCase() + pendingAction.slice(1),
        destructive: pendingAction !== "reactivate",
        onConfirm: () => confirmLifecycle(pendingRecord, pendingAction, {
          discontinue: discontinueAdminAgreementTemplate,
          reactivate: reactivateAdminAgreementTemplate,
          delete: deleteAdminAgreementTemplate,
        }, setAgreements, setPendingRecord, setPendingAction, startTransition, "Agreement"),
        onOpenChange: (open) => {
          if (!open && !isPending) {
            setPendingRecord(null);
            setPendingAction(null);
          }
        },
      } : null}
    >
      <FormField label="Agreement name" required>
        <Input value={draft.name} onChange={(event) => setDraft({...draft, name: event.target.value})} maxLength={120} />
      </FormField>
      {publishedVersion ? (
        <div className="grid gap-3">
          <p className="text-sm font-bold">Current version: {publishedVersion.version}</p>
          <div className="flex flex-wrap gap-2">
            {editing?.status === "active" ? (
              <Button type="button" onClick={() => openVersions("create", publishedVersion)}>
                Create new version
              </Button>
            ) : null}
            <Button type="button" variant="secondary" onClick={() => openVersions("history", null)}>
              Version history
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label="Version" required>
              <Input value={draft.version} onChange={(event) => setDraft({...draft, version: event.target.value})} maxLength={40} />
            </FormField>
            <FormField label="Effective date" required description="Use YYYY-MM-DD.">
              <Input value={draft.effectiveDate} onChange={(event) => setDraft({...draft, effectiveDate: event.target.value})} placeholder="YYYY-MM-DD" />
            </FormField>
          </div>
          <FormField label="Agreement text" required>
            <Textarea className="min-h-64 font-mono text-sm" value={draft.body} onChange={(event) => setDraft({...draft, body: event.target.value})} />
          </FormField>
        </>
      )}
      <CheckboxField
        label="Use for provider onboarding"
        description="Only one active agreement can be the agreement providers accept."
        checked={draft.useForProviderOnboarding}
        onChange={(event) => setDraft({...draft, useForProviderOnboarding: event.target.checked})}
      />
    </CatalogSection>
    <AgreementVersionDialogs
      agreement={versionAgreement}
      mode={versionMode}
      source={versionSource}
      onAgreement={(next) => {
        setAgreements((current) => current.map((item) => item.code === next.code ? next : item));
        setVersionAgreement(next);
        setEditing(next);
      }}
      onClose={() => {
        setVersionMode(null);
        setVersionSource(null);
      }}
      onMode={(mode, source) => {
        setVersionMode(mode);
        setVersionSource(source);
      }}
    />
    </>
  );
}

type RequirementSummary = {
  label: "Required" | "Conditional" | "Optional";
  detail: string;
};

function businessDocumentRequirementSummary(
  documentType: AdminBusinessDocumentType,
): RequirementSummary {
  if (documentType.rules.length === 0) {
    return {
      label: "Optional",
      detail: "Supporting document",
    };
  }

  const globallyRequired = documentType.rules.some(
    (rule) =>
      rule.effect === "required" &&
      rule.registrationScope === "any" &&
      rule.serviceTypes.length === 0 &&
      rule.serviceCategoryCodes.length === 0 &&
      rule.excludeServiceCategoryCodes.length === 0,
  );

  const hasAlternativeGroup =
    documentType.rules.some(
      (rule) => rule.effect === "one_of",
    );

  if (hasAlternativeGroup) {
    return {
      label: "Conditional",
      detail: "Alternative document group",
    };
  }

  if (globallyRequired) {
    return {
      label: "Required",
      detail: "Every provider",
    };
  }

  if (
    documentType.rules.some(
      (rule) =>
        rule.registrationScope ===
        "registered_business",
    )
  ) {
    return {
      label: "Conditional",
      detail: "Registered businesses",
    };
  }

  if (
    documentType.rules.some((rule) =>
      rule.serviceCategoryCodes.includes(
        "venue_provider",
      ),
    )
  ) {
    return {
      label: "Conditional",
      detail: "Venue providers",
    };
  }

  const serviceTypes = new Set(
    documentType.rules.flatMap(
      (rule) => rule.serviceTypes,
    ),
  );

  if (
    serviceTypes.has("catering") ||
    serviceTypes.has("both")
  ) {
    return {
      label: "Conditional",
      detail: "Catering providers",
    };
  }

  if (serviceTypes.has("addon")) {
    return {
      label: "Conditional",
      detail: "Add-on providers",
    };
  }

  return {
    label: "Conditional",
    detail: "Applies when its rule matches",
  };
}

export function BusinessDocumentManagement({
  initialDocuments,
  serviceCategories,
}: {
  initialDocuments: AdminBusinessDocumentType[];
  serviceCategories: AdminServiceCategory[];
}) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [searchValue, setSearchValue] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<AdminBusinessDocumentType | null>(null);
  const [draft, setDraft] = useState(emptyBusinessDocument());
  const [formError, setFormError] = useState<string>();
  const [pendingRecord, setPendingRecord] = useState<AdminBusinessDocumentType | null>(null);
  const [pendingAction, setPendingAction] = useState<LifecycleAction | null>(null);
  const [isPending, startTransition] = useTransition();
  const activeServiceCategories =
  useMemo(
    () =>
      serviceCategories
        .filter(
          (category) =>
            category.status === "active",
        )
        .toSorted((left, right) =>
          left.name.localeCompare(
            right.name,
            undefined,
            {sensitivity: "base"},
          ),
        ),
    [serviceCategories],
  );
  const filtered = useCatalogFilter(documents, search, status, (record, query) =>
    record.code.includes(query) || record.description.toLowerCase().includes(query),
  );

  const columns = useMemo<DataTableColumn<AdminBusinessDocumentType>[]>(() => [
    {
      id: "name",
      header: "Business document",
      cell: (documentType) => (
        <div className="min-w-0">
          <p className="break-words font-bold">{documentType.name}</p>
          <p className="mt-1 break-all text-xs text-muted-foreground">{documentType.code}</p>
        </div>
      ),
    },
    {
      id: "requirement",
      header: "Requirement",
      cell: (documentType) => {
        const requirement =
          businessDocumentRequirementSummary(
            documentType,
          );

        return (
          <div className="min-w-0">
            <p className="font-semibold">
              {requirement.label}
            </p>

            <p className="mt-1 text-xs text-muted-foreground">
              {requirement.detail}
            </p>
          </div>
        );
      },
    },
    {
      id: "status",
      header: "Status",
      cell: (documentType) => (
        <Badge tone={documentType.status === "active" ? "success" : "warning"}>
          {statusLabel(documentType.status)}
        </Badge>
      ),
    },
  ], []);

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = draft.name.trim().replace(/\s+/g, " ");
    if (name.length < 2) {
      setFormError("Enter a document name between 2 and 120 characters.");
      return;
    }
    const incompleteServiceTypeRule =
      draft.rules.some(
        (entry) =>
          entry.targetMode === "service_type" &&
          entry.serviceTypes.length === 0,
      );

    if (incompleteServiceTypeRule) {
      setFormError(
        "Select at least one provider service type.",
      );
      return;
    }

    const incompleteCategoryRule =
      draft.rules.some(
        (entry) =>
          entry.targetMode === "service_category" &&
          splitCodes(
            entry.serviceCategoryCodes,
          ).length === 0,
      );

    if (incompleteCategoryRule) {
      setFormError(
        "Select at least one service category.",
      );
      return;
    }
    let rules: AdminBusinessDocumentRule[];
    try {
      rules = draft.rules.map((entry) => ({
        effect: entry.effect,
        oneOfGroup:
          entry.effect === "one_of"
            ? normalizeDocumentCode(
                entry.oneOfGroup,
              )
            : "",
        registrationScope:
          entry.registrationScope,

        serviceTypes:
          entry.targetMode === "service_type"
            ? entry.serviceTypes
            : [],

        serviceCategoryCodes:
          entry.targetMode === "service_category"
            ? splitCodes(
                entry.serviceCategoryCodes,
              )
            : [],

        excludeServiceCategoryCodes: [],
      }));
    } catch (error: unknown) {
      setFormError(error instanceof Error ? error.message : "The requirement rules are invalid.");
      return;
    }
    if (rules.some((entry) => entry.effect === "one_of" && entry.oneOfGroup.length < 2)) {
      setFormError(
        "Each one-of rule needs a group code.",
      );
      return;
    }
    startTransition(async () => {
      try {
        const input = {
          code: editing?.code ?? normalizeDocumentCode(name),
          categoryCode: "business_documents",
          name,
          description: draft.description.trim(),
          rules,
        };
        if (input.code.length < 2) {
          setFormError("Enter a name that can generate a valid document code.");
          return;
        }
        if (editing) await updateAdminBusinessDocumentType(input);
        else await createAdminBusinessDocumentType(input);
        const next: AdminBusinessDocumentType = {
          ...input,
          status: "active",
          sortName: name.toLowerCase(),
        };
        setDocuments((current) => [
          ...current.filter((documentType) => documentType.code !== next.code),
          next,
        ]);
        feastaToast.success(editing ? "Business document updated." : "Business document created.");
        setEditorOpen(false);
      } catch (error: unknown) {
        setFormError(error instanceof Error ? error.message : "The business document could not be saved.");
      }
    });
  };

  return (
    <CatalogSection
      title="Business documents"
      description="Define the files providers upload. Requirement rules decide who must provide each document. A document with no rules remains an optional upload."
      actionLabel="Add business document"
      onCreate={() => {
        setEditing(null);
        setDraft(emptyBusinessDocument());
        setFormError(undefined);
        setEditorOpen(true);
      }}
      searchValue={searchValue}
      onSearchChange={setSearchValue}
      onSearchSubmit={setSearch}
      onClear={() => {
        setSearchValue("");
        setSearch("");
        setStatus("all");
      }}
      status={status}
      onStatus={setStatus}
      columns={columns}
      rows={filtered}
      getRowId={(documentType) => documentType.code}
      caption="Business documents"
      emptyTitle="No business documents found"
      rowActions={(documentType) => (
        <FileMaintenanceRecordActions
          status={documentType.status}
          disabled={isPending}
          onEdit={() => {
            setEditing(documentType);
            setDraft({
              name: documentType.name,
              description: documentType.description,
              rules: documentType.rules.map((entry) => ({
                ...entry,
                targetMode: ruleTargetMode(entry),
                serviceCategoryCodes:
                  entry.serviceCategoryCodes.join(", "),
                excludeServiceCategoryCodes:
                  entry.excludeServiceCategoryCodes.join(", "),
              })),
            });
            setFormError(undefined);
            setEditorOpen(true);
          }}
          onAction={(action) => {
            setPendingRecord(documentType);
            setPendingAction(action);
          }}
        />
      )}
      editorOpen={editorOpen}
      editorTitle={editing ? "Edit business document" : "Add business document"}
      editorDescription="Define who must submit this document. Choose all provider services, a provider service type, or specific service categories. Providers that do not match a requirement automatically treat the document as optional."
      wide
      onEditorOpenChange={(open) => {
        if (!isPending) setEditorOpen(open);
      }}
      onSave={save}
      formError={formError}
      isPending={isPending}
      confirm={pendingRecord && pendingAction ? {
        title: `${pendingAction[0].toUpperCase()}${pendingAction.slice(1)} ${pendingRecord.name}?`,
        description: "Discontinued documents cannot be newly uploaded. Delete is available only when no verification file uses the document.",
        confirmLabel: pendingAction[0].toUpperCase() + pendingAction.slice(1),
        destructive: pendingAction !== "reactivate",
        onConfirm: () => confirmLifecycle(pendingRecord, pendingAction, {
          discontinue: discontinueAdminBusinessDocumentType,
          reactivate: reactivateAdminBusinessDocumentType,
          delete: deleteAdminBusinessDocumentType,
        }, setDocuments, setPendingRecord, setPendingAction, startTransition, "Business document"),
        onOpenChange: (open) => {
          if (!open && !isPending) {
            setPendingRecord(null);
            setPendingAction(null);
          }
        },
      } : null}
    >
      <FormField label="Document name" required>
        <Input value={draft.name} onChange={(event) => setDraft({...draft, name: event.target.value})} maxLength={120} />
      </FormField>
      <FormField label="Description">
        <Textarea value={draft.description} onChange={(event) => setDraft({...draft, description: event.target.value})} maxLength={500} />
      </FormField>
      <div className="grid gap-4">
        {draft.rules.map((entry, index) => (
          <fieldset key={index} className="grid gap-4 rounded-lg border border-border p-4">
            <legend className="px-1 font-semibold">Rule {index + 1}</legend>
            <FormField label="Effect">
              <Select
                value={entry.effect}
                onChange={(event) => updateRule(setDraft, index, {
                  effect: event.target.value as "required" | "one_of",
                })}
              >
                <option value="required">Required</option>
                <option value="one_of">One of a group</option>
              </Select>
            </FormField>
            {entry.effect === "one_of" ? (
              <FormField label="Group code" description="Documents that share this code satisfy one requirement.">
                <Input value={entry.oneOfGroup} onChange={(event) => updateRule(setDraft, index, {oneOfGroup: event.target.value})} />
              </FormField>
            ) : null}
            <FormField label="Business registration type">
              <Select
                value={entry.registrationScope}
                onChange={(event) => updateRule(setDraft, index, {
                  registrationScope: event.target.value as AdminBusinessDocumentRule["registrationScope"],
                })}
              >
                <option value="any">Every provider</option>
                <option value="registered_business">Registered businesses</option>
                <option value="individual">Individuals</option>
              </Select>
            </FormField>
            <FormField
              label="Apply this requirement to"
              description="Choose one targeting method. Providers that do not match this requirement will treat the document as optional."
            >
              <Select
                value={entry.targetMode}
                onChange={(event) => {
                  const targetMode =
                    event.target.value as RuleTargetMode;

                  updateRule(setDraft, index, {
                    targetMode,

                    serviceTypes:
                      targetMode === "service_type"
                        ? entry.serviceTypes
                        : [],

                    serviceCategoryCodes:
                      targetMode === "service_category"
                        ? entry.serviceCategoryCodes
                        : "",

                    excludeServiceCategoryCodes: "",
                  });
                }}
              >
                <option value="all">
                  All provider services
                </option>

                <option value="service_type">
                  Provider service type
                </option>

                <option value="service_category">
                  Specific service categories
                </option>
              </Select>
            </FormField>
            {entry.targetMode === "service_type" ? (
              <fieldset className="grid gap-2">
                <legend className="text-sm font-semibold">
                  Provider service types
                </legend>

                <p className="text-sm text-muted-foreground">
                  Select one or more provider service types.
                </p>

                {SERVICE_TYPES.map((serviceType) => (
                  <CheckboxField
                    key={serviceType}
                    label={
                      serviceType === "catering"
                        ? "Catering only"
                        : serviceType === "addon"
                          ? "Add-on only"
                          : "Catering & Add-on"
                    }
                    checked={entry.serviceTypes.includes(
                      serviceType,
                    )}
                    onChange={(event) =>
                      updateRule(setDraft, index, {
                        serviceTypes:
                          event.target.checked
                            ? [
                                ...entry.serviceTypes,
                                serviceType,
                              ]
                            : entry.serviceTypes.filter(
                                (type) =>
                                  type !== serviceType,
                              ),
                      })
                    }
                  />
                ))}
              </fieldset>
            ) : null}
            {entry.targetMode ===
              "service_category" ? (
                <fieldset className="grid gap-2">
                  <legend className="text-sm font-semibold">
                    Service categories
                  </legend>

                  <p className="text-sm text-muted-foreground">
                    Select the specific service categories
                    that must provide this document.
                  </p>

                  {activeServiceCategories.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No active service categories are
                      available.
                    </p>
                  ) : (
                    activeServiceCategories.map(
                      (category) => {
                        const selectedCodes =
                          splitCodes(
                            entry.serviceCategoryCodes,
                          );

                        const checked =
                          selectedCodes.includes(
                            category.code,
                          );

                        return (
                          <CheckboxField
                            key={category.code}
                            label={`${category.name} · ${
                              category.serviceType ===
                              "catering"
                                ? "Catering"
                                : "Add-on"
                            }`}
                            checked={checked}
                            onChange={(event) => {
                              const nextCodes =
                                event.target.checked
                                  ? [
                                      ...selectedCodes,
                                      category.code,
                                    ]
                                  : selectedCodes.filter(
                                      (code) =>
                                        code !==
                                        category.code,
                                    );

                              updateRule(
                                setDraft,
                                index,
                                {
                                  serviceCategoryCodes:
                                    [
                                      ...new Set(
                                        nextCodes,
                                      ),
                                    ].join(", "),
                                },
                              );
                            }}
                          />
                        );
                      },
                    )
                  )}
                </fieldset>
              ) : null}
            <Button
              type="button"
              variant="secondary"
              size="compact"
              onClick={() => setDraft((current) => ({
                ...current,
                rules: current.rules.filter((_, ruleIndex) => ruleIndex !== index),
              }))}
            >
              Remove rule
            </Button>
          </fieldset>
        ))}
        <Button
          type="button"
          variant="secondary"
          onClick={() => setDraft((current) => ({
            ...current,
            rules: [...current.rules, emptyRule()],
          }))}
        >
          Add requirement rule
        </Button>
      </div>
    </CatalogSection>
  );
}

function emptyAgreement() {
  return {
    name: "",
    summary: "",
    version: "",
    effectiveDate: "",
    body: "# Section title\n\nWrite the first paragraph.\n\nWrite another paragraph if needed.",
    useForProviderOnboarding: false,
  };
}

function emptyBusinessDocument() {
  return {
    name: "",
    description: "",
    rules: [] as RuleDraft[],
  };
}

type RuleDraft = Omit<
  AdminBusinessDocumentRule,
  "serviceCategoryCodes" | "excludeServiceCategoryCodes"
> & {
  targetMode: RuleTargetMode;
  serviceCategoryCodes: string;
  excludeServiceCategoryCodes: string;
};

function emptyRule(): RuleDraft {
  return {
    effect: "required",
    oneOfGroup: "",
    registrationScope: "any",
    targetMode: "all",
    serviceTypes: [],
    serviceCategoryCodes: "",
    excludeServiceCategoryCodes: "",
  };
}

function splitCodes(value: string): string[] {
  const codes = value.split(",").map((code) => normalizeDocumentCode(code)).filter(Boolean);
  if (codes.some((code) => code.length < 2)) {
    throw new Error("Service category codes must contain at least 2 characters.");
  }
  return [...new Set(codes)];
}

function updateRule(
  setDraft: Dispatch<SetStateAction<ReturnType<typeof emptyBusinessDocument>>>,
  index: number,
  patch: Partial<RuleDraft>,
) {
  setDraft((current) => ({
    ...current,
    rules: current.rules.map((entry, ruleIndex) =>
      ruleIndex === index ? {...entry, ...patch} : entry,
    ),
  }));
}

function confirmLifecycle<T extends {code: string; status: DocumentCatalogStatus}>(
  record: T,
  action: LifecycleAction,
  actions: {
    discontinue: (code: string) => Promise<unknown>;
    reactivate: (code: string) => Promise<unknown>;
    delete: (code: string) => Promise<unknown>;
  },
  setRecords: Dispatch<SetStateAction<T[]>>,
  setPendingRecord: (record: T | null) => void,
  setPendingAction: (action: LifecycleAction | null) => void,
  startTransition: (callback: () => void) => void,
  label: string,
) {
  startTransition(async () => {
    try {
      await actions[action](record.code);
      setRecords((current) => action === "delete"
        ? current.filter((item) => item.code !== record.code)
        : current.map((item) => item.code === record.code
          ? {...item, status: action === "reactivate" ? "active" : "discontinued"}
          : item));
      feastaToast.success(`${label} ${action === "delete" ? "deleted" : action === "reactivate" ? "reactivated" : "discontinued"}.`);
      setPendingRecord(null);
      setPendingAction(null);
    } catch (error: unknown) {
      feastaToast.error(error instanceof Error ? error.message : `The ${label.toLowerCase()} could not be changed.`);
    }
  });
}

function CatalogSection<T>({
  title,
  description,
  actionLabel,
  onCreate,
  searchValue,
  onSearchChange,
  onSearchSubmit,
  onClear,
  status,
  onStatus,
  columns,
  rows,
  getRowId,
  caption,
  emptyTitle,
  rowActions,
  editorOpen,
  editorTitle,
  editorDescription,
  wide = false,
  onEditorOpenChange,
  onSave,
  formError,
  isPending,
  confirm,
  children,
}: {
  title: string;
  description: string;
  actionLabel: string;
  onCreate: () => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit: (value: string) => void;
  onClear: () => void;
  status: StatusFilter;
  onStatus: (status: StatusFilter) => void;
  columns: readonly DataTableColumn<T>[];
  rows: readonly T[];
  getRowId: (row: T) => string;
  caption: string;
  emptyTitle: string;
  rowActions: (row: T) => ReactNode;
  editorOpen: boolean;
  editorTitle: string;
  editorDescription: string;
  wide?: boolean;
  onEditorOpenChange: (open: boolean) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  formError?: string;
  isPending: boolean;
  confirm: {
    title: string;
    description: string;
    confirmLabel: string;
    destructive: boolean;
    onConfirm: () => void;
    onOpenChange: (open: boolean) => void;
  } | null;
  children: ReactNode;
}) {
  return (
    <div className="grid min-w-0 gap-6">
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-2xl font-black tracking-tight">{title}</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{description}</p>
        </div>
        <Button onClick={onCreate}>
          <Plus aria-hidden="true" className="size-5" />
          {actionLabel}
        </Button>
      </div>
      <FilterToolbar
        searchValue={searchValue}
        onSearchChange={onSearchChange}
        onSearchSubmit={onSearchSubmit}
        onClearSearch={() => {
          onSearchChange("");
          onSearchSubmit("");
        }}
        onClearFilters={onClear}
        searchLabel={`Search ${caption.toLowerCase()}`}
        filterControls={(
          <FormField label="Status">
            <Select value={status} onChange={(event) => onStatus(event.target.value as StatusFilter)}>
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="discontinued">Discontinued</option>
            </Select>
          </FormField>
        )}
        activeFilters={status === "all" ? [] : [`Status: ${statusLabel(status)}`]}
      />
      <DataTable
        columns={columns}
        rows={rows}
        getRowId={getRowId}
        caption={caption}
        emptyTitle={emptyTitle}
        emptyDescription="No records match the current filters."
        rowActions={rowActions}
      />
      <Dialog open={editorOpen} onOpenChange={onEditorOpenChange}>
        <DialogContent className={wide ? "max-h-[90vh] w-[calc(100vw-2rem)] max-w-3xl overflow-y-auto" : "w-[calc(100vw-2rem)] max-w-xl"} showCloseButton={!isPending}>
          <DialogHeader>
            <DialogTitle>{editorTitle}</DialogTitle>
            <DialogDescription>{editorDescription}</DialogDescription>
          </DialogHeader>
          <form className="grid gap-5" onSubmit={onSave}>
            {children}
            {formError ? <p className="text-sm text-destructive" role="alert">{formError}</p> : null}
            <DialogFooter>
              <Button type="button" variant="secondary" disabled={isPending} onClick={() => onEditorOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={isPending} loadingLabel="Saving">
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {confirm ? (
        <ConfirmationDialog
          open
          title={confirm.title}
          description={confirm.description}
          confirmLabel={confirm.confirmLabel}
          destructive={confirm.destructive}
          loading={isPending}
          onConfirm={confirm.onConfirm}
          onOpenChange={confirm.onOpenChange}
        />
      ) : null}
    </div>
  );
}
