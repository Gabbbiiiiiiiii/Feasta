import {fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, describe, expect, it, vi} from "vitest";
import type {
  AdminServiceCategory,
} from "@/lib/admin/file-maintenance/admin-service-category-types";

const mutations = vi.hoisted(() => ({
  createAdminAgreementTemplate: vi.fn(),
  updateAdminAgreementTemplate: vi.fn(),
  createAdminAgreementVersion: vi.fn(),
  updateAdminAgreementVersion: vi.fn(),
  publishAdminAgreementVersion: vi.fn(),
  deleteAdminAgreementVersion: vi.fn(),
  updateAdminAgreementType: vi.fn(),
  createAdminBusinessDocumentType: vi.fn(),
  updateAdminBusinessDocumentType: vi.fn(),
  discontinueAdminBusinessDocumentType: vi.fn(),
  reactivateAdminBusinessDocumentType: vi.fn(),
  deleteAdminBusinessDocumentType: vi.fn(),
}));

vi.mock("@/lib/admin/file-maintenance/admin-document-catalog-client", () => mutations);
vi.mock("@/components/admin/file-maintenance/service-category-management-client", () => ({
  ServiceCategoryManagementClient: () => <p>Service category management</p>,
}));
vi.mock("@/components/feedback/toast", () => ({
  feastaToast: {success: vi.fn(), error: vi.fn()},
}));

import {FileMaintenanceClient} from "@/components/admin/file-maintenance/file-maintenance-client";
import {feastaToast} from "@/components/feedback/toast";
import {
  AgreementTemplateManagement,
  BusinessDocumentManagement,
} from "@/components/admin/file-maintenance/document-catalog-management-client";
import type {
  AdminAgreementTemplate,
  AdminBusinessDocumentType,
  AgreementTypeRecord,
} from "@/lib/admin/file-maintenance/admin-document-catalog-types";

const agreement: AdminAgreementTemplate = {
  code: "provider_agreement",
  categoryCode: "test",
  name: "Provider agreement",
  summary: "Provider responsibilities",
  version: "1",
  effectiveDate: "2026-09-27",
  sections: [{title: "Responsibilities", paragraphs: ["Provide the agreed services."]}],
  agreementTypeCode: "provider_agreement",
  status: "active",
  sortName: "provider agreement",
};
const document: AdminBusinessDocumentType = {
  code: "business_permit",
  categoryCode: "test",
  name: "Business permit",
  description: "Current permit",
  status: "active",
  sortName: "business permit",
  rules: [{
    effect: "required", oneOfGroup: "", registrationScope: "registered_business",
    serviceTypes: [], serviceCategoryCodes: [], excludeServiceCategoryCodes: [],
  }],
};

const agreementTypes: AgreementTypeRecord[] = [
  {
    code: "provider_agreement",
    name: "Provider Agreement",
    description: "Agreement providers review and accept during onboarding.",
    purpose: "provider_onboarding",
    singleton: true,
    requiresAcceptance: true,
    targetAudience: "provider",
    system: true,
    isActive: true,
    sortOrder: 10,
  },
  {
    code: "terms_of_service",
    name: "Terms of Service",
    description: "Rules governing use of the FEASTA platform.",
    purpose: "platform_terms",
    singleton: true,
    requiresAcceptance: false,
    targetAudience: "platform",
    system: true,
    isActive: true,
    sortOrder: 20,
  },
  {
    code: "privacy_policy",
    name: "Privacy Policy",
    description: "Explains FEASTA's handling of personal information.",
    purpose: "privacy_notice",
    singleton: true,
    requiresAcceptance: false,
    targetAudience: "platform",
    system: true,
    isActive: true,
    sortOrder: 30,
  },
];

const legacyCustomType: AgreementTypeRecord = {
  code: "custom_agreement",
  name: "Other / Custom Agreement",
  description: "Create an additional agreement for a specific FEASTA purpose.",
  purpose: "custom",
  singleton: false,
  requiresAcceptance: false,
  targetAudience: "custom",
  system: true,
  isActive: true,
  sortOrder: 40,
};

const serviceCategories: AdminServiceCategory[] = [
  {
    code: "videographer",
    name: "Videographer",
    serviceType: "addon",
    status: "active",
    sortName: "videographer",
  },
  {
    code: "venue_provider",
    name: "Venue",
    serviceType: "addon",
    status: "active",
    sortName: "venue",
  },
  {
    code: "catering_service",
    name: "Catering Service",
    serviceType: "catering",
    status: "active",
    sortName: "catering service",
  },
];

