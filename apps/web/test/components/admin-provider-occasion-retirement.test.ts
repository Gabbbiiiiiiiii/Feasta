import {expect, it, vi} from "vitest";
import {roleNavigation} from "@/components/layout/navigation";
vi.mock("server-only", () => ({}));
const auth = vi.hoisted(() => ({requireAdmin: vi.fn()}));
vi.mock("@/lib/auth/session", () => auth);
vi.mock("next/navigation", () => ({redirect: (path: string) => {throw new Error("REDIRECT:" + path);}}));
import RetiredReview from "@/app/admin/provider-occasions/page";
it("removes occasion review while retaining provider verification and catalog navigation", () => {
  const links = JSON.stringify(roleNavigation.admin);
  expect(links).not.toContain("/admin/provider-occasions");
  expect(links).toContain("/admin/providers");
  expect(links).toContain("/admin/file-maintenance");
});
it("authenticates before redirecting the retired review", async () => {
  auth.requireAdmin.mockResolvedValue(undefined);
  await expect(RetiredReview()).rejects.toThrow("REDIRECT:/admin/providers");
  expect(auth.requireAdmin).toHaveBeenCalled();
  auth.requireAdmin.mockRejectedValueOnce(new Error("ADMIN_REQUIRED"));
  await expect(RetiredReview()).rejects.toThrow("ADMIN_REQUIRED");
});
