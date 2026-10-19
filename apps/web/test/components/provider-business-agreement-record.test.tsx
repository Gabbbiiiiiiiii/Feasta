import {beforeEach, describe, expect, it, vi} from "vitest";
import {PDFDocument, PDFRawStream, decodePDFRawStream} from "pdf-lib";
import {loadProviderAgreementAcceptanceSummary} from "@/lib/provider/provider-agreement-download";

const database = vi.hoisted(() => ({collection: vi.fn(), providerGet: vi.fn(), verificationGet: vi.fn(), limit: vi.fn(), write: vi.fn()}));
vi.mock("@/lib/firebase/admin", () => ({adminDb: {collection: database.collection}}));
const downloads = vi.hoisted(() => ({published: vi.fn(), account: vi.fn()}));
vi.mock("@/lib/documents/document-catalog-service", () => ({getPublishedProviderAgreement: downloads.published}));
vi.mock("@/lib/auth/session", () => ({getOptionalAccountContext: downloads.account}));
import {GET} from "@/app/api/provider/agreement/pdf/route";

beforeEach(() => {
  vi.clearAllMocks();
  downloads.account.mockResolvedValue({role: "provider", uid: "owner-one", providerId: "provider-one"});
  database.limit.mockReturnValue({get: database.verificationGet});
  database.collection.mockImplementation((name: string) => {
    if (name === "providers") return {doc: () => ({get: database.providerGet, set: database.write, update: database.write})};
    if (name === "providerVerifications") return {where: () => ({limit: database.limit})};
    throw new Error(`Unexpected collection ${name}`);
  });
});