describe("File Maintenance document catalog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows only the three operational sections", async () => {
    const user = userEvent.setup();
    render(<FileMaintenanceClient initialCategories={[]} initialAgreements={[]} initialBusinessDocuments={[]} />);
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Service categories", "Agreements", "Business documents",
    ]);
    expect(screen.queryByText(/document categories/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", {name: "Agreements"}));
    expect(screen.getByRole("button", {name: "Add agreement"})).toBeInTheDocument();
    await user.click(screen.getByRole("tab", {name: "Business documents"}));
    expect(screen.getByRole("button", {name: "Add business document"})).toBeInTheDocument();
  });

  it("creates agreements with an internal classification and no category selector", async () => {
    const user = userEvent.setup();
    render(<AgreementTemplateManagement initialAgreements={[]} agreementTypes={agreementTypes} />);
    await user.click(screen.getByRole("button", {name: "Add agreement"}));
    const picker = within(screen.getByRole("dialog", {name: /what agreement do you want to create/i}));
    expect(picker.queryByLabelText(/agreement name/i)).not.toBeInTheDocument();
    expect(picker.queryByRole("radio", {name: /custom agreement/i})).not.toBeInTheDocument();
    await user.click(picker.getByRole("radio", {name: /terms of service/i}));
    await user.click(picker.getByRole("button", {name: "Continue"}));
    const dialog = within(screen.getByRole("dialog", {name: /add agreement/i}));
    expect(dialog.queryByLabelText(/document category/i)).not.toBeInTheDocument();
    fireEvent.change(dialog.getByLabelText(/version/i), {target: {value: "2"}});
    fireEvent.change(dialog.getByLabelText(/effective date/i), {target: {value: "2026-09-29"}});
    expect(dialog.getByRole("button", {name: "Save Draft"})).toBeInTheDocument();
    expect(dialog.getByRole("button", {name: "Publish"})).toBeInTheDocument();
    expect(dialog.queryByRole("button", {name: "Save"})).not.toBeInTheDocument();
    await user.click(dialog.getByRole("button", {name: "Save Draft"}));
    await waitFor(() => expect(mutations.createAdminAgreementTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        categoryCode: "agreements",
        code: "terms_of_service",
        name: "Terms of Service",
        agreementTypeCode: "terms_of_service",
      }),
    ));
  });

  it("edits an agreement without an onboarding checkbox", async () => {
    const user = userEvent.setup();
    render(<AgreementTemplateManagement initialAgreements={[agreement]} agreementTypes={agreementTypes} />);
    await user.click(screen.getByRole("button", {name: "View Provider agreement"}));
    const dialog = within(screen.getByRole("dialog", {name: /view agreement/i}));
    expect(dialog.queryByLabelText(/document category/i)).not.toBeInTheDocument();
    expect(dialog.queryByText(/use for provider onboarding/i)).not.toBeInTheDocument();
    expect(dialog.queryByRole("button", {name: "Save Draft"})).not.toBeInTheDocument();
    expect(dialog.queryByRole("button", {name: "Publish"})).not.toBeInTheDocument();
    expect(mutations.updateAdminAgreementTemplate).not.toHaveBeenCalled();
  });

  it("creates business documents without a category selector", async () => {
    const user = userEvent.setup();
    render(
      <BusinessDocumentManagement
        initialDocuments={[]}
        serviceCategories={serviceCategories}
      />,
    );
    await user.click(screen.getByRole("button", {name: "Add business document"}));
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.queryByLabelText(/document category/i)).not.toBeInTheDocument();
    fireEvent.change(dialog.getByLabelText(/document name/i), {target: {value: "Supporting permit"}});
    await user.click(dialog.getByRole("button", {name: "Save"}));
    await waitFor(() => expect(mutations.createAdminBusinessDocumentType).toHaveBeenCalledWith(
      expect.objectContaining({categoryCode: "business_documents", rules: []}),
    ));
  });

  it("preserves requirement rules when editing a legacy business document", async () => {
    const user = userEvent.setup();
    render(
      <BusinessDocumentManagement
        initialDocuments={[document]}
        serviceCategories={serviceCategories}
      />,
    );
    await user.click(screen.getByRole("button", {name: "Edit"}));
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.queryByLabelText(/document category/i)).not.toBeInTheDocument();
    await user.click(dialog.getByRole("button", {name: "Save"}));
    await waitFor(() => expect(mutations.updateAdminBusinessDocumentType).toHaveBeenCalledWith({
      code: document.code, categoryCode: "business_documents", name: document.name,
      description: document.description, rules: document.rules,
    }));
  });

  it("saves specific service-category targeting without service-type overlap", async () => {
    const user = userEvent.setup();

    render(
      <BusinessDocumentManagement
        initialDocuments={[]}
        serviceCategories={serviceCategories}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Add business document",
      }),
    );

    const dialog = within(screen.getByRole("dialog"));

    fireEvent.change(
      dialog.getByLabelText(/document name/i),
      {
        target: {
          value: "Mayor's permit",
        },
      },
    );

    await user.click(
      dialog.getByRole("button", {
        name: "Add requirement rule",
      }),
    );

    fireEvent.change(
      dialog.getByLabelText(
        /business registration type/i,
      ),
      {
        target: {
          value: "registered_business",
        },
      },
    );

    fireEvent.change(
      dialog.getByLabelText(
        /apply this requirement to/i,
      ),
      {
        target: {
          value: "service_category",
        },
      },
    );

    await user.click(
      dialog.getByLabelText(/venue · add-on/i),
    );

    await user.click(
      dialog.getByRole("button", {
        name: "Save",
      }),
    );

    await waitFor(() =>
      expect(
        mutations.createAdminBusinessDocumentType,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          categoryCode: "business_documents",
          rules: [
            {
              effect: "required",
              oneOfGroup: "",
              registrationScope:
                "registered_business",
              serviceTypes: [],
              serviceCategoryCodes: [
                "venue_provider",
              ],
              excludeServiceCategoryCodes: [],
            },
          ],
        }),
      ),
    );
  });

  it("keeps published agreement text and effective date read-only", async () => {
    const user = userEvent.setup();
    render(<AgreementTemplateManagement initialAgreements={[agreement]} agreementTypes={agreementTypes} />);
    await user.click(screen.getByRole("button", {name: "View Provider agreement"}));
    const dialog = within(screen.getByRole("dialog", {name: /view agreement/i}));
    expect(dialog.getByText("Current version: 1")).toBeInTheDocument();
    expect(dialog.getAllByText(/Published versions cannot be edited/i)).toHaveLength(1);
    expect(dialog.queryByLabelText(/agreement text/i)).not.toBeInTheDocument();
    expect(dialog.queryByLabelText(/effective date/i)).not.toBeInTheDocument();
    expect(dialog.getByRole("button", {name: "Create new version"})).toBeInTheDocument();
    expect(dialog.getByRole("button", {name: "Version history"})).toBeInTheDocument();
  });

  it("creates a draft from the current version without publishing it", async () => {
    const user = userEvent.setup();
    mutations.createAdminAgreementVersion.mockResolvedValue({success: true});
    render(<AgreementTemplateManagement initialAgreements={[agreement]} agreementTypes={agreementTypes} />);
    await user.click(screen.getByRole("button", {name: "Create new version"}));
    const dialog = within(screen.getByRole("dialog", {name: /creating a new version from 1/i}));
    fireEvent.change(dialog.getByLabelText(/^version/i), {target: {value: "1.1"}});
    fireEvent.change(dialog.getByLabelText(/agreement text/i), {
      target: {value: "# Responsibilities\n\nUpdated draft wording."},
    });
    await user.click(dialog.getByRole("button", {name: "Save Draft"}));
    await waitFor(() => expect(mutations.createAdminAgreementVersion).toHaveBeenCalledWith({
      code: agreement.code,
      sourceVersion: "1",
      summary: agreement.summary,
      version: "1.1",
      effectiveDate: agreement.effectiveDate,
      sections: [{title: "Responsibilities", paragraphs: ["Updated draft wording."]}],
    }));
    expect(feastaToast.success).toHaveBeenCalledWith("Draft saved.");
  });

  for (const editingDraft of [false, true]) {
    it(`normalizes before saving a ${editingDraft ? "existing" : "new"} draft and reopens canonical text`, async () => {
      const user = userEvent.setup();
      const current = {
        version: "1", name: agreement.name, effectiveDate: agreement.effectiveDate,
        sections: agreement.sections, status: "current" as const,
        createdAt: null, publishedAt: null, archivedAt: null,
      };
      const draft = {...current, version: "1.1", status: "draft" as const};
      const sections = [{title: "1. PAYMENT", paragraphs: ["The Provider shall pay PHP 10,000.", "One event per day."]}];
      const mutation = editingDraft ? mutations.updateAdminAgreementVersion : mutations.createAdminAgreementVersion;
      mutation.mockResolvedValue({success: true, agreement: {
        ...agreement, versions: [current, {...draft, sections}],
      }});
      render(<AgreementTemplateManagement initialAgreements={[{
        ...agreement, versions: editingDraft ? [current, draft] : [current],
      }]} agreementTypes={agreementTypes} />);
      if (editingDraft) {
        await user.click(screen.getByRole("button", {name: "More actions for Provider agreement"}));
        await user.click(screen.getByRole("menuitem", {name: "Version history"}));
        await user.click(within(screen.getByRole("dialog")).getByRole("button", {name: "Edit"}));
      } else {
        await user.click(screen.getByRole("button", {name: "Create new version"}));
      }
      const editor = within(screen.getByRole("dialog"));
      fireEvent.change(editor.getByLabelText(/^version/i), {target: {value: "1.1"}});
      fireEvent.change(editor.getByLabelText(/agreement text/i), {
        target: {value: "## 1. PAYMENT\nThe Provider shall pay PHP 10,000.  \n\n\nOne event per day."},
      });
      await user.click(editor.getByRole("button", {name: "Save Draft"}));
      await waitFor(() => expect(mutation).toHaveBeenCalledWith({
        code: agreement.code, version: "1.1", effectiveDate: agreement.effectiveDate,
        sections, summary: "", ...(editingDraft ? {draftVersion: "1.1"} : {sourceVersion: "1"}),
      }));
      expect(feastaToast.success).toHaveBeenCalledWith("Draft saved. Agreement formatting was cleaned up.");
      await user.click(screen.getByRole("button", {name: "View Provider agreement"}));
      expect(screen.getByText("Current version: 1")).toBeInTheDocument();
      await user.click(within(screen.getByRole("dialog", {name: /view agreement/i})).getByRole("button", {name: "Version history"}));
      await user.click(within(screen.getByRole("dialog", {name: /version history/i})).getByRole("button", {name: "Edit"}));
      expect(screen.getByLabelText(/agreement text/i)).toHaveValue(
        "# 1. PAYMENT\n\nThe Provider shall pay PHP 10,000.\n\nOne event per day.",
      );
    });
  }

  it("accepts ordinary text when saving the first agreement draft", async () => {
    const user = userEvent.setup();
    render(<AgreementTemplateManagement initialAgreements={[]} agreementTypes={agreementTypes} />);
    await user.click(screen.getByRole("button", {name: "Add agreement"}));
    const picker = within(screen.getByRole("dialog", {name: /what agreement do you want to create/i}));
    await user.click(picker.getByRole("radio", {name: /privacy policy/i}));
    await user.click(picker.getByRole("button", {name: "Continue"}));
    fireEvent.change(screen.getByLabelText(/version/i), {target: {value: "1"}});
    fireEvent.change(screen.getByLabelText(/effective date/i), {target: {value: "2026-09-30"}});
    fireEvent.change(screen.getByLabelText(/agreement text/i), {target: {value: "The Provider shall pay PHP 10,000."}});
    await user.click(screen.getByRole("button", {name: "Save Draft"}));
    await waitFor(() => expect(mutations.createAdminAgreementTemplate).toHaveBeenCalledWith(
      expect.objectContaining({sections: [{title: "Agreement", paragraphs: ["The Provider shall pay PHP 10,000."]}]}),
    ));
    expect(mutations.publishAdminAgreementVersion).not.toHaveBeenCalled();
  });

  it("shows specific empty and section-capacity errors before sending a draft", async () => {
    const user = userEvent.setup();
    render(<AgreementTemplateManagement initialAgreements={[agreement]} agreementTypes={agreementTypes} />);
    await user.click(screen.getByRole("button", {name: "Create new version"}));
    fireEvent.change(screen.getByLabelText(/^version/i), {target: {value: "1.1"}});
    for (const [body, message] of [
      [" ", "Enter agreement text."],
      [Array.from({length: 41}, (_, i) => `# ${i + 1}. TERMS\nTerms.`).join("\n\n"),
        "The agreement contains more than 40 sections. Combine related sections before saving."],
    ]) {
      fireEvent.change(screen.getByLabelText(/agreement text/i), {target: {value: body}});
      await user.click(screen.getByRole("button", {name: "Save Draft"}));
      expect(screen.getByRole("alert")).toHaveTextContent(message);
    }
    expect(mutations.createAdminAgreementVersion).not.toHaveBeenCalled();
  });

  it("shows version history and keeps published versions read-only", async () => {
    const user = userEvent.setup();
    const versioned: AdminAgreementTemplate = {
      ...agreement,
      version: "1.1",
      effectiveDate: "2026-11-01",
      sections: [{title: "Responsibilities", paragraphs: ["Current 1.1 sentence."]}],
      versions: [
        {
          version: "1.0",
          name: agreement.name,
          effectiveDate: "2026-09-29",
          sections: [{title: "Responsibilities", paragraphs: ["Original 1.0 sentence."]}],
          status: "archived",
          createdAt: "2026-09-29T00:00:00.000Z",
          publishedAt: "2026-09-29T00:00:00.000Z",
          archivedAt: "2026-11-01T00:00:00.000Z",
        },
        {
          version: "1.1",
          name: agreement.name,
          effectiveDate: "2026-11-01",
          sections: [{title: "Responsibilities", paragraphs: ["Current 1.1 sentence."]}],
          status: "current",
          createdAt: "2026-10-15T00:00:00.000Z",
          publishedAt: "2026-11-01T00:00:00.000Z",
          archivedAt: null,
        },
        {
          version: "1.2",
          name: agreement.name,
          effectiveDate: "2026-12-01",
          sections: [{title: "Responsibilities", paragraphs: ["Draft 1.2 sentence."]}],
          status: "draft",
          createdAt: "2026-11-02T00:00:00.000Z",
          publishedAt: null,
          archivedAt: null,
        },
      ],
    };
    render(<AgreementTemplateManagement initialAgreements={[versioned]} agreementTypes={agreementTypes} />);
    expect(screen.getByRole("button", {name: "Publish"})).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Edit draft"})).toBeInTheDocument();
    expect(screen.queryByRole("button", {name: "Create new version"})).not.toBeInTheDocument();
    expect(screen.queryByRole("button", {name: "Version history"})).not.toBeInTheDocument();
    expect(screen.queryByRole("link", {name: "Download PDF"})).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", {name: "More actions for Provider agreement"}));
    expect(screen.getByRole("menuitem", {name: "View agreement"})).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", {name: "Create new version"})).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", {name: "Edit draft"})).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", {name: "Publish"})).not.toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", {name: "Version history"}));
    const history = within(screen.getByRole("dialog", {name: /version history/i}));
    expect(history.getByText("1.1")).toBeInTheDocument();
    expect(history.getByText("1.0")).toBeInTheDocument();
    expect(history.getByText("Current")).toBeInTheDocument();
    expect(history.getByText("Archived")).toBeInTheDocument();
    expect(history.getByText("Draft")).toBeInTheDocument();
    expect(history.getByRole("link", {name: "Download PDF"})).toHaveAttribute(
      "href",
      "/api/admin/agreements/provider_agreement/pdf?version=1.0",
    );
    expect(history.getByRole("button", {name: "Edit"})).toBeInTheDocument();
    expect(history.getByRole("button", {name: "Publish"})).toBeInTheDocument();
    expect(history.getByRole("button", {name: "Delete draft"})).toBeInTheDocument();
    await user.click(history.getAllByRole("button", {name: "View"})[1]);
    const view = within(screen.getByRole("dialog", {name: agreement.name}));
    expect(view.getByText(/Published versions cannot be edited/i)).toBeInTheDocument();
    expect(view.getByText("Original 1.0 sentence.")).toBeInTheDocument();
    expect(view.queryByLabelText(/agreement text/i)).not.toBeInTheDocument();
    expect(view.getByRole("button", {name: "Create new version from this version"})).toBeInTheDocument();
  });

  it("opens agreement type selection before the agreement editor", async () => {
    const user = userEvent.setup();
    render(<AgreementTemplateManagement initialAgreements={[]} agreementTypes={agreementTypes} />);
    await user.click(screen.getByRole("button", {name: "Add agreement"}));
    const picker = within(screen.getByRole("dialog", {name: /what agreement do you want to create/i}));
    expect(picker.getByRole("radio", {name: /provider agreement/i})).toBeInTheDocument();
    expect(picker.queryByLabelText(/agreement name/i)).not.toBeInTheDocument();
    expect(mutations.createAdminAgreementTemplate).not.toHaveBeenCalled();
  });

  it("shows agreement type labels from catalog data", async () => {
    const user = userEvent.setup();
    render(<AgreementTemplateManagement initialAgreements={[]} agreementTypes={[{
      ...agreementTypes[1],
      name: "Catalog Terms Example",
      description: "Managed description from the catalog.",
    }]} />);
    await user.click(screen.getByRole("button", {name: "Add agreement"}));
    expect(screen.getByRole("radio", {name: /catalog terms example/i})).toBeInTheDocument();
    expect(screen.getByText("Managed description from the catalog.")).toBeInTheDocument();
    expect(screen.queryByText("Terms of Service")).not.toBeInTheDocument();
    expect(screen.queryByText("FEASTA Provider Agreement")).not.toBeInTheDocument();
  });

  for (const [typeCode, label] of [
    ["provider_agreement", "Provider Agreement"],
    ["terms_of_service", "Terms of Service"],
    ["privacy_policy", "Privacy Policy"],
  ] as const) {
    it(`does not create a second singleton ${label}`, async () => {
      const user = userEvent.setup();
      render(<AgreementTemplateManagement initialAgreements={[{
        ...agreement,
        code: typeCode,
        name: label,
        agreementTypeCode: typeCode,
      }]} agreementTypes={agreementTypes} />);
      await user.click(screen.getByRole("button", {name: "Add agreement"}));
      const picker = within(screen.getByRole("dialog", {name: /what agreement do you want to create/i}));
      await user.click(picker.getByRole("radio", {name: new RegExp(label, "i")}));
      await user.click(picker.getByRole("button", {name: "Continue"}));
      const existing = within(screen.getByRole("dialog", {name: new RegExp(`${label} already exists`, "i")}));
      expect(existing.getByText("Current version: 1")).toBeInTheDocument();
      expect(mutations.createAdminAgreementTemplate).not.toHaveBeenCalled();
      await user.click(existing.getByRole("button", {name: "Open agreement"}));
      expect(screen.queryByText(/use for provider onboarding/i)).not.toBeInTheDocument();
    });
  }

  it("hides Custom Agreement and still lists a stored legacy custom agreement", async () => {
    const user = userEvent.setup();
    render(<AgreementTemplateManagement initialAgreements={[{
      ...agreement,
      code: "calendar_service",
      name: "Optional Calendar Service Agreement",
      agreementTypeCode: "custom_agreement",
    }]} agreementTypes={[...agreementTypes, legacyCustomType]} />);
    expect(screen.getByRole("button", {name: "View Optional Calendar Service Agreement"})).toBeInTheDocument();
    expect(screen.getByText("Other / Custom Agreement")).toBeInTheDocument();
    await user.click(screen.getByRole("button", {name: "Add agreement"}));
    const picker = within(screen.getByRole("dialog", {name: /what agreement do you want to create/i}));
    expect(picker.queryByRole("radio", {name: /custom agreement/i})).not.toBeInTheDocument();
    expect(picker.getByRole("radio", {name: /provider agreement/i})).toBeInTheDocument();
    expect(picker.getByRole("radio", {name: /terms of service/i})).toBeInTheDocument();
    expect(picker.getByRole("radio", {name: /privacy policy/i})).toBeInTheDocument();
    await user.click(picker.getByRole("button", {name: "Cancel"}));
    await user.click(screen.getByRole("button", {name: "Agreement types"}));
    const manager = within(screen.getByRole("dialog", {name: "Agreement types"}));
    expect(manager.queryByText(/custom agreement/i)).not.toBeInTheDocument();
    expect(manager.queryByText(/sort order/i)).not.toBeInTheDocument();
    expect(manager.getByText("Provider Agreement")).toBeInTheDocument();
    expect(manager.getByText("Terms of Service")).toBeInTheDocument();
    expect(manager.getByText("Privacy Policy")).toBeInTheDocument();
    await user.click(manager.getByRole("button", {name: "Close"}));
    await user.click(screen.getByRole("button", {name: "More actions for Optional Calendar Service Agreement"}));
    expect(screen.queryByRole("menuitem", {name: "Delete entire agreement"})).not.toBeInTheDocument();
  });

  it("preserves the stored sort order when an agreement type is saved", async () => {
    const user = userEvent.setup();
    mutations.updateAdminAgreementType.mockResolvedValue({
      agreementType: {...agreementTypes[2], name: "Personal Information Notice"},
    });
    render(<AgreementTemplateManagement initialAgreements={[]} agreementTypes={agreementTypes} />);
    await user.click(screen.getByRole("button", {name: "Agreement types"}));
    const manager = within(screen.getByRole("dialog", {name: "Agreement types"}));
    expect(manager.queryByLabelText(/sort order/i)).not.toBeInTheDocument();
    expect(manager.getByText(/Names, descriptions, and active status can be changed/i)).toBeInTheDocument();
    const privacyName = manager.getAllByLabelText(/^name/i)[2];
    fireEvent.change(privacyName, {target: {value: "Personal Information Notice"}});
    await user.click(manager.getAllByRole("button", {name: "Save type"})[2]);
    await waitFor(() => expect(mutations.updateAdminAgreementType).toHaveBeenCalledWith({
      code: "privacy_policy",
      name: "Personal Information Notice",
      description: agreementTypes[2].description,
      isActive: true,
      sortOrder: 30,
    }));
  });

  it("labels a draft-only agreement as Draft", () => {
    render(<AgreementTemplateManagement initialAgreements={[{
      ...agreement,
      version: "1.0",
      versions: [{
        version: "1.0",
        name: agreement.name,
        effectiveDate: agreement.effectiveDate,
        sections: agreement.sections,
        status: "draft",
        createdAt: null,
        publishedAt: null,
        archivedAt: null,
      }],
    }]} agreementTypes={agreementTypes} />);
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.queryByText("Current")).not.toBeInTheDocument();
  });

  it("rejects an older or duplicate version and accepts a newer one", async () => {
    const user = userEvent.setup();
    const current = {
      version: "1.1",
      name: agreement.name,
      effectiveDate: "2026-11-01",
      sections: agreement.sections,
      status: "current" as const,
      createdAt: null,
      publishedAt: "2026-11-01T00:00:00.000Z",
      archivedAt: null,
    };
    render(<AgreementTemplateManagement initialAgreements={[{
      ...agreement,
      version: "1.1",
      effectiveDate: "2026-11-01",
      versions: [
        {...current, version: "0.9", status: "archived", archivedAt: "2026-11-01T00:00:00.000Z"},
        current,
      ],
    }]} agreementTypes={agreementTypes} />);
    await user.click(screen.getByRole("button", {name: "Create new version"}));
    const editor = within(screen.getByRole("dialog", {name: /creating a new version from 1\.1/i}));
    expect(editor.getByText("Current version: 1.1")).toBeInTheDocument();
    fireEvent.change(editor.getByLabelText(/^version/i), {target: {value: "1.0"}});
    await user.click(editor.getByRole("button", {name: "Save Draft"}));
    expect(editor.getByRole("alert")).toHaveTextContent("Enter a version newer than the current version 1.1.");
    fireEvent.change(editor.getByLabelText(/^version/i), {target: {value: "1.1"}});
    await user.click(editor.getByRole("button", {name: "Save Draft"}));
    expect(editor.getByRole("alert")).toHaveTextContent("Version 1.1 already exists for this agreement.");
    fireEvent.change(editor.getByLabelText(/^version/i), {target: {value: "1.2"}});
    await user.click(editor.getByRole("button", {name: "Save Draft"}));
    await waitFor(() => expect(mutations.createAdminAgreementVersion).toHaveBeenCalledWith(
      expect.objectContaining({version: "1.2", sourceVersion: "1.1"}),
    ));
    expect(screen.queryByText(/use for provider onboarding/i)).not.toBeInTheDocument();
  });

  it("saves a new agreement as a draft and does not publish it", async () => {
    const user = userEvent.setup();
    render(<AgreementTemplateManagement initialAgreements={[]} agreementTypes={agreementTypes} />);
    await user.click(screen.getByRole("button", {name: "Add agreement"}));
    const picker = within(screen.getByRole("dialog", {name: /what agreement do you want to create/i}));
    await user.click(picker.getByRole("radio", {name: /terms of service/i}));
    await user.click(picker.getByRole("button", {name: "Continue"}));
    const editor = within(screen.getByRole("dialog", {name: /add agreement/i}));
    expect(editor.getByLabelText(/agreement name/i)).toHaveValue("Terms of Service");
    fireEvent.change(editor.getByLabelText(/effective date/i), {target: {value: "2026-09-30"}});
    await user.click(editor.getByRole("button", {name: "Save Draft"}));
    await waitFor(() => expect(mutations.createAdminAgreementTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "terms_of_service",
        name: "Terms of Service",
        agreementTypeCode: "terms_of_service",
        version: "1.0",
      }),
    ));
    expect(mutations.publishAdminAgreementVersion).not.toHaveBeenCalled();
  });

  it("publishes a new agreement only after confirmation", async () => {
    const user = userEvent.setup();
    mutations.createAdminAgreementTemplate.mockResolvedValue({success: true});
    mutations.publishAdminAgreementVersion.mockResolvedValue({success: true});
    render(<AgreementTemplateManagement initialAgreements={[]} agreementTypes={agreementTypes} />);
    await user.click(screen.getByRole("button", {name: "Add agreement"}));
    const picker = within(screen.getByRole("dialog", {name: /what agreement do you want to create/i}));
    await user.click(picker.getByRole("radio", {name: /terms of service/i}));
    await user.click(picker.getByRole("button", {name: "Continue"}));
    fireEvent.change(screen.getByLabelText(/effective date/i), {target: {value: "2026-09-30"}});
    await user.click(screen.getByRole("button", {name: "Publish"}));
    expect(mutations.createAdminAgreementTemplate).not.toHaveBeenCalled();
    const confirmation = within(screen.getByRole("dialog", {name: /publish terms of service 1\.0/i}));
    expect(confirmation.getByText("Terms of Service")).toBeInTheDocument();
    expect(confirmation.getByText("1.0")).toBeInTheDocument();
    expect(confirmation.getByText("2026-09-30")).toBeInTheDocument();
    expect(confirmation.queryByText(/providers will be shown/i)).not.toBeInTheDocument();
    await user.click(confirmation.getByRole("button", {name: "Publish version"}));
    await waitFor(() => expect(mutations.publishAdminAgreementVersion).toHaveBeenCalledWith({
      code: "terms_of_service",
      version: "1.0",
    }));
    expect(mutations.createAdminAgreementTemplate).toHaveBeenCalled();
    expect(feastaToast.success).toHaveBeenCalledWith("Version 1.0 is now current.");
  });

  it("leaves the created draft in place when publication fails", async () => {
    const user = userEvent.setup();
    mutations.createAdminAgreementTemplate.mockResolvedValue({success: true});
    mutations.publishAdminAgreementVersion.mockRejectedValue(new Error("This agreement type no longer matches its system contract."));
    render(<AgreementTemplateManagement initialAgreements={[]} agreementTypes={agreementTypes} />);
    await user.click(screen.getByRole("button", {name: "Add agreement"}));
    const picker = within(screen.getByRole("dialog", {name: /what agreement do you want to create/i}));
    await user.click(picker.getByRole("radio", {name: /privacy policy/i}));
    await user.click(picker.getByRole("button", {name: "Continue"}));
    fireEvent.change(screen.getByLabelText(/effective date/i), {target: {value: "2026-09-30"}});
    await user.click(screen.getByRole("button", {name: "Publish"}));
    await user.click(screen.getByRole("button", {name: "Publish version"}));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("This agreement type no longer matches its system contract."));
    expect(feastaToast.success).not.toHaveBeenCalledWith("Version 1.0 is now current.");
    expect(screen.getByText("Draft")).toBeInTheDocument();
  });

  it("asks before publishing a provider replacement", async () => {
    const user = userEvent.setup();
    render(<AgreementTemplateManagement initialAgreements={[agreement]} agreementTypes={agreementTypes} />);
    await user.click(screen.getByRole("button", {name: "Create new version"}));
    const editor = within(screen.getByRole("dialog", {name: /creating a new version from 1/i}));
    fireEvent.change(editor.getByLabelText(/^version/i), {target: {value: "1.2"}});
    await user.click(editor.getByRole("button", {name: "Publish"}));
    expect(mutations.createAdminAgreementVersion).not.toHaveBeenCalled();
    const confirmation = within(screen.getByRole("dialog", {name: /publish provider agreement 1\.2/i}));
    expect(confirmation.getByText(/Publishing Version 1.2 will archive current Version 1/i)).toBeInTheDocument();
    expect(confirmation.getByText(/Providers will be shown this version/i)).toBeInTheDocument();
  });

  it("rejects incomplete agreement fields before saving", async () => {
    const user = userEvent.setup();
    render(<AgreementTemplateManagement initialAgreements={[]} agreementTypes={agreementTypes} />);
    await user.click(screen.getByRole("button", {name: "Add agreement"}));
    const picker = within(screen.getByRole("dialog", {name: /what agreement do you want to create/i}));
    await user.click(picker.getByRole("radio", {name: /privacy policy/i}));
    await user.click(picker.getByRole("button", {name: "Continue"}));
    fireEvent.change(screen.getByLabelText(/summary/i), {target: {value: "A".repeat(501)}});
    await user.click(screen.getByRole("button", {name: "Save Draft"}));
    expect(screen.getByText("Summary must be 500 characters or fewer.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/summary/i), {target: {value: "Optional summary"}});
    fireEvent.change(screen.getByLabelText(/^version/i), {target: {value: " "}});
    await user.click(screen.getByRole("button", {name: "Save Draft"}));
    expect(screen.getByText("Enter a valid version.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^version/i), {target: {value: "1.0"}});
    for (const value of ["2026/09/30", "2026-02-30", "2026-13-01", "2026-00-12"]) {
      fireEvent.change(screen.getByLabelText(/effective date/i), {target: {value}});
      await user.click(screen.getByRole("button", {name: "Save Draft"}));
      expect(screen.getByText("Enter a valid effective date.")).toBeInTheDocument();
    }
    fireEvent.change(screen.getByLabelText(/effective date/i), {target: {value: "2026-09-30"}});
    fireEvent.change(screen.getByLabelText(/agreement text/i), {target: {value: " "}});
    await user.click(screen.getByRole("button", {name: "Save Draft"}));
    expect(screen.getByText("Agreement text is required.")).toBeInTheDocument();
    expect(mutations.createAdminAgreementTemplate).not.toHaveBeenCalled();
  });

  it("confirms before discarding unsaved agreement edits", async () => {
    const user = userEvent.setup();
    render(<AgreementTemplateManagement initialAgreements={[]} agreementTypes={agreementTypes} />);
    await user.click(screen.getByRole("button", {name: "Add agreement"}));
    const picker = within(screen.getByRole("dialog", {name: /what agreement do you want to create/i}));
    await user.click(picker.getByRole("radio", {name: /privacy policy/i}));
    await user.click(picker.getByRole("button", {name: "Continue"}));
    fireEvent.change(screen.getByLabelText(/summary/i), {target: {value: "Short notice"}});
    await user.click(screen.getByRole("button", {name: "Cancel"}));
    const discard = within(screen.getByRole("dialog", {name: /discard unsaved changes/i}));
    await user.click(discard.getByRole("button", {name: "Keep editing"}));
    expect(screen.getByLabelText(/summary/i)).toHaveValue("Short notice");
    await user.click(screen.getByRole("button", {name: "Cancel"}));
    await user.click(screen.getByRole("button", {name: "Discard"}));
    expect(screen.queryByRole("dialog", {name: /add agreement/i})).not.toBeInTheDocument();
  });

  it("shows draft actions separately from the current version", async () => {
    const user = userEvent.setup();
    render(<AgreementTemplateManagement initialAgreements={[{
      ...agreement,
      version: "1.0",
      versions: [{
        version: "1.0",
        name: agreement.name,
        effectiveDate: agreement.effectiveDate,
        sections: agreement.sections,
        status: "draft",
        createdAt: null,
        publishedAt: null,
        archivedAt: null,
      }],
    }]} agreementTypes={agreementTypes} />);
    expect(screen.getByRole("button", {name: "Edit draft"})).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Publish"})).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "View Provider agreement"})).toBeInTheDocument();
    expect(screen.queryByRole("button", {name: "View"})).not.toBeInTheDocument();
    expect(screen.queryByRole("button", {name: "Create new version"})).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", {name: "More actions for Provider agreement"}));
    expect(screen.getByRole("menuitem", {name: "Version history"})).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", {name: "View agreement"})).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", {name: "Download PDF"})).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", {name: "Edit draft"})).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", {name: "Publish"})).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", {name: "Edit draft"}));
    const editor = within(screen.getByRole("dialog", {name: /edit draft/i}));
    expect(editor.getByRole("button", {name: "Save Draft"})).toBeInTheDocument();
    expect(editor.getByRole("button", {name: "Publish"})).toBeInTheDocument();
    expect(editor.getByRole("button", {name: "Delete Draft"})).toBeInTheDocument();
    expect(editor.queryByRole("button", {name: "Save"})).not.toBeInTheDocument();
  });
});

  it.each(agreementTypes.flatMap((type) => (["active", "discontinued"] as const).map((status) => ({type, status}))))(
    "removes lifecycle actions and Status for $type.code ($status)",
    async ({type, status}) => {
      const user = userEvent.setup();
      render(<AgreementTemplateManagement initialAgreements={[{...agreement, agreementTypeCode: type.code, status}]} agreementTypes={agreementTypes} />);
      expect(screen.queryByRole("columnheader", {name: "Status"})).toBeNull();
      expect(screen.queryByLabelText("Status", {exact: true})).toBeNull();
      expect(screen.getByRole("button", {name: "Create new version"})).toBeEnabled();
      await user.click(screen.getByRole("button", {name: `More actions for ${agreement.name}`}));
      expect(screen.queryByRole("menuitem", {name: /Discontinue|Reactivate|^Delete$/})).toBeNull();
      expect(screen.getByRole("menuitem", {name: "Version history"})).toBeVisible();
      expect(screen.getByRole("menuitem", {name: "Download PDF"})).toBeVisible();
    },
  );

  it("removes a never-published lineage after deleting its only draft", async () => {
    const user = userEvent.setup();
    mutations.deleteAdminAgreementVersion.mockResolvedValue({success: true, deletedCode: agreement.code});
    render(<AgreementTemplateManagement initialAgreements={[{...agreement, versions: [{
      version: "1.0", name: agreement.name, sections: agreement.sections,
      effectiveDate: agreement.effectiveDate, status: "draft", createdAt: null, publishedAt: null, archivedAt: null,
    }]}]} agreementTypes={agreementTypes} />);
    await user.click(screen.getByRole("button", {name: `More actions for ${agreement.name}`}));
    await user.click(screen.getByRole("menuitem", {name: "Delete Draft"}));
    await user.click(await screen.findByRole("button", {name: "Delete draft"}));
    await waitFor(() => expect(screen.queryByRole("button", {name: `View ${agreement.name}`})).toBeNull());
    expect(mutations.deleteAdminAgreementVersion).toHaveBeenCalledWith({code: agreement.code, version: "1.0"});
  });

