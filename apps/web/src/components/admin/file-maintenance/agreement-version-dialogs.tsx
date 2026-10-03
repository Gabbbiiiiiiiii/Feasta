"use client";

import {useEffect, useState} from "react";

import {feastaToast} from "@/components/feedback/toast";
import {FormField} from "@/components/forms/form-field";
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
import {Textarea} from "@/components/ui/textarea";
import type {
  AdminAgreementTemplate,
  AgreementVersionRecord,
} from "@/lib/admin/file-maintenance/admin-document-catalog-types";
import {
  createAdminAgreementVersion,
  deleteAdminAgreementVersion,
  publishAdminAgreementVersion,
  updateAdminAgreementVersion,
} from "@/lib/admin/file-maintenance/admin-document-catalog-client";
import {
  agreementVersionChoiceError,
  parseAgreementText,
  currentPublishedVersion,
  displayAgreementVersions,
  isRealCalendarDate,
  sectionsToBody,
  suggestNextAgreementVersion,
  versionActivityDate,
  versionStatusLabel,
} from "@/lib/documents/agreement-version-history";

const PUBLISHED_VERSION_MESSAGE =
  "Published versions cannot be edited. Create a new version to change the agreement text or effective date.";

type VersionDialogMode = "history" | "create" | "edit" | "view";

type VersionDraftInput = {
  summary: string;
  version: string;
  effectiveDate: string;
  sections: AgreementVersionRecord["sections"];
  formattingChanged: boolean;
  mode: "create" | "edit" | "stored";
};

