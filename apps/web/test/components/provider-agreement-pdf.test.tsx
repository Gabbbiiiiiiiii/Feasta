import {PDFDocument, PDFRawStream, decodePDFRawStream} from "pdf-lib";
import {beforeEach, describe, expect, it, vi} from "vitest";

import {renderProviderAgreementPdf} from "@/lib/provider/provider-agreement-pdf";
import {
  providerAgreementContentDisposition,
  providerAgreementPdfFilename,
  selectProviderAgreementPdf,
  type ProviderAgreementSection,
} from "@/lib/provider/provider-agreement-record";

const mocks = vi.hoisted(() => ({
  account: vi.fn(),
  load: vi.fn(),
  stored: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getOptionalAccountContext: mocks.account,
}));
vi.mock("@/lib/provider/provider-agreement-download", () => ({
  loadProviderAgreementPdfDocument: mocks.load,
}));
vi.mock("@/lib/documents/document-catalog-service", () => ({
  getStoredAgreementVersion: mocks.stored,
}));

import {GET} from "@/app/api/provider/agreement/pdf/route";
import {GET as getHistoricalPdf} from "@/app/api/admin/agreements/[code]/pdf/route";

const originalSections: ProviderAgreementSection[] = [
  {
    title: "1. Original terms",
    paragraphs: ["The provider accepted this original sentence."],
  },
];
const currentSections: ProviderAgreementSection[] = [
  {
    title: "1. Replacement terms",
    paragraphs: ["This replacement sentence was never accepted."],
  },
];

function acceptedRecord() {
  return {
    snapshot: {
      code: "feasta_provider_agreement",
      name: "FEASTA Provider Agreement",
      version: "2026-09-27",
      effectiveDate: "2026-09-27",
      sections: originalSections,
      acceptedAt: {seconds: Date.parse("2026-09-29T08:00:00.000Z") / 1000},
    },
    businessName: "Ada's Kitchen",
    representativeName: "Ada Lovelace",
    providerId: "provider-123",
  };
}

