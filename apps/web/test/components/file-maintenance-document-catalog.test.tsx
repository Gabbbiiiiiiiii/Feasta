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
  discontinueAdminAgreementTemplate: vi.fn(),
  reactivateAdminAgreementTemplate: vi.fn(),
  deleteAdminAgreementTemplate: vi.fn(),
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
import {
  AgreementTemplateManagement,
  BusinessDocumentManagement,
} from "@/components/admin/file-maintenance/document-catalog-management-client";
import type {
  AdminAgreementTemplate,
  AdminBusinessDocumentType,
} from "@/lib/admin/file-maintenance/admin-document-catalog-types";

const agreement: AdminAgreementTemplate = {
  code: "provider_agreement",
  categoryCode: "test",
  name: "Provider agreement",
  summary: "Provider responsibilities",
  version: "1",
  effectiveDate: "2026-09-27",
  sections: [{title: "Responsibilities", paragraphs: ["Provide the agreed services."]}],
  useForProviderOnboarding: true,
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
    render(<AgreementTemplateManagement initialAgreements={[]} />);
    await user.click(screen.getByRole("button", {name: "Add agreement"}));
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.queryByLabelText(/document category/i)).not.toBeInTheDocument();
    fireEvent.change(dialog.getByLabelText(/agreement name/i), {target: {value: "New agreement"}});
    fireEvent.change(dialog.getByLabelText(/version/i), {target: {value: "2"}});
    fireEvent.change(dialog.getByLabelText(/effective date/i), {target: {value: "2026-09-29"}});
    await user.click(dialog.getByRole("button", {name: "Save"}));
    await waitFor(() => expect(mutations.createAdminAgreementTemplate).toHaveBeenCalledWith(
      expect.objectContaining({categoryCode: "agreements", code: "new_agreement"}),
    ));
  });

  it("edits legacy agreements while preserving onboarding assignment and content", async () => {
    const user = userEvent.setup();
    render(<AgreementTemplateManagement initialAgreements={[agreement]} />);
    await user.click(screen.getByRole("button", {name: "Edit"}));
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.queryByLabelText(/document category/i)).not.toBeInTheDocument();
    await user.click(dialog.getByRole("button", {name: "Save"}));
    await waitFor(() => expect(mutations.updateAdminAgreementTemplate).toHaveBeenCalledWith({
      code: agreement.code, categoryCode: "agreements", name: agreement.name,
      summary: agreement.summary, version: agreement.version, effectiveDate: agreement.effectiveDate,
      sections: agreement.sections, useForProviderOnboarding: true,
    }));
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
    render(<AgreementTemplateManagement initialAgreements={[agreement]} />);
    await user.click(screen.getByRole("button", {name: "Edit"}));
    const dialog = within(screen.getByRole("dialog"));
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
    render(<AgreementTemplateManagement initialAgreements={[agreement]} />);
    await user.click(screen.getByRole("button", {name: "Edit"}));
    await user.click(screen.getByRole("button", {name: "Create new version"}));
    const dialog = within(screen.getByRole("dialog", {name: /creating a new version from 1/i}));
    fireEvent.change(dialog.getByLabelText(/^version/i), {target: {value: "1.1"}});
    fireEvent.change(dialog.getByLabelText(/agreement text/i), {
      target: {value: "# Responsibilities\n\nUpdated draft wording."},
    });
    await user.click(dialog.getByRole("button", {name: "Save draft"}));
    await waitFor(() => expect(mutations.createAdminAgreementVersion).toHaveBeenCalledWith({
      code: agreement.code,
      sourceVersion: "1",
      version: "1.1",
      effectiveDate: agreement.effectiveDate,
      publish: false,
      sections: [{title: "Responsibilities", paragraphs: ["Updated draft wording."]}],
    }));
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
    render(<AgreementTemplateManagement initialAgreements={[versioned]} />);
    await user.click(screen.getByRole("button", {name: "Edit"}));
    await user.click(screen.getByRole("button", {name: "Version history"}));
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
    expect(view.getByRole("button", {name: "Create new version"})).toBeInTheDocument();
  });
});
