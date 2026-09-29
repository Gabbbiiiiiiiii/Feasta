"use client";

import {useState} from "react";

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
  bodyToSections,
  displayAgreementVersions,
  sectionsToBody,
  versionActivityDate,
  versionStatusLabel,
} from "@/lib/documents/agreement-version-history";

const PUBLISHED_VERSION_MESSAGE =
  "Published versions cannot be edited. Create a new version to change the agreement text or effective date.";

type VersionDialogMode = "history" | "create" | "edit" | "view";

export function AgreementVersionDialogs({
  agreement,
  mode,
  source,
  onAgreement,
  onClose,
  onMode,
}: {
  agreement: AdminAgreementTemplate | null;
  mode: VersionDialogMode | null;
  source: AgreementVersionRecord | null;
  onAgreement: (agreement: AdminAgreementTemplate) => void;
  onClose: () => void;
  onMode: (mode: VersionDialogMode, source: AgreementVersionRecord | null) => void;
}) {
  const [formError, setFormError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AgreementVersionRecord | null>(null);

  const close = () => {
    if (pending) return;
    setFormError(undefined);
    onClose();
  };

  const run = async (action: () => Promise<void>) => {
    setPending(true);
    setFormError(undefined);
    try {
      await action();
    } catch (error: unknown) {
      setFormError(error instanceof Error ? error.message : "The agreement version could not be saved.");
    } finally {
      setPending(false);
    }
  };

  const apply = (next: AdminAgreementTemplate | undefined, message: string) => {
    if (next) onAgreement(next);
    feastaToast.success(message);
    setFormError(undefined);
  };

  return (
    <>
      <Dialog open={mode === "history"} onOpenChange={(open) => { if (!open) close(); }}>
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
                void run(async () => {
                  const result = await publishAdminAgreementVersion({
                    code: agreement.code,
                    version: version.version,
                  });
                  apply(result?.agreement, `Version ${version.version} is now current.`);
                  onClose();
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
        onOpenChange={(open) => { if (!open) close(); }}
      >
        <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-3xl overflow-y-auto">
          {agreement && source && (mode === "create" || mode === "edit") ? (
            <VersionEditor
              key={`${mode}:${source.version}`}
              mode={mode}
              source={source}
              pending={pending}
              formError={formError}
              onCancel={close}
              onSave={(input) => {
                void run(async () => {
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
                    input.publish ? `Version ${input.version} is now current.` : "Draft saved.",
                  );
                  onClose();
                });
              }}
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
                {agreement.status === "active" && source.status !== "draft" ? (
                  <Button type="button" onClick={() => onMode("create", source)}>
                    Create new version
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
          loading={pending}
          onConfirm={() => {
            void run(async () => {
              const result = await deleteAdminAgreementVersion({
                code: agreement.code,
                version: deleteTarget.version,
              });
              apply(result?.agreement, "Draft deleted.");
              setDeleteTarget(null);
            });
          }}
          onOpenChange={(open) => {
            if (!open && !pending) setDeleteTarget(null);
          }}
        />
      ) : null}
    </>
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
                      <Button type="button" size="compact" disabled={pending || agreement.status !== "active"} onClick={() => onPublish(version)}>
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
  pending,
  formError,
  onCancel,
  onSave,
}: {
  mode: "create" | "edit";
  source: AgreementVersionRecord;
  pending: boolean;
  formError?: string;
  onCancel: () => void;
  onSave: (input: {
    version: string;
    effectiveDate: string;
    sections: AgreementVersionRecord["sections"];
    publish: boolean;
  }) => void;
}) {
  const [version, setVersion] = useState(mode === "edit" ? source.version : "");
  const [effectiveDate, setEffectiveDate] = useState(source.effectiveDate);
  const [body, setBody] = useState(sectionsToBody(source.sections));
  const [localError, setLocalError] = useState<string>();

  const submit = (publish: boolean) => {
    let sections: AgreementVersionRecord["sections"];
    try {
      sections = bodyToSections(body);
    } catch (error: unknown) {
      setLocalError(error instanceof Error ? error.message : "The agreement text is invalid.");
      return;
    }
    if (version.trim().length < 1) {
      setLocalError("Enter a version.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(effectiveDate)) {
      setLocalError("Enter an effective date as YYYY-MM-DD.");
      return;
    }
    setLocalError(undefined);
    onSave({
      version: version.trim().replace(/\s+/gu, " "),
      effectiveDate,
      sections,
      publish,
    });
  };

  const error = localError ?? formError;
  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {mode === "create" ? `Creating a new version from ${source.version}` : `Edit draft ${source.version}`}
        </DialogTitle>
        <DialogDescription>
          Choose the version number, effective date, and agreement text. Saving a draft does not change the version providers currently accept.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-5">
        <FormField label="Version" required>
          <Input
            value={version}
            placeholder="1.1"
            maxLength={40}
            onChange={(event) => setVersion(event.target.value)}
          />
        </FormField>
        <FormField label="Effective date" required description="Use YYYY-MM-DD.">
          <Input
            value={effectiveDate}
            placeholder="YYYY-MM-DD"
            onChange={(event) => setEffectiveDate(event.target.value)}
          />
        </FormField>
        <FormField label="Agreement text" required>
          <Textarea
            className="min-h-64 font-mono text-sm"
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
        </FormField>
        {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
      </div>
      <DialogFooter>
        <Button type="button" variant="secondary" disabled={pending} onClick={onCancel}>Cancel</Button>
        <Button type="button" variant="secondary" loading={pending} loadingLabel="Saving" onClick={() => submit(false)}>
          Save draft
        </Button>
        <Button type="button" loading={pending} loadingLabel="Publishing" onClick={() => submit(true)}>
          Publish
        </Button>
      </DialogFooter>
    </>
  );
}

function VersionDetails({version}: {version: AgreementVersionRecord}) {
  return (
    <div className="grid gap-4 text-sm">
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