describe("provider agreement PDF", () => {
  beforeEach(() => {
    mocks.account.mockReset();
    mocks.load.mockReset();
    mocks.stored.mockReset();
  });

  it("rejects an arbitrary client version and keeps an accepted snapshot stable", () => {
    const current = {
      name: "FEASTA Provider Agreement",
      version: "2026-10-01",
      effectiveDate: "2026-10-01",
      sections: currentSections.map((section) => ({
        title: section.title,
        paragraphs: [...section.paragraphs],
      })),
    };
    const accepted = selectProviderAgreementPdf({
      copy: "accepted",
      current,
      accepted: acceptedRecord(),
    });
    current.sections[0].paragraphs[0] = "Changed after the model was built.";

    expect(accepted?.version).toBe("2026-09-27");
    expect(accepted?.sections[0].paragraphs[0]).toBe(
      "The provider accepted this original sentence.",
    );
    expect(accepted?.acceptance?.businessName).toBe("Ada's Kitchen");
    expect(accepted?.acceptance?.representativeName).toBe("Ada Lovelace");
    expect(accepted?.acceptance?.providerId).toBe("provider-123");
    expect(accepted?.acceptance?.acceptedAtLabel).toContain("September 29, 2026");
    expect(accepted?.acceptance?.acceptedAtLabel).toContain("16:00");

    const currentPdf = selectProviderAgreementPdf({
      copy: "current",
      current,
      accepted: acceptedRecord(),
    });
    expect(currentPdf?.version).toBe("2026-10-01");
    expect(currentPdf?.sections[0].paragraphs[0]).toBe(
      "Changed after the model was built.",
    );
    expect(currentPdf?.acceptance).toBeNull();
    expect(selectProviderAgreementPdf({
      copy: "accepted",
      current,
      accepted: null,
    })).toBeNull();
  });

  it("renders the same sections into a multi-page attachment without form fields", async () => {
    const longParagraph = `${"The provider must honor the confirmed booking. ".repeat(180)} END OF AGREEMENT MARKER`;
    const bytes = await renderProviderAgreementPdf({
      name: "FEASTA Provider Agreement",
      version: "2026-09-29",
      effectiveDate: "2026-09-29",
      sections: [
        {
          title: "1. Booking duties",
          paragraphs: [
            "Providers accept \u201Cquoted\u201D duties\u2014before service.",
            longParagraph,
          ],
        },
      ],
      acceptance: null,
    });
    const text = await extractPdfText(bytes);
    const document = await PDFDocument.load(bytes);

    expect(text).toContain("FEASTA PROVIDER AGREEMENT");
    expect(text).toContain("1. Booking duties");
    expect(text).toContain("END OF AGREEMENT MARKER");
    expect(text).toContain("\"quoted\"");
    expect(text).toContain("duties-before");
    expect(text).not.toContain("\u201C");
    expect(text).not.toContain("\u2014");
    expect(text).not.toContain("ELECTRONIC ACCEPTANCE RECORD");
    expect(document.getPageCount()).toBeGreaterThan(1);
    expect(document.getForm().getFields()).toHaveLength(0);
    expect(providerAgreementPdfFilename("2026-09-29")).toBe(
      "FEASTA-Provider-Agreement-v2026-09-29.pdf",
    );
    expect(providerAgreementPdfFilename("v1\r\n\";.pdf")).not.toMatch(/[\r\n"]/u);
    expect(providerAgreementContentDisposition("2026-09-29")).toBe(
      "attachment; filename=\"FEASTA-Provider-Agreement-v2026-09-29.pdf\"",
    );
  });

  it("renders an accepted copy from the historical snapshot", async () => {
    const model = selectProviderAgreementPdf({
      copy: "accepted",
      current: {
        name: "FEASTA Provider Agreement",
        version: "2026-10-01",
        effectiveDate: "2026-10-01",
        sections: currentSections,
      },
      accepted: {
        ...acceptedRecord(),
        providerId: null,
      },
    });
    expect(model).not.toBeNull();
    const text = await extractPdfText(await renderProviderAgreementPdf(model!));

    expect(text).toContain("The provider accepted this original sentence.");
    expect(text).not.toContain("This replacement sentence was never accepted.");
    expect(text).toContain("ELECTRONIC ACCEPTANCE RECORD");
    expect(text).toContain("Provider / Business: Ada's Kitchen");
    expect(text).toContain("Authorized Representative: Ada Lovelace");
    expect(text).toContain("Agreement Version: 2026-09-27");
    expect(text).toContain("Status: Electronically Accepted");
    expect(text).not.toContain("Provider ID:");
  });

  it("requires a provider session and returns the PDF as an attachment", async () => {
    mocks.account.mockResolvedValueOnce(null);
    const anonymous = await GET(new Request("http://localhost/api/provider/agreement/pdf"));
    expect(anonymous.status).toBe(401);
    expect(mocks.load).not.toHaveBeenCalled();

    mocks.account.mockResolvedValueOnce({
      role: "customer",
      uid: "customer",
      providerId: null,
    });
    const customer = await GET(new Request(
      "http://localhost/api/provider/agreement/pdf?copy=accepted&version=evil",
    ));
    expect(customer.status).toBe(403);
    expect(mocks.load).not.toHaveBeenCalled();

    mocks.account.mockResolvedValueOnce({
      role: "provider",
      uid: "owner",
      providerId: "provider-123",
    });
    mocks.load.mockResolvedValueOnce({
      bytes: Uint8Array.from([0x25, 0x50, 0x44, 0x46]),
      version: "2026-09-27",
    });
    const response = await GET(new Request(
      "http://localhost/api/provider/agreement/pdf?copy=accepted&version=evil&sections=forged",
    ));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toBe(
      "attachment; filename=\"FEASTA-Provider-Agreement-v2026-09-27.pdf\"",
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(new Uint8Array(await response.arrayBuffer()).slice(0, 4)).toEqual(
      Uint8Array.from([0x25, 0x50, 0x44, 0x46]),
    );
    expect(mocks.load).toHaveBeenCalledWith({
      uid: "owner",
      providerId: "provider-123",
      copy: "accepted",
    });
  });

  it("renders historical 1.0 text and current 1.1 text from the stored version", async () => {
    const historical = await renderProviderAgreementPdf({
      name: "FEASTA Provider Agreement",
      version: "1.0",
      effectiveDate: "2026-09-29",
      sections: [{
        title: "1. Original terms",
        paragraphs: ["Original 1.0 sentence."],
      }],
      acceptance: null,
    });
    const current = await renderProviderAgreementPdf({
      name: "FEASTA Provider Agreement",
      version: "1.1",
      effectiveDate: "2026-11-01",
      sections: [{
        title: "1. Replacement terms",
        paragraphs: ["Current 1.1 sentence."],
      }],
      acceptance: null,
    });
    const historicalText = await extractPdfText(historical);
    const currentText = await extractPdfText(current);
    expect(historicalText).toContain("Version: 1.0");
    expect(historicalText).toContain("Original 1.0 sentence.");
    expect(historicalText).not.toContain("Current 1.1 sentence.");
    expect(currentText).toContain("Version: 1.1");
    expect(currentText).toContain("Current 1.1 sentence.");
    expect(currentText).not.toContain("Original 1.0 sentence.");

    mocks.account.mockResolvedValue({role: "admin", uid: "admin", providerId: null});
    mocks.stored.mockResolvedValueOnce({
      name: "FEASTA Provider Agreement",
      version: "1.0",
      effectiveDate: "2026-09-29",
      sections: [{title: "1. Original terms", paragraphs: ["Original 1.0 sentence."]}],
      status: "archived",
    });
    const archivedResponse = await getHistoricalPdf(
      new Request("http://localhost/api/admin/agreements/feasta_provider_agreement/pdf?version=1.0"),
      {params: Promise.resolve({code: "feasta_provider_agreement"})},
    );
    expect(archivedResponse.status).toBe(200);
    expect(await extractPdfText(new Uint8Array(await archivedResponse.arrayBuffer())))
      .toContain("Original 1.0 sentence.");
    expect(mocks.stored).toHaveBeenCalledWith("feasta_provider_agreement", "1.0");

    mocks.account.mockResolvedValueOnce({role: "provider", uid: "owner", providerId: "provider-1"});
    const denied = await getHistoricalPdf(
      new Request("http://localhost/api/admin/agreements/feasta_provider_agreement/pdf?version=1.0"),
      {params: Promise.resolve({code: "feasta_provider_agreement"})},
    );
    expect(denied.status).toBe(403);
  });
});

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await PDFDocument.load(bytes);
  const parts: string[] = [];
  for (const [, object] of pdf.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream)) continue;
    const decoded = Buffer.from(decodePDFRawStream(object).decode());
    const content = decoded.toString("latin1");
    for (const literal of content.match(/\((?:\\\)|\\.|[^)])*\)/g) ?? []) {
      parts.push(literal.slice(1, -1)
        .replace(/\\([()\\])/g, "$1")
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t"));
    }
    for (const hex of content.match(/<[0-9A-Fa-f]+>/g) ?? []) {
      const digits = hex.slice(1, -1);
      if (digits.length < 2 || digits.length % 2 !== 0) continue;
      parts.push(Buffer.from(digits, "hex").toString("latin1"));
    }
  }
  return parts.join("\n");
}
