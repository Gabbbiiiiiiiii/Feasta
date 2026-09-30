import {cleanup, render, screen} from "@testing-library/react";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

import {LegalAgreementPage} from "@/components/documents/legal-agreement-page";
import {getCurrentLegalAgreement} from "@/lib/documents/current-legal-agreement";

const db = vi.hoisted(() => ({records: {} as Record<string, Record<string, unknown>>, fail: false}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/firebase/admin", () => ({adminDb: {
  collection: (collection: string) => ({get: async () => {
    if (db.fail) throw new Error("offline");
    return {docs: Object.entries(db.records)
      .filter(([path]) => path.startsWith(`${collection}/`))
      .map(([path, data]) => ({id: path.split("/")[1], data: () => data}))};
  }}),
}}));

type PolicyVersion = {
  name: string;
  summary: string;
  version: string;
  status: "draft" | "current" | "archived";
  effectiveDate: string;
  sections: {title: string; paragraphs: string[]}[];
  createdAt: null;
  publishedAt: string | null;
  archivedAt: null;
};

const version = (label: string, status: PolicyVersion["status"]): PolicyVersion => ({
  name: "Published policy name", summary: `Summary ${label}`, version: label, status, effectiveDate: "2026-09-30",
  sections: [{title: "Policy section", paragraphs: [`Admin wording ${label}`]}],
  createdAt: null, publishedAt: status === "draft" ? null : "2026-09-30", archivedAt: null,
});

const agreementTypes = [
  ["provider_agreement", "Provider Agreement", "provider_onboarding", "provider", true, 10],
  ["terms_of_service", "Terms of Service", "platform_terms", "platform", false, 20],
  ["privacy_policy", "Privacy Policy", "privacy_notice", "platform", false, 30],
  ["custom_agreement", "Terms of Service", "custom", "custom", false, 40],
] as const;

beforeEach(() => {
  db.fail = false;
  db.records = Object.fromEntries(agreementTypes.map(([code, name, purpose, targetAudience, requiresAcceptance, sortOrder]) => [`agreementTypes/${code}`, {
    code, name, description: name, purpose, singleton: code !== "custom_agreement", requiresAcceptance,
    targetAudience, system: true, isActive: true, sortOrder,
  }]));
  const legacy = version("9.9", "current");
  legacy.sections[0].paragraphs[0] = "Legacy custom wording";
  db.records["agreementTemplates/legacy_custom"] = {
    agreementTypeCode: "custom_agreement",
    name: "Terms of Service",
    versions: [legacy],
  };
});
afterEach(cleanup);

describe.each([
  ["platform_terms", "terms_of_service", "Terms of Service are currently unavailable."],
  ["privacy_notice", "privacy_policy", "Privacy Policy is currently unavailable."],
] as const)("Dynamic %s", (purpose, code, unavailable) => {
  it("renders only Current and uses 1.1 after publication without changing provider content", async () => {
    const provider = {agreementTypeCode: "provider_agreement", versions: [version("8.0", "current")]};
    db.records["agreementTemplates/provider"] = provider;
    const versions = [version("0.9", "archived"), version("1.0", "current"), version("1.1", "draft")];
    const record = {agreementTypeCode: code, name: "Editable lineage name", versions};
    db.records["agreementTemplates/renamed_document"] = record;
    const view = render(await LegalAgreementPage({purpose}));
    expect(screen.getByRole("heading", {level: 1})).toHaveTextContent("Published policy name");
    expect(screen.getByText("Version 1.0")).toBeVisible();
    expect(screen.getByText("Summary 1.0")).toBeVisible();
    expect(screen.queryByText("Summary 1.1")).toBeNull();
    expect(screen.getByText("Effective date: 2026-09-30")).toBeVisible();
    expect(screen.getByText("Admin wording 1.0")).toBeVisible();
    expect(screen.queryByText("Admin wording 1.1")).toBeNull();
    expect(screen.queryByText("Admin wording 0.9")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    record.versions = versions.map((entry) => {
      if (entry.status === "current") return {...entry, status: "archived" as const};
      if (entry.version === "1.1") return {...entry, name: "Updated published name", status: "current" as const};
      return entry;
    });
    view.rerender(await LegalAgreementPage({purpose}));
    expect(screen.getByText("Version 1.1")).toBeVisible();
    expect(screen.getByText("Summary 1.1")).toBeVisible();
    expect(screen.queryByText("Summary 1.0")).toBeNull();
    expect(screen.getByText("Admin wording 1.1")).toBeVisible();
    expect(screen.queryByText("Admin wording 1.0")).toBeNull();
    expect(screen.queryByText("Legacy custom wording")).toBeNull();
    expect(db.records["agreementTemplates/provider"]).toEqual(provider);
  });

  it.each(["missing", "draft", "archived", "legacy", "duplicate", "two-current", "malformed-current", "forged-type"])(
    "renders unavailable for %s without fallback content", async (scenario) => {
      const record: Record<string, unknown> = {agreementTypeCode: code, ...version("1.0", "current"), versions: [version("1.0", "current")]};
      db.records["agreementTemplates/policy"] = record;
      if (scenario === "missing") delete db.records["agreementTemplates/policy"];
      if (scenario === "draft" || scenario === "archived") record.versions = [version("1.0", scenario)];
      if (scenario === "legacy") delete record.versions;
      if (scenario === "duplicate") db.records["agreementTemplates/other"] = {agreementTypeCode: code, versions: []};
      if (scenario === "two-current") record.versions = [version("1.0", "current"), version("1.1", "current")];
      if (scenario === "malformed-current") record.versions = [version("1.0", "current"), {status: "current"}];
      if (scenario === "forged-type") db.records[`agreementTypes/${code}`].singleton = false;
      expect(await getCurrentLegalAgreement(purpose)).toBeNull();
      render(await LegalAgreementPage({purpose}));
      expect(screen.getByRole("status")).toHaveTextContent(unavailable);
      expect(screen.queryByText(/Admin wording/)).toBeNull();
    },
  );

  it("handles datastore errors as unavailable", async () => {
    db.fail = true;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(await LegalAgreementPage({purpose}));
    expect(screen.getByRole("status")).toHaveTextContent(unavailable);
  });
});