it.each([false, true])('prefills and saves version Summary (editing draft: %s)', async (editingDraft) => {
  vi.clearAllMocks();
  const user = userEvent.setup();
  const current = {
    version: '1.0', name: agreement.name, summary: 'Published summary', effectiveDate: agreement.effectiveDate,
    sections: agreement.sections, status: 'current' as const, createdAt: null, publishedAt: null, archivedAt: null,
  };
  const draft = {...current, version: '1.1', summary: 'Saved draft summary', status: 'draft' as const};
  const mutation = editingDraft ? mutations.updateAdminAgreementVersion : mutations.createAdminAgreementVersion;
  mutation.mockResolvedValue({success: true, agreement: {...agreement, summary: current.summary, versions: [current, {...draft, summary: 'Changed draft summary'}]}});
  render(<AgreementTemplateManagement initialAgreements={[{...agreement, summary: current.summary, versions: editingDraft ? [current, draft] : [current]}]} agreementTypes={agreementTypes} />);
  await user.click(screen.getByRole('button', {name: editingDraft ? 'Edit draft' : 'Create new version'}));
  const editor = within(screen.getByRole('dialog'));
  expect(editor.getByLabelText('Summary')).toHaveValue(editingDraft ? draft.summary : current.summary);
  expect(editor.getByLabelText('Summary')).toHaveAttribute('maxlength', '500');
  await user.clear(editor.getByLabelText('Summary'));
  await user.type(editor.getByLabelText('Summary'), 'Changed draft summary');
  await user.click(editor.getByRole('button', {name: 'Save Draft'}));
  await waitFor(() => expect(mutation).toHaveBeenCalledWith(expect.objectContaining({summary: 'Changed draft summary'})));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  await user.click(screen.getByRole('button', {name: `View ${agreement.name}`}));
  expect(screen.getByText('Published summary')).toBeVisible();
  expect(screen.queryByText('Changed draft summary')).toBeNull();
});
