import {expect, it, vi} from "vitest";
import {exportDedicatedReport} from "@/lib/admin/reports/dedicated-report-export";
import {PDFDocument} from "pdf-lib";

it("exports a multi-page PDF with the administrator as author", async () => {
  let exported: Blob | undefined;
  vi.stubGlobal("URL", {createObjectURL: (blob: Blob) => {exported = blob; return "blob:test";}, revokeObjectURL: vi.fn()});
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  try {
    await exportDedicatedReport({
      title: "Vendor List", generatedAt: "2026-11-18T00:00:00Z", generatedBy: "Test Admin",
      period: "Current directory", headers: ["Name", "Email", "Status"], note: "Current accounts",
      rows: Array.from({length: 65}, (_, index) => ["Vendor " + index, "vendor@example.test", "active"]),
    }, "pdf", "Test browser");
    const bytes = await new Promise<ArrayBuffer>((resolve,reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = reject;
      reader.readAsArrayBuffer(exported!);
    });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getAuthor()).toBe("Test Admin");
    expect(pdf.getPageCount()).toBeGreaterThan(1);
    expect(click).toHaveBeenCalledOnce();
  } finally {
    click.mockRestore();
    vi.unstubAllGlobals();
  }
});