export function AgreementVersionDialogs({
  agreement,
  mode,
  source,
  typeName,
  providerOnboarding = false,
  onAgreement,
  onDeleted,
  onClose,
  onMode,
}: {
  agreement: AdminAgreementTemplate | null;
  mode: VersionDialogMode | null;
  source: AgreementVersionRecord | null;
  typeName?: string;
  providerOnboarding?: boolean;
  onAgreement: (agreement: AdminAgreementTemplate) => void;
  onDeleted: (code: string) => void;
  onClose: () => void;
  onMode: (mode: VersionDialogMode, source: AgreementVersionRecord | null) => void;
}) {
  const [formError, setFormError] = useState<string>();
  const [pendingAction, setPendingAction] = useState<null | "save" | "publish" | "delete">(null);
  const [deleteTarget, setDeleteTarget] = useState<AgreementVersionRecord | null>(null);
  const [publishDraft, setPublishDraft] = useState<VersionDraftInput | null>(null);
  const [versionDirty, setVersionDirty] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const pending = pendingAction !== null;

  const close = () => {
    if (pending) return;
    setFormError(undefined);
    setVersionDirty(false);
    setDiscardOpen(false);
    onClose();
  };

  const requestClose = () => {
    if (pending) return;
    if (versionDirty && (mode === "create" || mode === "edit")) {
      setDiscardOpen(true);
      return;
    }
    close();
  };

  const run = async (
    action: "save" | "publish" | "delete",
    task: () => Promise<void>,
  ) => {
    setPendingAction(action);
    setFormError(undefined);
    try {
      await task();
    } catch (error: unknown) {
      setFormError(error instanceof Error ? error.message : "The agreement version could not be saved.");
    } finally {
      setPendingAction(null);
    }
  };

  const apply = (next: AdminAgreementTemplate | undefined, message: string) => {
    if (next) onAgreement(next);
    feastaToast.success(message);
    setFormError(undefined);
  };

  return (
    <>
      <Dialog open={mode === "history"} onOpenChange={(open) => { if (!open) requestClose(); }}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Version history</DialogTitle>
            <DialogDescription>
              {agreement ? `${agreement.name}. ${PUBLISHED_VERSION_MESSAGE}` : PUBLISHED_VERSION_MESSAGE}
            </DialogDescription>
          </DialogHeader>
          {agreement ? (
            <VersionHistoryTable
              agreement={agreement}
              pending={pending}
              onView={(version) => onMode("view", version)}
              onEdit={(version) => onMode("edit", version)}
              onPublish={(version) => {
                setFormError(undefined);
                setPublishDraft({
                  version: version.version,
                  summary: version.summary ?? "",
                  effectiveDate: version.effectiveDate,
                  sections: version.sections,
                  formattingChanged: false,
                  mode: "stored",
                });
              }}
              onDelete={setDeleteTarget}
            />
          ) : null}
          {formError ? <p className="text-sm text-destructive" role="alert">{formError}</p> : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={mode === "create" || mode === "edit"}
        onOpenChange={(open) => { if (!open) requestClose(); }}
      >
        <DialogContent className="flex max-h-[min(90vh,48rem)] w-[calc(100vw-2rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0">
          {agreement && source && (mode === "create" || mode === "edit") ? (
            <VersionEditor
              key={`${mode}:${source.version}`}
              mode={mode}
              source={source}
              versions={displayAgreementVersions(agreement)}
              currentVersion={currentPublishedVersion(agreement)?.version ?? null}
              pendingAction={pendingAction}
              formError={formError}
              onDirtyChange={setVersionDirty}
              onCancel={requestClose}
              onSave={(input, formattingChanged) => {
                void run("save", async () => {
                  const result = mode === "create" ?
                    await createAdminAgreementVersion({
                      code: agreement.code,
                      sourceVersion: source.version,
                      ...input,
                    }) :
                    await updateAdminAgreementVersion({
                      code: agreement.code,
                      draftVersion: source.version,
                      ...input,
                    });
                  apply(
                    result?.agreement,
                    formattingChanged ? "Draft saved. Agreement formatting was cleaned up." : "Draft saved.",
                  );
                  onClose();
                });
              }}
              onPublish={(input, formattingChanged) => {
                setPublishDraft({...input, formattingChanged, mode});
              }}
              onDelete={mode === "edit" ? () => setDeleteTarget(source) : undefined}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={mode === "view"} onOpenChange={(open) => { if (!open) close(); }}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-3xl overflow-y-auto">
          {agreement && source && mode === "view" ? (
            <>
              <DialogHeader>
                <DialogTitle>{source.name}</DialogTitle>
                <DialogDescription>{PUBLISHED_VERSION_MESSAGE}</DialogDescription>
              </DialogHeader>
              <VersionDetails version={source} />
              <DialogFooter>
                <Button type="button" variant="secondary" onClick={close}>Close</Button>
                {source.status !== "draft" ? (
                  <Button asChild variant="secondary">
                    <a href={pdfHref(agreement.code, source.version)}>Download PDF</a>
                  </Button>
                ) : null}
                {source.status !== "draft" ? (
                  <Button type="button" onClick={() => onMode("create", source)}>
                    {source.status === "archived" ? "Create new version from this version" : "Create new version"}
                  </Button>
                ) : null}
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {agreement && deleteTarget ? (
        <ConfirmationDialog
          open
          title={`Delete draft ${deleteTarget.version}?`}
          description="This removes the unpublished draft. Published versions stay in the agreement history."
          confirmLabel="Delete draft"
          destructive
          loading={pendingAction === "delete"}
          onConfirm={() => {
            void run("delete", async () => {
              const result = await deleteAdminAgreementVersion({
                code: agreement.code,
                version: deleteTarget.version,
              });
              if (result?.deletedCode) {
                onDeleted(result.deletedCode);
                feastaToast.success("Draft deleted.");
                onClose();
              } else {
                apply(result?.agreement, "Draft deleted.");
              }
              setDeleteTarget(null);
            });
          }}
          onOpenChange={(open) => {
            if (!open && !pending) setDeleteTarget(null);
          }}
        />
      ) : null}
      {agreement && publishDraft ? (
        <PublishAgreementConfirmation
          agreementName={agreement.name}
          typeName={typeName || agreement.name}
          version={publishDraft.version}
          effectiveDate={publishDraft.effectiveDate}
          currentVersion={currentPublishedVersion(agreement)?.version ?? null}
          providerOnboarding={providerOnboarding}
          pending={pendingAction === "publish"}
          onOpenChange={(open) => {
            if (!open && pendingAction !== "publish") setPublishDraft(null);
          }}
          onConfirm={() => {
            const request = publishDraft;
            setPublishDraft(null);
            void run("publish", async () => {
              if (!agreement) return;
              if (request.mode !== "stored" && source) {
                const saved = request.mode === "create" ?
                  await createAdminAgreementVersion({
                    code: agreement.code,
                    sourceVersion: source.version,
                    version: request.version,
                    effectiveDate: request.effectiveDate,
                    sections: request.sections,
                    summary: request.summary,
                  }) :
                  await updateAdminAgreementVersion({
                    code: agreement.code,
                    draftVersion: source.version,
                    version: request.version,
                    effectiveDate: request.effectiveDate,
                    sections: request.sections,
                    summary: request.summary,
                  });
                if (saved?.agreement) onAgreement(saved.agreement);
                try {
                  const published = await publishAdminAgreementVersion({
                    code: agreement.code,
                    version: request.version,
                  });
                  apply(published?.agreement, `Version ${request.version} is now current.`);
                  setPublishDraft(null);
                  onClose();
                } catch (error: unknown) {
                  setPublishDraft(null);
                  throw new Error(error instanceof Error ? error.message : "Publishing failed. The version remains a draft.");
                }
                return;
              }
              const published = await publishAdminAgreementVersion({
                code: agreement.code,
                version: request.version,
              });
              apply(published?.agreement, `Version ${request.version} is now current.`);
              setPublishDraft(null);
              onClose();
            });
          }}
        />
      ) : null}
      {discardOpen ? (
        <ConfirmationDialog
          open
          title="Discard unsaved changes?"
          description="Your changes to this agreement version have not been saved."
          confirmLabel="Discard"
          cancelLabel="Keep editing"
          destructive
          onConfirm={close}
          onOpenChange={(open) => {
            if (!open) setDiscardOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

export function PublishAgreementConfirmation({
  agreementName,
  typeName,
  version,
  effectiveDate,
  currentVersion,
  providerOnboarding,
  pending,
  onConfirm,
  onOpenChange,
}: {
  agreementName: string;
  typeName: string;
  version: string;
  effectiveDate: string;
  currentVersion: string | null;
  providerOnboarding: boolean;
  pending: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const replacement = currentVersion && currentVersion !== version;
  return (
    <ConfirmationDialog
      open
      title={`Publish ${typeName} ${version}?`}
      description={`Publishing makes this version the current ${typeName}. Once published, its text, version, and effective date can no longer be edited.`}
      confirmLabel="Publish version"
      loadingLabel="Publishing..."
      loading={pending}
      onConfirm={onConfirm}
      onOpenChange={onOpenChange}
    >
      <div className="grid gap-3 text-sm">
        <dl className="grid gap-2">
          <div>
            <dt className="font-bold">Agreement</dt>
            <dd>{agreementName}</dd>
          </div>
          <div>
            <dt className="font-bold">Version</dt>
            <dd>{version}</dd>
          </div>
          <div>
            <dt className="font-bold">Effective date</dt>
            <dd>{effectiveDate}</dd>
          </div>
        </dl>
        <p>Publishing makes this version current and preserves it in version history. Published text cannot be edited in place.</p>
        {replacement ? (
          <p>Publishing Version {version} will archive current Version {currentVersion}.</p>
        ) : null}
        {providerOnboarding ? (
          <p>Providers will be shown this version for new agreement acceptance after publication.</p>
        ) : null}
      </div>
    </ConfirmationDialog>
  );
}

function VersionHistoryTable({
  agreement,
  pending,
  onView,
  onEdit,
  onPublish,
  onDelete,
}: {
  agreement: AdminAgreementTemplate;
  pending: boolean;
  onView: (version: AgreementVersionRecord) => void;
  onEdit: (version: AgreementVersionRecord) => void;
  onPublish: (version: AgreementVersionRecord) => void;
  onDelete: (version: AgreementVersionRecord) => void;
}) {
  const versions = displayAgreementVersions(agreement);
  return (
    <div className="min-w-0 overflow-x-auto">
      <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
        <caption className="sr-only">Agreement versions</caption>
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="px-3 py-2 font-bold">Version</th>
            <th className="px-3 py-2 font-bold">Effective date</th>
            <th className="px-3 py-2 font-bold">Status</th>
            <th className="px-3 py-2 font-bold">Published</th>
            <th className="px-3 py-2 font-bold">Actions</th>
          </tr>
        </thead>
        <tbody>
          {versions.map((version) => (
            <tr key={version.version} className="border-b border-border align-top">
              <td className="px-3 py-3 font-bold">{version.version}</td>
              <td className="px-3 py-3">{version.effectiveDate}</td>
              <td className="px-3 py-3">
                <Badge tone={version.status === "current" ? "success" : version.status === "draft" ? "info" : "neutral"}>
                  {versionStatusLabel(version.status)}
                </Badge>
              </td>
              <td className="px-3 py-3">{versionActivityDate(version) || "Not available"}</td>
              <td className="px-3 py-3">
                <div className="flex flex-wrap gap-2">
                  {version.status === "draft" ? (
                    <>
                      <Button type="button" variant="secondary" size="compact" disabled={pending} onClick={() => onEdit(version)}>
                        Edit
                      </Button>
                      <Button type="button" size="compact" disabled={pending} onClick={() => onPublish(version)}>
                        Publish
                      </Button>
                      <Button type="button" variant="secondary" size="compact" disabled={pending} onClick={() => onDelete(version)}>
                        Delete draft
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button type="button" variant="secondary" size="compact" onClick={() => onView(version)}>
                        View
                      </Button>
                      {version.status === "archived" ? (
                        <Button asChild variant="secondary" size="compact">
                          <a href={pdfHref(agreement.code, version.version)}>Download PDF</a>
                        </Button>
                      ) : null}
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VersionEditor({
  mode,
  source,
  versions,
  currentVersion,
  pendingAction,
  formError,
  onDirtyChange,
  onCancel,
  onSave,
  onPublish,
  onDelete,
}: {
  mode: "create" | "edit";
  source: AgreementVersionRecord;
  versions: readonly AgreementVersionRecord[];
  currentVersion: string | null;
  pendingAction: "save" | "publish" | "delete" | null;
  formError?: string;
  onDirtyChange: (dirty: boolean) => void;
  onCancel: () => void;
  onSave: (input: {
    version: string;
    effectiveDate: string;
    sections: AgreementVersionRecord["sections"];
    summary: string;
  }, formattingChanged: boolean) => void;
  onPublish: (input: {
    version: string;
    effectiveDate: string;
    sections: AgreementVersionRecord["sections"];
    summary: string;
  }, formattingChanged: boolean) => void;
  onDelete?: () => void;
}) {
  const initialVersion = mode === "edit" ? source.version : suggestNextAgreementVersion(currentVersion);
  const [version, setVersion] = useState(initialVersion);
  const [summary, setSummary] = useState(source.summary ?? "");
  const [effectiveDate, setEffectiveDate] = useState(source.effectiveDate);
  const [body, setBody] = useState(sectionsToBody(source.sections));
  const [fieldError, setFieldError] = useState<{field: "version" | "effectiveDate" | "body" | "summary"; message: string} | null>(null);
  const pending = pendingAction !== null;
  const existingDraft = versions.find((entry) =>
    entry.status === "draft" && (mode === "create" || entry.version !== source.version),
  );

  useEffect(() => {
    onDirtyChange(
      version !== initialVersion ||
      summary !== (source.summary ?? "") ||
      effectiveDate !== source.effectiveDate ||
      body !== sectionsToBody(source.sections),
    );
  }, [body, effectiveDate, initialVersion, onDirtyChange, source, version, summary]);

  const submit = (intent: "save" | "publish") => {
    if (summary.trim().length > 500) {
      setFieldError({field: "summary", message: "Summary must be 500 characters or fewer."});
      return;
    }
    let sections: AgreementVersionRecord["sections"];
    let normalizedText: string;
    try {
      ({sections, normalizedText} = parseAgreementText(body));
    } catch (error: unknown) {
      setFieldError({
        field: "body",
        message: error instanceof Error ? error.message : "The agreement text is invalid.",
      });
      return;
    }
    const nextVersion = version.trim().replace(/\s+/gu, " ");
    if (nextVersion.length < 1 || nextVersion.length > 40) {
      setFieldError({field: "version", message: "Enter a valid version."});
      return;
    }
    const choiceError = agreementVersionChoiceError(
      nextVersion,
      versions,
      mode === "edit" ? source.version : undefined,
    );
    if (choiceError) {
      setFieldError({field: "version", message: choiceError});
      return;
    }
    if (!isRealCalendarDate(effectiveDate.trim())) {
      setFieldError({field: "effectiveDate", message: "Enter a valid effective date."});
      return;
    }
    setFieldError(null);
    setBody(normalizedText);
    const input = {version: nextVersion, effectiveDate: effectiveDate.trim(), sections, summary: summary.trim()};
    const formattingChanged = normalizedText !== body;
    if (intent === "publish") onPublish(input, formattingChanged);
    else onSave(input, formattingChanged);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DialogHeader className="shrink-0 px-6 pb-2 pt-6">
        <DialogTitle>
          {mode === "create" ? `Creating a new version from ${source.version}` : `Edit draft ${source.version}`}
        </DialogTitle>
        <DialogDescription>
          Paste agreement text in your usual format. Formatting is cleaned up when you save or publish. Saving a draft does not change the version providers currently accept.
        </DialogDescription>
      </DialogHeader>
      <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto px-6 py-4">
        {mode === "create" && currentVersion ? (
          <p className="text-sm font-bold">Current version: {currentVersion}</p>
        ) : null}
        {existingDraft ? (
          <p className="text-sm text-muted-foreground">
            A draft version {existingDraft.version} already exists. Open that draft to continue, or save another draft. Publishing one draft does not change the others.
          </p>
        ) : null}
        <FormField label="Summary" description="Optional. Up to 500 characters." error={fieldError?.field === "summary" ? fieldError.message : undefined}>
          <Textarea value={summary} maxLength={500} onChange={(event) => setSummary(event.target.value)} />
        </FormField>
        <FormField label="Version" required error={fieldError?.field === "version" ? fieldError.message : undefined}>
          <Input
            value={version}
            placeholder="1.1"
            maxLength={40}
            onChange={(event) => setVersion(event.target.value)}
          />
        </FormField>
        <FormField label="Effective date" required description="Use YYYY-MM-DD." error={fieldError?.field === "effectiveDate" ? fieldError.message : undefined}>
          <Input
            value={effectiveDate}
            placeholder="YYYY-MM-DD"
            onChange={(event) => setEffectiveDate(event.target.value)}
          />
        </FormField>
        <FormField label="Agreement text" required error={fieldError?.field === "body" ? fieldError.message : undefined}>
          <Textarea
            className="min-h-64 font-mono text-sm"
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
        </FormField>
      </div>
      <div className="shrink-0 border-t border-border px-6 py-4">
        {formError ? <p className="mb-3 text-sm text-destructive" role="alert">{formError}</p> : null}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button type="button" variant="secondary" disabled={pending} onClick={onCancel}>Cancel</Button>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            {onDelete ? (
              <Button type="button" variant="secondary" disabled={pending} onClick={onDelete}>Delete Draft</Button>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              loading={pendingAction === "save"}
              loadingLabel="Saving..."
              onClick={() => submit("save")}
            >
              Save Draft
            </Button>
            <Button
              type="button"
              disabled={pending}
              loading={pendingAction === "publish"}
              loadingLabel="Publishing..."
              onClick={() => submit("publish")}
            >
              Publish
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function VersionDetails({version}: {version: AgreementVersionRecord}) {
  return (
    <div className="grid gap-4 text-sm">
      {version.summary ? <p className="whitespace-pre-wrap text-muted-foreground">{version.summary}</p> : null}
      <dl className="grid gap-2 sm:grid-cols-3">
        <div>
          <dt className="font-bold">Version</dt>
          <dd>{version.version}</dd>
        </div>
        <div>
          <dt className="font-bold">Effective date</dt>
          <dd>{version.effectiveDate}</dd>
        </div>
        <div>
          <dt className="font-bold">Status</dt>
          <dd>{versionStatusLabel(version.status)}</dd>
        </div>
      </dl>
      {version.sections.map((section, index) => (
        <section key={`${section.title}-${index}`} className="grid gap-2">
          <h3 className="font-bold">{section.title}</h3>
          {section.paragraphs.map((paragraph, paragraphIndex) => (
            <p key={`${index}-${paragraphIndex}`} className="whitespace-pre-wrap text-muted-foreground">{paragraph}</p>
          ))}
        </section>
      ))}
    </div>
  );
}

function pdfHref(code: string, version: string): string {
  return `/api/admin/agreements/${encodeURIComponent(code)}/pdf?version=${encodeURIComponent(version)}`;
}
