import {describe, expect, it} from "vitest";
import {validateAdminCancellationRolloutUpdate as validate} from "@/lib/admin/settings/admin-settings-validation";

const input = {customerCancellationMode: "off", automaticPolicyRefundApprovalMode: "off", internalReason: "Administrative rollout review."};
describe("Cancellation rollout validation", () => {
  it.each([["off", "off"], ["review_only", "off"], ["enabled", "off"], ["enabled", "enabled"]])("accepts %s/%s", (customerCancellationMode, automaticPolicyRefundApprovalMode) => {
    const value = {...input, customerCancellationMode, automaticPolicyRefundApprovalMode};
    expect(validate(value)).toEqual(value);
  });
  it.each([
    {customerCancellationMode: "ON"}, {automaticPolicyRefundApprovalMode: "review_only"},
    {automaticPolicyRefundApprovalMode: "enabled"},
    {customerCancellationMode: "review_only", automaticPolicyRefundApprovalMode: "enabled"},
    {isPublic: true}, {updatedBy: "forged"}, {internalReason: undefined},
    {internalReason: "short"}, {internalReason: "          "}, {internalReason: "x".repeat(1001)},
  ])("rejects unsafe input %j", (override) => expect(() => validate({...input, ...override})).toThrow());
  it("trims the reason and accepts the boundaries", () => {
    for (const length of [10, 1000]) expect(validate({...input, internalReason: `  ${"x".repeat(length)}  `}).internalReason).toHaveLength(length);
  });
  it.each([null, [], "enabled"])("rejects non-object %j", (value) => expect(() => validate(value)).toThrow());
});
