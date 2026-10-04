import {beforeEach, describe, expect, it, vi} from "vitest";
const mocks = vi.hoisted(() => ({auth: vi.fn(), platform: vi.fn(), rollout: vi.fn(), update: vi.fn()}));
vi.mock("@/lib/auth/session", () => ({requireAdmin: mocks.auth}));
vi.mock("@/lib/admin/settings/admin-settings-service", () => ({getAdminPlatformSettings: mocks.platform}));
vi.mock("@/lib/admin/settings/admin-cancellation-rollout-service", () => ({getAdminCancellationRollout: mocks.rollout, updateAdminCancellationRollout: mocks.update}));
vi.mock("@/components/admin/settings/admin-settings-client", () => ({AdminSettingsClient: () => null}));
vi.mock("@/components/admin/settings/admin-financial-policy-client", () => ({AdminFinancialPolicyClient: () => null}));
vi.mock("@/components/admin/settings/admin-cancellation-rollout-client", () => ({AdminCancellationRolloutClient: () => null}));
import Page from "@/app/admin/settings/page";
import {updateAdminCancellationRolloutAction} from "@/app/admin/settings/actions";
beforeEach(() => vi.clearAllMocks());
describe("Cancellation rollout page and action", () => {
  it("loads both settings and passes them to separate clients", async () => {
    const platform = {platformName: "FEASTA"};
    const rollout = {customerCancellationMode: "off"};
    mocks.platform.mockResolvedValue(platform);
    mocks.rollout.mockResolvedValue(rollout);
    const element = await Page();
    expect(mocks.auth).toHaveBeenCalledOnce();
    expect(mocks.platform).toHaveBeenCalledOnce();
    expect(mocks.rollout).toHaveBeenCalledOnce();
    expect(element.props.children.map((child: {props: {initialSettings: unknown}}) => child.props.initialSettings)).toEqual([platform, platform, rollout]);
  });
  it("authorizes the typed action before passing input to the trusted service", async () => {
    const input = {customerCancellationMode: "off" as const, automaticPolicyRefundApprovalMode: "off" as const, internalReason: "Review rollout configuration."};
    mocks.update.mockResolvedValue({changed: false});
    expect(await updateAdminCancellationRolloutAction(input)).toEqual({changed: false});
    expect(mocks.auth).toHaveBeenCalledOnce();
    expect(mocks.update).toHaveBeenCalledWith(input);
    mocks.auth.mockRejectedValueOnce(new Error("Forbidden"));
    await expect(updateAdminCancellationRolloutAction(input)).rejects.toThrow("Forbidden");
    expect(mocks.update).toHaveBeenCalledOnce();
  });
});
