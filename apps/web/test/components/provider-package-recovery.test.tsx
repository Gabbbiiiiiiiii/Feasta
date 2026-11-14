import {fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import {beforeEach, expect, it, vi} from "vitest";
import {ProviderPackageRecovery} from "@/app/provider/packages/provider-package-recovery";
const api = vi.hoisted(() => ({preview:vi.fn(), confirm:vi.fn(), retry:vi.fn(),
  pending:vi.fn(() => false)}));
vi.mock("@/lib/provider/fixed-package-recovery-client", () => ({
  previewFixedRecovery:api.preview, confirmFixedRecovery:api.confirm,
  retryFixedRecovery:api.retry, hasPendingFixedRecovery:api.pending,
  fixedRecoveryError:() => "Refresh and review the changed draft.", recoveryInventory:(v:unknown) => v,
}));
const preview = {packageId:"original", sourceFingerprint:"a".repeat(64),
  proposalFingerprint:"b".repeat(64), eligible:true, blockers:[],
  original:{name:"Saved catering", price:1850, minimumGuests:8, maximumGuests:10},
  proposed:{name:"Saved catering", price:1850, minimumGuests:8, maximumGuests:10, revision:1}};
beforeEach(() => {
  vi.clearAllMocks(); api.preview.mockResolvedValue(preview);
  api.confirm.mockResolvedValue({packageId:"original",status:"draft"});
  api.pending.mockReturnValue(false);
});
it("shows the original and proposal without mutation, then requires explicit provider confirmation", async () => {
  const saved=vi.fn();render(<ProviderPackageRecovery packageId="original" onRecovered={saved}/>);
  fireEvent.click(screen.getByRole("button",{name:"Review recovery"}));
  expect(await screen.findByRole("region",{name:"Original saved draft"})).toHaveTextContent("1850");
  expect(screen.getByRole("region",{name:"Proposed V2 draft"})).toHaveTextContent('"revision": 1');
  expect(api.confirm).not.toHaveBeenCalled();
  expect(screen.getByRole("button",{name:"Confirm recovery"})).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button",{name:"Confirm recovery"}));
  await waitFor(()=>expect(saved).toHaveBeenCalledTimes(1));
  expect(api.confirm).toHaveBeenCalledWith(preview);
  expect(screen.getByRole("status")).toHaveTextContent("private Draft");
  expect(api.preview).toHaveBeenCalledWith("original");
});
it("reports every blocker and prevents confirmation for unsupported source data", async () => {
  api.preview.mockResolvedValue({...preview,eligible:false,proposed:null,
    blockers:["customField: unsupported field","serviceOptions.drop_off.custom: unsupported field"]});
  render(<ProviderPackageRecovery packageId="original"/>);
  fireEvent.click(screen.getByRole("button",{name:"Review recovery"}));
  const alert=await screen.findByRole("alert");
  expect(within(alert).getByText("customField: unsupported field")).toBeVisible();
  expect(alert).toHaveTextContent("serviceOptions.drop_off.custom");
  expect(screen.getByRole("button",{name:"Confirm recovery"})).toBeDisabled();
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();expect(api.confirm).not.toHaveBeenCalled();
});
it("invalidates the reviewed state after failure and requires a fresh preview", async () => {
  api.confirm.mockRejectedValueOnce(new Error("stale"));
  render(<ProviderPackageRecovery packageId="original"/>);
  fireEvent.click(screen.getByRole("button",{name:"Review recovery"}));
  fireEvent.click(await screen.findByRole("checkbox"));
  fireEvent.click(screen.getByRole("button",{name:"Confirm recovery"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("changed draft");
  expect(screen.getByRole("button",{name:"Confirm recovery"})).toBeDisabled();
  fireEvent.click(screen.getByRole("button",{name:"Refresh preview"}));
  expect(await screen.findByRole("checkbox")).not.toBeChecked();
});
it("retries the immutable pending request without requesting a new confirmation", async () => {
  api.pending.mockReturnValue(true);api.retry.mockResolvedValue({status:"draft"});
  render(<ProviderPackageRecovery packageId="original"/>);
  fireEvent.click(screen.getByRole("button",{name:"Review recovery"}));
  fireEvent.click(await screen.findByRole("button",{name:"Retry unconfirmed recovery"}));
  await waitFor(()=>expect(api.retry).toHaveBeenCalledWith("original"));
  expect(api.confirm).not.toHaveBeenCalled();
});
