"use client";

import {Plus} from "lucide-react";
import {
  useCallback,
  useMemo,
  useState,
  useTransition,
  type Dispatch,
  type FormEvent,
  type ReactNode,
  type SetStateAction,
} from "react";

import {
  AgreementVersionDialogs,
  PublishAgreementConfirmation,
} from "@/components/admin/file-maintenance/agreement-version-dialogs";
import {
  AgreementTypeManagerDialog,
  AgreementTypePickerDialog,
  SingletonAgreementDialog,
} from "@/components/admin/file-maintenance/agreement-type-dialogs";
import {DataTable, type DataTableColumn} from "@/components/data/data-table";
import {matchingSuggestions} from "@/components/forms/search-suggestions";
import type {SuggestionLoader} from "@/components/forms/search-input";
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
  deleteAdminAgreementVersion,
  deleteAdminBusinessDocumentType,
  discontinueAdminBusinessDocumentType,
  publishAdminAgreementVersion,
  reactivateAdminBusinessDocumentType,
  updateAdminAgreementTemplate,
  updateAdminBusinessDocumentType,
} from "@/lib/admin/file-maintenance/admin-document-catalog-client";
import type {
  AdminAgreementTemplate,
  AdminBusinessDocumentRule,
  AdminBusinessDocumentType,
  AgreementSection,
  AgreementTypeRecord,
  AgreementVersionRecord,
  DocumentCatalogStatus,
} from "@/lib/admin/file-maintenance/admin-document-catalog-types";
import {
  agreementDraftFieldErrors,
  agreementPublication,
  bodyToSections,
  currentPublishedVersion,
  displayAgreementVersions,
  normalizeAgreementName,
  sectionsToBody,
} from "@/lib/documents/agreement-version-history";
import {
  FileMaintenanceRecordActions,
  type FileMaintenanceLifecycleAction,
  type FileMaintenanceOverflowAction,
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
  agreementTypes: initialAgreementTypes = [],
}: {
  initialAgreements: AdminAgreementTemplate[];
  agreementTypes?: AgreementTypeRecord[];
}) {
  const [agreements, setAgreements] = useState(initialAgreements);
  const [agreementTypes, setAgreementTypes] = useState(initialAgreementTypes);
  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const [typeManagerOpen, setTypeManagerOpen] = useState(false);
  const [singletonType, setSingletonType] = useState<AgreementTypeRecord | null>(null);
  const [singletonAgreement, setSingletonAgreement] = useState<AdminAgreementTemplate | null>(null);
  const [searchValue, setSearchValue] = useState("");
  const [search, setSearch] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<AdminAgreementTemplate | null>(null);
  const [draft, setDraft] = useState(emptyAgreement());
  const [formError, setFormError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<AgreementFieldErrors>({});
  const [baseline, setBaseline] = useState("");
  const [discardOpen, setDiscardOpen] = useState(false);
  const [publishPreview, setPublishPreview] = useState<AgreementPublishPreview | null>(null);
  const [rowPublish, setRowPublish] = useState<{
    agreement: AdminAgreementTemplate;
    version: AgreementVersionRecord;
  } | null>(null);
  const [deleteDraftOpen, setDeleteDraftOpen] = useState(false);
  const [versionAgreement, setVersionAgreement] = useState<AdminAgreementTemplate | null>(null);
  const [versionMode, setVersionMode] = useState<"history" | "create" | "edit" | "view" | null>(null);
  const [versionSource, setVersionSource] = useState<AgreementVersionRecord | null>(null);
  const [submission, setSubmission] = useState<null | "save" | "publish" | "delete">(null);
  const isPending = submission !== null;
  const publishedVersion = editing ? currentPublishedVersion(editing) : null;
  const selectedType = agreementTypes.find((type) => type.code === draft.agreementTypeCode) ?? null;
  const editableDraft = editing?.versions?.find((version) => version.status === "draft") ?? null;
  const filtered = useCatalogFilter(agreements, search, "all", (record, query) =>
    record.code.includes(query) || record.version.toLowerCase().includes(query),
  );

  const openEditor = useCallback((
    next: ReturnType<typeof emptyAgreement>,
    record: AdminAgreementTemplate | null,
  ) => {
    setEditing(record);
    setDraft(next);
    setBaseline(agreementDraftSnapshot(next));
    setFieldErrors({});
    setFormError(undefined);
    setEditorOpen(true);
  }, []);

  const openCreate = () => {
    setFormError(undefined);
    setTypePickerOpen(true);
  };

  const beginCreate = (type: AgreementTypeRecord) => {
    const existing = type.singleton
      ? agreements.find((agreement) => agreement.agreementTypeCode === type.code)
      : undefined;
    setTypePickerOpen(false);
    if (existing) {
      setSingletonType(type);
      setSingletonAgreement(existing);
      return;
    }
    openEditor(emptyAgreement(type), null);
  };

  const openAgreement = useCallback((agreement: AdminAgreementTemplate) => {
    setSingletonType(null);
    setSingletonAgreement(null);
    const current = currentPublishedVersion(agreement) ?? agreement.versions?.find((version) => version.status === "draft");
    openEditor({
      name: agreement.name,
      summary: current?.summary ?? agreement.summary,
      version: current?.version ?? agreement.version,
      effectiveDate: current?.effectiveDate ?? agreement.effectiveDate,
      body: sectionsToBody(current?.sections ?? agreement.sections),
      agreementTypeCode: agreement.agreementTypeCode,
    }, agreement);
  }, [openEditor]);

  const columns = useMemo<DataTableColumn<AdminAgreementTemplate>[]>(() => [
    {
      id: "name",
      header: "Agreement",
      cell: (agreement) => (
        <div className="min-w-0">
          <button
            type="button"
            className="break-words rounded-sm text-left font-bold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:no-underline disabled:opacity-70"
            disabled={isPending}
            aria-label={`View ${agreement.name}`}
            onClick={() => openAgreement(agreement)}
          >
            {agreement.name}
          </button>
          <p className="mt-1 break-all text-xs text-muted-foreground">{agreement.code}</p>
        </div>
      ),
    },
    {
      id: "type",
      header: "Type",
      cell: (agreement) => agreementTypes.find((type) => type.code === agreement.agreementTypeCode)?.name ?? "Not assigned",
    },
    {
      id: "publication",
      header: "Version status",
      cell: (agreement) => <AgreementVersionStatus agreement={agreement} />,
    },
  ], [agreementTypes, isPending, openAgreement]);

  const closeEditor = () => {
    setBaseline(agreementDraftSnapshot(draft));
    setDiscardOpen(false);
    setDeleteDraftOpen(false);
    setEditorOpen(false);
    setFieldErrors({});
    setFormError(undefined);
  };

  const requestClose = () => {
    if (isPending) return;
    if (!publishedVersion && agreementDraftSnapshot(draft) !== baseline) {
      setEditorOpen(true);
      setDiscardOpen(true);
      return;
    }
    closeEditor();
  };

  const rememberAgreement = (next: AdminAgreementTemplate) => {
    setAgreements((current) => [
      ...current.filter((agreement) => agreement.code !== next.code),
      next,
    ]);
    setVersionAgreement((current) => current?.code === next.code ? next : current);
    setEditing((current) => current?.code === next.code ? next : current);
  };

  const removeAgreement = (code: string) => {
    setAgreements((current) => current.filter((item) => item.code !== code));
    setVersionAgreement(null);
    setEditing(null);
    setVersionMode(null);
  };

  const draftRecord = (
    input: AgreementEditorInput,
    versions: AdminAgreementTemplate["versions"],
  ): AdminAgreementTemplate => ({
    ...input,
    agreementTypeCode: input.agreementTypeCode,
    status: "active",
    sortName: input.name.toLowerCase(),
    versions,
  });

  const prepareDraft = () => {
    const name = !editing && selectedType?.singleton
      ? selectedType.name
      : normalizeAgreementName(draft.name);
    const errors = agreementDraftFieldErrors({
      name,
      summary: draft.summary,
      version: draft.version,
      effectiveDate: draft.effectiveDate,
      body: draft.body,
      versions: editing ? displayAgreementVersions(editing) : [],
      ignoringVersion: editableDraft?.version,
      lockLegalContent: Boolean(publishedVersion),
    });
    if (!publishedVersion && !errors.body && draft.body.trim()) {
      try {
        bodyToSections(draft.body);
      } catch (error: unknown) {
        errors.body = error instanceof Error ? error.message : "The agreement text is invalid.";
      }
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setFormError(undefined);
      return null;
    }
    let sections: AgreementSection[];
    try {
      sections = publishedVersion ? publishedVersion.sections : bodyToSections(draft.body);
    } catch (error: unknown) {
      setFieldErrors({
        body: error instanceof Error ? error.message : "The agreement text is invalid.",
      });
      return null;
    }
    const code = editing?.code ?? normalizeDocumentCode(name);
    if (code.length < 2) {
      setFormError("Enter a name and version that can identify this agreement.");
      return null;
    }
    if (!editing && agreements.some((agreement) => agreement.code === code)) {
      setFormError("An agreement with this code already exists.");
      return null;
    }
    setFieldErrors({});
    setFormError(undefined);
    const input: AgreementEditorInput = {
      code,
      categoryCode: "agreements",
      name,
      summary: draft.summary.trim(),
      version: publishedVersion ? publishedVersion.version : normalizeAgreementName(draft.version),
      effectiveDate: publishedVersion ? publishedVersion.effectiveDate : draft.effectiveDate.trim(),
      sections,
      agreementTypeCode: draft.agreementTypeCode,
    };
    return input;
  };

  const saveDraft = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (publishedVersion || isPending) return;
    const input = prepareDraft();
    if (!input) return;
    setSubmission("save");
    void (async () => {
      try {
        const result = editing
          ? await updateAdminAgreementTemplate(input)
          : await createAdminAgreementTemplate(input);
        const next = result?.agreement ?? draftRecord(input, editing?.versions ?? [{
          version: input.version,
          name: input.name,
          summary: input.summary,
          effectiveDate: input.effectiveDate,
          sections: input.sections,
          status: "draft",
          createdAt: null,
          publishedAt: null,
          archivedAt: null,
        }]);
        rememberAgreement(next);
        feastaToast.success("Draft saved.");
        closeEditor();
      } catch (error: unknown) {
        setFormError(error instanceof Error ? error.message : "The agreement could not be saved.");
      } finally {
        setSubmission(null);
      }
    })();
  };

  const requestPublish = () => {
    if (publishedVersion || isPending) return;
    const input = prepareDraft();
    if (!input) return;
    setPublishPreview({
      input,
      agreementName: input.name,
      typeName: selectedType?.name ?? input.name,
      providerOnboarding: selectedType?.purpose === "provider_onboarding",
      currentVersion: null,
    });
  };

  const confirmEditorPublish = () => {
    if (!publishPreview || isPending) return;
    const input = publishPreview.input;
    setSubmission("publish");
    void (async () => {
      try {
        const saved = editing
          ? await updateAdminAgreementTemplate(input)
          : await createAdminAgreementTemplate(input);
        const created = saved?.agreement ?? draftRecord(input, [{
          version: input.version,
          name: input.name,
          summary: input.summary,
          effectiveDate: input.effectiveDate,
          sections: input.sections,
          status: "draft",
          createdAt: null,
          publishedAt: null,
          archivedAt: null,
        }]);
        rememberAgreement(created);
        setEditing(created);
        setBaseline(agreementDraftSnapshot({
          name: input.name,
          summary: input.summary,
          version: input.version,
          effectiveDate: input.effectiveDate,
          body: sectionsToBody(input.sections),
        }));
        try {
          const published = await publishAdminAgreementVersion({
            code: input.code,
            version: input.version,
          });
          rememberAgreement(published?.agreement ?? {
            ...created,
            version: input.version,
            effectiveDate: input.effectiveDate,
            sections: input.sections,
            versions: (created.versions ?? []).map((version) => version.version === input.version
              ? {...version, status: "current" as const}
              : version.status === "current"
                ? {...version, status: "archived" as const}
                : version),
          });
          feastaToast.success(`Version ${input.version} is now current.`);
          setPublishPreview(null);
          closeEditor();
        } catch (error: unknown) {
          setPublishPreview(null);
          setFormError(error instanceof Error
            ? error.message
            : "Publishing failed. The version remains a draft.");
        }
      } catch (error: unknown) {
        setFormError(error instanceof Error ? error.message : "The agreement could not be saved.");
      } finally {
        setSubmission(null);
      }
    })();
  };

  const confirmStoredPublish = () => {
    if (!rowPublish || isPending) return;
    const target = rowPublish;
    setSubmission("publish");
    void (async () => {
      try {
        const result = await publishAdminAgreementVersion({
          code: target.agreement.code,
          version: target.version.version,
        });
        if (result?.agreement) rememberAgreement(result.agreement);
        feastaToast.success(`Version ${target.version.version} is now current.`);
        setRowPublish(null);
      } catch (error: unknown) {
        setFormError(error instanceof Error ? error.message : "Publishing failed. The version remains a draft.");
        feastaToast.error(error instanceof Error ? error.message : "Publishing failed. The version remains a draft.");
      } finally {
        setSubmission(null);
      }
    })();
  };

  const confirmDeleteDraft = () => {
    if (!editing || !editableDraft || isPending) return;
    setSubmission("delete");
    void (async () => {
      try {
        const result = await deleteAdminAgreementVersion({
          code: editing.code,
          version: editableDraft.version,
        });
        if (result?.agreement) rememberAgreement(result.agreement);
        if (result?.deletedCode) removeAgreement(result.deletedCode);
        feastaToast.success("Draft deleted.");
        setDeleteDraftOpen(false);
        closeEditor();
      } catch (error: unknown) {
        setFormError(error instanceof Error ? error.message : "The draft could not be deleted.");
      } finally {
        setSubmission(null);
      }
    })();
  };

  const openVersions = (
    agreement: AdminAgreementTemplate,
    mode: "history" | "create" | "edit" | "view",
    source: AgreementVersionRecord | null,
  ) => {
    setEditing(agreement);
    setVersionAgreement(agreement);
    setVersionSource(source);
    setVersionMode(mode);
    setBaseline(agreementDraftSnapshot(draft));
    setEditorOpen(false);
  };

  return (
    <>
    <CatalogSection
      loadSuggestions={async query => matchingSuggestions(query, agreements.map(r => ({key: r.code, label: r.name, searchText: [r.name, r.code, r.version].join(" "), context: r.code + " · " + r.version, value: r.name})))}
      title="Agreements and contracts"
      description="Choose an agreement type, then draft and publish versions for that agreement. Provider onboarding uses the published Provider Agreement type."
      actionLabel="Add agreement"
      onCreate={openCreate}
      extraActions={(
        <Button type="button" variant="secondary" onClick={() => setTypeManagerOpen(true)}>
          Agreement types
        </Button>
      )}
      searchValue={searchValue}
      onSearchChange={setSearchValue}
      onSearchSubmit={setSearch}
      onClear={() => {
        setSearchValue("");
        setSearch("");
      }}
      columns={columns}
      rows={filtered}
      getRowId={(agreement) => agreement.code}
      caption="Agreements"
      emptyTitle="No agreements found"
      rowActions={(agreement) => (
        <AgreementRowActions
          agreement={agreement}
          disabled={isPending}
          onView={() => openAgreement(agreement)}
          onEditDraft={() => {
            const current = currentPublishedVersion(agreement);
            const draftVersion = agreement.versions?.find((version) => version.status === "draft");
            if (current && draftVersion) openVersions(agreement, "edit", draftVersion);
            else openAgreement(agreement);
          }}
          onPublish={(version) => setRowPublish({agreement, version})}
          onHistory={() => openVersions(agreement, "history", null)}
          onCreateVersion={(version) => openVersions(agreement, "create", version)}
          onDeleteDraft={() => {
            setEditing(agreement);
            setDeleteDraftOpen(true);
          }}
        />
      )}
      editorOpen={editorOpen}
      editorTitle={editing ? (publishedVersion ? "View agreement" : "Edit draft") : "Add agreement"}
      editorDescription={publishedVersion
        ? "Published versions cannot be edited. Create a new version to change the agreement text or effective date."
        : "Paste agreement text in your usual format. Formatting is cleaned up when you save or publish. Saving a draft does not publish it."}
      wide
      stickyEditor
      onEditorOpenChange={(open) => {
        if (open || isPending) return;
        requestClose();
      }}
      onSave={saveDraft}
      editorFooter={publishedVersion && editing ? (
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:flex-wrap sm:justify-end">
          <Button type="button" variant="secondary" onClick={closeEditor}>Close</Button>
          <Button asChild variant="secondary">
            <a href={agreementPdfHref(editing.code, publishedVersion.version)}>Download PDF</a>
          </Button>
          <Button type="button" variant="secondary" onClick={() => openVersions(editing, "history", null)}>
            Version history
          </Button>
          {!editableDraft ? (
            <Button type="button" onClick={() => openVersions(editing, "create", publishedVersion)}>
              Create new version
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button type="button" variant="secondary" disabled={isPending} onClick={requestClose}>Cancel</Button>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            {editing && editableDraft ? (
              <Button type="button" variant="secondary" disabled={isPending} onClick={() => setDeleteDraftOpen(true)}>
                Delete Draft
              </Button>
            ) : null}
            <Button
              type="submit"
              variant="secondary"
              disabled={isPending}
              loading={submission === "save"}
              loadingLabel="Saving..."
            >
              Save Draft
            </Button>
            <Button
              type="button"
              disabled={isPending}
              loading={submission === "publish"}
              loadingLabel="Publishing..."
              onClick={requestPublish}
            >
              Publish
            </Button>
          </div>
        </div>
      )}
      formError={formError}
      isPending={isPending}
      confirm={null}
    >
      <p className="text-sm text-muted-foreground">
        Agreement type: {selectedType?.name ?? "Not assigned"}
      </p>
      {publishedVersion ? (
        <div className="grid gap-4 text-sm">
          <p className="font-bold">{draft.name}</p>
          {draft.summary ? <p className="text-muted-foreground">{draft.summary}</p> : null}
          <p className="font-bold">Current version: {publishedVersion.version}</p>
          <p>Effective date: {publishedVersion.effectiveDate}</p>
          {publishedVersion.sections.map((section, index) => (
            <section key={`${section.title}-${index}`} className="grid gap-2">
              <h3 className="font-bold">{section.title}</h3>
              {section.paragraphs.map((paragraph, paragraphIndex) => (
                <p key={`${index}-${paragraphIndex}`} className="whitespace-pre-wrap text-muted-foreground">{paragraph}</p>
              ))}
            </section>
          ))}
        </div>
      ) : (
        <>
          <FormField label="Summary" description="Optional. Up to 500 characters." error={fieldErrors.summary}>
            <Textarea value={draft.summary} maxLength={500} onChange={(event) => setDraft({...draft, summary: event.target.value})} />
          </FormField>
          <FormField
            label="Agreement name"
            required
            error={fieldErrors.name}
            description={selectedType?.singleton ? "This agreement type uses a fixed name." : undefined}
          >
            <Input
              value={draft.name}
              readOnly={Boolean(selectedType?.singleton)}
              onChange={(event) => setDraft({...draft, name: event.target.value})}
              maxLength={120}
            />
          </FormField>
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label="Version" required error={fieldErrors.version}>
              <Input value={draft.version} onChange={(event) => setDraft({...draft, version: event.target.value})} maxLength={40} />
            </FormField>
            <FormField label="Effective date" required description="Use YYYY-MM-DD." error={fieldErrors.effectiveDate}>
              <Input value={draft.effectiveDate} onChange={(event) => setDraft({...draft, effectiveDate: event.target.value})} placeholder="YYYY-MM-DD" />
            </FormField>
          </div>
          <FormField label="Agreement text" required error={fieldErrors.body}>
            <Textarea className="min-h-64 font-mono text-sm" value={draft.body} onChange={(event) => setDraft({...draft, body: event.target.value})} />
          </FormField>
        </>
      )}
    </CatalogSection>
    <AgreementTypePickerDialog
      open={typePickerOpen}
      types={agreementTypes}
      onOpenChange={setTypePickerOpen}
      onContinue={beginCreate}
    />
    <SingletonAgreementDialog
      type={singletonType}
      agreement={singletonAgreement}
      onOpenChange={(open) => {
        if (!open) {
          setSingletonType(null);
          setSingletonAgreement(null);
        }
      }}
      onOpenAgreement={() => {
        if (singletonAgreement) openAgreement(singletonAgreement);
      }}
      onCreateVersion={() => {
        const current = singletonAgreement ? currentPublishedVersion(singletonAgreement) : null;
        if (!singletonAgreement || !current) return;
        const agreement = singletonAgreement;
        setSingletonType(null);
        setSingletonAgreement(null);
        setEditing(agreement);
        setVersionAgreement(agreement);
        setVersionSource(current);
        setVersionMode("create");
      }}
    />
    <AgreementTypeManagerDialog
      open={typeManagerOpen}
      types={agreementTypes}
      onOpenChange={setTypeManagerOpen}
      onType={(type) => {
        setAgreementTypes((current) => current.map((item) => item.code === type.code ? type : item));
      }}
    />
    <AgreementVersionDialogs
      agreement={versionAgreement}
      mode={versionMode}
      source={versionSource}
      typeName={agreementTypes.find((type) => type.code === versionAgreement?.agreementTypeCode)?.name}
      providerOnboarding={agreementTypes.find((type) => type.code === versionAgreement?.agreementTypeCode)?.purpose === "provider_onboarding"}
      onDeleted={removeAgreement}
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
    {publishPreview ? (
      <PublishAgreementConfirmation
        agreementName={publishPreview.agreementName}
        typeName={publishPreview.typeName}
        version={publishPreview.input.version}
        effectiveDate={publishPreview.input.effectiveDate}
        currentVersion={publishPreview.currentVersion}
        providerOnboarding={publishPreview.providerOnboarding}
        pending={submission === "publish"}
        onConfirm={confirmEditorPublish}
        onOpenChange={(open) => {
          if (!open && submission !== "publish") setPublishPreview(null);
        }}
      />
    ) : null}
    {rowPublish ? (
      <PublishAgreementConfirmation
        agreementName={rowPublish.agreement.name}
        typeName={agreementTypes.find((type) => type.code === rowPublish.agreement.agreementTypeCode)?.name ?? rowPublish.agreement.name}
        version={rowPublish.version.version}
        effectiveDate={rowPublish.version.effectiveDate}
        currentVersion={currentPublishedVersion(rowPublish.agreement)?.version ?? null}
        providerOnboarding={agreementTypes.find((type) => type.code === rowPublish.agreement.agreementTypeCode)?.purpose === "provider_onboarding"}
        pending={submission === "publish"}
        onConfirm={confirmStoredPublish}
        onOpenChange={(open) => {
          if (!open && submission !== "publish") setRowPublish(null);
        }}
      />
    ) : null}
    {discardOpen ? (
      <ConfirmationDialog
        open
        title="Discard unsaved changes?"
        description="Your changes to this agreement have not been saved."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        destructive
        onConfirm={closeEditor}
        onOpenChange={(open) => {
          if (!open) setDiscardOpen(false);
        }}
      />
    ) : null}
    {deleteDraftOpen ? (
      <ConfirmationDialog
        open
        title={editableDraft ? `Delete draft ${editableDraft.version}?` : "Delete draft?"}
        description="This removes the unpublished draft. Published versions stay in the agreement history."
        confirmLabel="Delete draft"
        destructive
        loading={submission === "delete"}
        onConfirm={confirmDeleteDraft}
        onOpenChange={(open) => {
          if (!open && submission !== "delete") setDeleteDraftOpen(false);
        }}
      />
    ) : null}
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
      loadSuggestions={async query => matchingSuggestions(query, documents.filter(r => status === "all" || r.status === status).map(r => ({key: r.code, label: r.name, searchText: [r.name, r.code, r.description].join(" "), context: r.code + " · " + r.status, value: r.name})))}
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

type AgreementFieldErrors = Partial<Record<"name" | "summary" | "version" | "effectiveDate" | "body", string>>;

type AgreementEditorInput = {
  code: string;
  categoryCode: "agreements";
  name: string;
  summary: string;
  version: string;
  effectiveDate: string;
  sections: AgreementSection[];
  agreementTypeCode: AdminAgreementTemplate["agreementTypeCode"];
};

type AgreementPublishPreview = {
  input: AgreementEditorInput;
  agreementName: string;
  typeName: string;
  providerOnboarding: boolean;
  currentVersion: string | null;
};

function agreementDraftSnapshot(value: {
  name: string;
  summary: string;
  version: string;
  effectiveDate: string;
  body: string;
}) {
  return JSON.stringify({
    name: value.name,
    summary: value.summary,
    version: value.version,
    effectiveDate: value.effectiveDate,
    body: value.body,
  });
}

function agreementPdfHref(code: string, version: string) {
  return `/api/admin/agreements/${encodeURIComponent(code)}/pdf?version=${encodeURIComponent(version)}`;
}

function AgreementVersionStatus({agreement}: {agreement: AdminAgreementTemplate}) {
  const publication = agreementPublication(agreement);
  const current = currentPublishedVersion(agreement);
  const drafts = (agreement.versions ?? []).filter((version) => version.status === "draft");
  const tone = publication.label === "Current"
    ? "success"
    : publication.label === "Draft"
      ? "info"
      : "neutral";
  return (
    <div className="grid gap-1">
      <Badge tone={tone}>{publication.label}</Badge>
      {publication.version ? (
        <span className="text-xs text-muted-foreground">Version {publication.version}</span>
      ) : null}
      {current ? drafts.map((version) => (
        <span key={version.version} className="text-xs text-muted-foreground">Draft {version.version}</span>
      )) : null}
    </div>
  );
}

function AgreementRowActions({
  agreement,
  disabled,
  onView,
  onEditDraft,
  onPublish,
  onHistory,
  onCreateVersion,
  onDeleteDraft,
}: {
  agreement: AdminAgreementTemplate;
  disabled: boolean;
  onView: () => void;
  onEditDraft: () => void;
  onPublish: (version: AgreementVersionRecord) => void;
  onHistory: () => void;
  onCreateVersion: (version: AgreementVersionRecord) => void;
  onDeleteDraft: () => void;
}) {
  const current = currentPublishedVersion(agreement);
  const draftVersion = agreement.versions?.find((version) => version.status === "draft") ?? null;
  const overflowActions: FileMaintenanceOverflowAction[] = [
    ...(draftVersion ? [{label: "Delete Draft", icon: "delete" as const, onSelect: onDeleteDraft}] : []),
    ...(current ? [{
      label: "View agreement",
      icon: "view" as const,
      onSelect: onView,
    }] : []),
    {
      label: "Version history",
      icon: "history",
      onSelect: onHistory,
    },
    ...(current ? [{
      label: "Download PDF",
      icon: "download" as const,
      href: agreementPdfHref(agreement.code, current.version),
    }] : []),
  ];
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {draftVersion ? (
        <Button type="button" variant="secondary" size="compact" disabled={disabled} onClick={onEditDraft}>
          Edit draft
        </Button>
      ) : null}
      {draftVersion ? (
        <Button type="button" size="compact" disabled={disabled} onClick={() => onPublish(draftVersion)}>
          Publish
        </Button>
      ) : null}
      {current && !draftVersion ? (
        <Button type="button" size="compact" disabled={disabled} onClick={() => onCreateVersion(current)}>
          Create new version
        </Button>
      ) : null}
      <FileMaintenanceRecordActions
        disabled={disabled}
        showEdit={false}
        menuLabel={`More actions for ${agreement.name}`}
        triggerSize="icon"
        overflowActions={overflowActions}
        onEdit={() => undefined}
      />
    </div>
  );
}

function emptyAgreement(type?: Pick<AgreementTypeRecord, "code" | "name" | "singleton">) {
  return {
    name: type?.singleton ? type.name : "",
    summary: "",
    version: "1.0",
    effectiveDate: "",
    body: "# Section title\n\nWrite the first paragraph.\n\nWrite another paragraph if needed.",
    agreementTypeCode: type?.code ?? null,
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
  loadSuggestions,
  title,
  description,
  actionLabel,
  extraActions,
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
  stickyEditor = false,
  onEditorOpenChange,
  onSave,
  editorFooter,
  formError,
  isPending,
  confirm,
  children,
}: {
  title: string;
  description: string;
  actionLabel: string;
  extraActions?: ReactNode;
  onCreate: () => void;
  loadSuggestions: SuggestionLoader;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit: (value: string) => void;
  onClear: () => void;
  status?: StatusFilter;
  onStatus?: (status: StatusFilter) => void;
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
  stickyEditor?: boolean;
  onEditorOpenChange: (open: boolean) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  editorFooter?: ReactNode;
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
        <div className="flex flex-wrap gap-2">
          {extraActions}
          <Button onClick={onCreate}>
            <Plus aria-hidden="true" className="size-5" />
            {actionLabel}
          </Button>
        </div>
      </div>
      <FilterToolbar
        suggestionScope={status ?? "all"}
        loadSuggestions={loadSuggestions}
        searchValue={searchValue}
        onSearchChange={onSearchChange}
        onSearchSubmit={onSearchSubmit}
        onClearSearch={() => {
          onSearchChange("");
          onSearchSubmit("");
        }}
        onClearFilters={onClear}
        searchLabel={`Search ${caption.toLowerCase()}`}
        filterControls={onStatus ? (
          <FormField label="Status">
            <Select value={status} onChange={(event) => onStatus(event.target.value as StatusFilter)}>
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="discontinued">Discontinued</option>
            </Select>
          </FormField>
        ) : undefined}
        activeFilters={!status || status === "all" ? [] : [`Status: ${statusLabel(status)}`]}
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
        <DialogContent
          className={stickyEditor
            ? "flex max-h-[min(90vh,48rem)] w-[calc(100vw-2rem)] max-w-3xl flex-col gap-0 overflow-hidden overscroll-contain p-0"
            : wide
              ? "max-h-[90vh] w-[calc(100vw-2rem)] max-w-3xl overflow-y-auto"
              : "w-[calc(100vw-2rem)] max-w-xl"}
          showCloseButton={!isPending}
        >
          <DialogHeader className={stickyEditor ? "shrink-0 px-6 pb-2 pt-6" : undefined}>
            <DialogTitle>{editorTitle}</DialogTitle>
            <DialogDescription>{editorDescription}</DialogDescription>
          </DialogHeader>
          <form className={stickyEditor ? "flex min-h-0 flex-1 flex-col" : "grid gap-5"} noValidate onSubmit={onSave}>
            <div className={stickyEditor ? "grid min-h-0 flex-1 gap-5 overflow-y-auto px-6 py-4" : "contents"}>
              {children}
            </div>
            <div className={stickyEditor ? "shrink-0 border-t border-border px-6 py-4" : "contents"}>
              {formError ? <p className="mb-3 text-sm text-destructive" role="alert">{formError}</p> : null}
              {editorFooter ?? (
                <DialogFooter>
                  <Button type="button" variant="secondary" disabled={isPending} onClick={() => onEditorOpenChange(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" loading={isPending} loadingLabel="Saving">
                    Save
                  </Button>
                </DialogFooter>
              )}
            </div>
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