describe("accepted contract PDF downloads", () => {
  const snapshot = {
    code: "provider_agreement", name: "FEASTA Provider Agreement", version: "historic-1",
    effectiveDate: "2025-01-01", sections: [
      {title: "1. Historical clause", paragraphs: ["1.1 Exact accepted paragraph.", "1.2 Second accepted paragraph."]},
      {title: "2. Final clause", paragraphs: ["2.1 Final accepted paragraph."]},
    ],
  };

  it.each([true, false])("downloads exact accepted content with acceptance date available: %s", async (hasDate) => {
    const provider = {ownerId: "owner-one", businessName: "Historical Business", isSuspended: true};
    const verification = {
      ownerId: "owner-one", providerId: "provider-one", providerAgreementSnapshot: snapshot, providerAgreementVersion: "historic-1",
      ...(hasDate ? {providerAgreementAcceptedAt: {seconds: 1735689600}} : {}),
    };
    const before = JSON.stringify({provider, verification});
    database.providerGet.mockResolvedValue({data: () => provider});
    database.verificationGet.mockResolvedValue({size: 1, docs: [{data: () => verification}]});
    const response = await GET(new Request("http://localhost/api/provider/agreement/pdf?copy=accepted&version=current"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("FEASTA-Provider-Agreement-vhistoric-1.pdf");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const pdf = await PDFDocument.load(await response.arrayBuffer());
    const content = pdf.context.enumerateIndirectObjects().flatMap(([, object]) =>
      object instanceof PDFRawStream ? [Buffer.from(decodePDFRawStream(object).decode()).toString("latin1")] : [],
    ).join("\n");
    // pdf-lib emits Helvetica text as hex strings. Inspect the actual PDF text streams.
    const text = [...content.matchAll(/<([0-9A-Fa-f]+)>/g)].map((match) => Buffer.from(match[1], "hex").toString("latin1")).join("\n");
    expect(text).toContain("FEASTA Provider Agreement");
    expect(text).toContain("Version: historic-1");
    for (const section of snapshot.sections) {
      expect(text).toContain(section.title);
      for (const paragraph of section.paragraphs) expect(text).toContain(paragraph);
    }
    expect(text).toContain(hasDate ? "January 1, 2025" : "Date and Time Accepted: Not available");
    if (hasDate) expect(text).toContain("Asia/Manila");
    expect(downloads.published).not.toHaveBeenCalled();
    expect(database.write).not.toHaveBeenCalled();
    expect(JSON.stringify({provider, verification})).toBe(before);
  });

  it.each([null, {...snapshot, version: "other-version"}])("returns 404 for missing or mismatched history and never substitutes current content", async (storedSnapshot) => {
    database.providerGet.mockResolvedValue({data: () => ({ownerId: "owner-one"})});
    database.verificationGet.mockResolvedValue({size: 1, docs: [{data: () => ({
      ownerId: "owner-one", providerId: "provider-one", providerAgreementAcceptedAt: {seconds: 1735689600},
      providerAgreementVersion: "historic-1", providerAgreementSnapshot: storedSnapshot,
    })}]});
    const response = await GET(new Request("http://localhost/api/provider/agreement/pdf?copy=accepted"));
    expect(response.status).toBe(404);
    expect(downloads.published).not.toHaveBeenCalled();
    expect(database.write).not.toHaveBeenCalled();
  });
});

describe("owned provider agreement records", () => {
  it.each(["approved", "suspended", "pending", "rejected"])("reads %s records without writes or approval gating", async (verificationStatus) => {
    const provider = {ownerId: "owner-one", businessName: "Business", verificationStatus};
    const verification = {
      ownerId: "owner-one", providerId: "provider-one", providerAgreementAcceptedAt: {seconds: 1735689600},
      providerAgreementVersion: "historical-v1",
    };
    const before = JSON.stringify({provider, verification});
    database.providerGet.mockResolvedValue({data: () => provider});
    database.verificationGet.mockResolvedValue({size: 1, docs: [{data: () => verification}]});
    const result = await loadProviderAgreementAcceptanceSummary({uid: "owner-one", providerId: "provider-one"});
    expect(result).toMatchObject({accepted: true, acceptedVersion: "historical-v1", snapshot: null});
    expect(result?.acceptedAtLabel).toContain("2025");
    expect(JSON.stringify({provider, verification})).toBe(before);
    expect(database.write).not.toHaveBeenCalled();
  });

  it("rejects records owned by another provider", async () => {
    database.providerGet.mockResolvedValue({data: () => ({ownerId: "other-owner"})});
    expect(await loadProviderAgreementAcceptanceSummary({uid: "owner-one", providerId: "provider-one"})).toBeNull();
    expect(database.verificationGet).not.toHaveBeenCalled();
    expect(database.write).not.toHaveBeenCalled();
  });

  it("preserves a stored accepted snapshot even when legacy acceptance metadata is missing", async () => {
    const snapshot = {
      code: "provider_agreement", name: "FEASTA Provider Agreement", version: "legacy-1",
      effectiveDate: "2025-01-01", sections: [{title: "Legacy terms", paragraphs: ["Stored text."]}],
    };
    database.providerGet.mockResolvedValue({data: () => ({ownerId: "owner-one", providerId: "provider-one", providerAgreementSnapshot: snapshot})});
    database.verificationGet.mockResolvedValue({size: 0, docs: []});
    expect(await loadProviderAgreementAcceptanceSummary({uid: "owner-one", providerId: "provider-one"})).toMatchObject({
      accepted: true, acceptedVersion: "legacy-1", acceptedAtLabel: null, snapshot,
    });
    expect(database.write).not.toHaveBeenCalled();
  });
});

describe("accepted snapshot recovery safeguards", () => {
  const snapshot = {code: "provider_agreement", name: "Provider agreement", version: "2026-09-23", effectiveDate: "2026-09-23", sections: [{title: "Accepted terms", paragraphs: ["Authentic stored text."]}]};
  const acceptance = {providerAgreementAccepted: true, providerAgreementVersion: snapshot.version, providerAgreementCode: snapshot.code, providerAgreementAcceptedAt: {seconds: 1790553600}};
  const read = async (provider: Record<string, unknown>, records: Record<string, unknown>[]) => {
    database.providerGet.mockResolvedValue({data: () => ({ownerId: "owner-one", ...provider})});
    database.verificationGet.mockResolvedValue({size: records.length, docs: records.map((record) => ({data: () => ({ownerId: "owner-one", providerId: "provider-one", ...record})}))});
    return loadProviderAgreementAcceptanceSummary({uid: "owner-one", providerId: "provider-one"});
  };
  it("recovers the exact snapshot from a matching owned provider acceptance", async () => {
    const result = await read({...acceptance, providerAgreementSnapshot: snapshot}, [acceptance]);
    expect(result?.snapshot).toMatchObject(snapshot);
    expect(result?.acceptedVersion).toBe(snapshot.version);
    expect(database.write).not.toHaveBeenCalled();
  });
  it.each([
    {providerAgreementVersion: "different"},
    {providerAgreementCode: "different_document"},
    {providerAgreementAcceptedAt: {seconds: 1}},
    {providerAgreementAccepted: false},
  ])("blocks contradictory provider evidence: %o", async (conflict) => {
    expect((await read({...acceptance, ...conflict, providerAgreementSnapshot: snapshot}, [acceptance]))?.snapshot).toBeNull();
  });
  it("checks every verification record for conflicting acceptance", async () => {
    expect((await read({}, [{...acceptance, providerAgreementSnapshot: snapshot}, {...acceptance, providerAgreementVersion: "other"}]))?.snapshot).toBeNull();
  });
  it("rejects a verification ownership mismatch", async () => {
    expect(await read({}, [{...acceptance, ownerId: "someone-else", providerAgreementSnapshot: snapshot}])).toBeNull();
  });
  it.each([{...snapshot, sections: []}, {...snapshot, code: "wrong_code"}, {...snapshot, version: "wrong-version"}])("rejects malformed or mismatched snapshots", async (stored) => {
    expect((await read({}, [{...acceptance, providerAgreementSnapshot: stored}]))?.snapshot).toBeNull();
  });
  it("does not infer acceptance when no acceptance is recorded", async () => {
    expect(await read({}, [])).toMatchObject({accepted: false, snapshot: null, acceptedVersion: ""});
  });
  it("does not let incomplete metadata hide independently validated provider evidence", async () => {
    expect((await read({...acceptance, providerAgreementSnapshot: snapshot}, [{providerAgreementVersion: snapshot.version, providerAgreementAcceptedAt: acceptance.providerAgreementAcceptedAt}]))?.snapshot).toMatchObject(snapshot);
  });
  it.each(["provider", "verification"])("selects valid %s evidence independently of record order", async (location) => {
    const valid = {...acceptance, providerAgreementSnapshot: snapshot};
    const weak = {providerAgreementVersion: snapshot.version};
    const records = location === "provider" ? [weak, {}] : [weak, valid, {}];
    const profile = location === "provider" ? valid : {};
    const forward = await read(profile, records);
    const reverse = await read(profile, [...records].reverse());
    expect(forward).toEqual(reverse);
    expect(forward).toMatchObject({accepted: true, acceptedVersion: snapshot.version, snapshot});
    const response = await GET(new Request("http://localhost/api/provider/agreement/pdf?copy=accepted"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain(snapshot.version);
    expect(downloads.published).not.toHaveBeenCalled();
  });
  it("checks conflicting weak evidence regardless of order", async () => {
    const records = [{providerAgreementVersion: "other"}, {...acceptance, providerAgreementSnapshot: snapshot}];
    const forward = await read({}, records);
    expect(forward).toEqual(await read({}, [...records].reverse()));
    expect(forward?.snapshot).toBeNull();
  });
  it.each([
    {providerAgreementAcceptedAt: "invalid"},
    {providerAgreementAcceptedAt: {seconds: 1, nanoseconds: -1}},
    {providerAgreementAccepted: "true"},
    {providerAgreementVersion: 123},
  ])("fails closed on malformed acceptance evidence: %o", async (malformed) => {
    expect((await read({}, [malformed, {...acceptance, providerAgreementSnapshot: snapshot}]))?.snapshot).toBeNull();
    expect((await GET(new Request("http://localhost/api/provider/agreement/pdf?copy=accepted"))).status).toBe(404);
    expect(downloads.published).not.toHaveBeenCalled();
  });
  it("bounds verification reads and fails closed on the overflow sentinel", async () => {
    const valid = {...acceptance, providerAgreementSnapshot: snapshot};
    expect((await read({}, Array.from({length: 10}, () => valid)))?.snapshot).toMatchObject(snapshot);
    expect(database.limit).toHaveBeenCalledWith(11);
    expect(await read(valid, Array.from({length: 11}, () => valid))).toBeNull();
    expect((await GET(new Request("http://localhost/api/provider/agreement/pdf?copy=accepted"))).status).toBe(404);
    expect(downloads.published).not.toHaveBeenCalled();
    expect(database.write).not.toHaveBeenCalled();
  });
  it("rejects mismatched provider identity and verification provider identity", async () => {
    expect(await read({providerId: "other"}, [])).toBeNull();
    expect(await read({}, [{...acceptance, providerId: "other"}])).toBeNull();
  });

});
