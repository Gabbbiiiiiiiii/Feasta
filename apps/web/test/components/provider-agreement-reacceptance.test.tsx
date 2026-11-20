import {render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, expect, it, vi} from "vitest";
import {ProviderAgreementReacceptance} from "@/components/provider/provider-agreement-reacceptance";
const client = vi.hoisted(() => ({reviewCurrentProviderAgreement: vi.fn(), acceptCurrentProviderAgreement: vi.fn()}));
vi.mock("@/lib/provider/provider-agreement-reacceptance-client", () => client);
const review = {digest: "trusted-digest", agreement: {
  code: "provider_agreement", name: "Provider Agreement", version: "1.7", effectiveDate: "2026-10-01",
  sections: [{title: "Current terms", paragraphs: ["Full trusted published paragraph.", "Final agreement paragraph."]}],
}};
beforeEach(() => {vi.clearAllMocks(); client.reviewCurrentProviderAgreement.mockResolvedValue(review);});
it("shows full current version and effective date and requires explicit confirmation", async () => {
  client.acceptCurrentProviderAgreement.mockRejectedValue(new Error("offline"));
  render(<ProviderAgreementReacceptance />);
  await userEvent.click(screen.getByRole("button", {name: "Review current agreement"}));
  expect(await screen.findByText("Full trusted published paragraph.")).toBeVisible();
  expect(screen.getByText("Final agreement paragraph.")).toBeVisible();
  expect(screen.getByText(/Version 1.7 · Effective 2026-10-01/)).toBeVisible();
  const accept = screen.getByRole("button", {name: "Accept current agreement"});
  expect(accept).toBeDisabled();
  await userEvent.click(screen.getByRole("checkbox"));
  await userEvent.click(accept);
  await waitFor(() => expect(client.acceptCurrentProviderAgreement).toHaveBeenCalledWith(review));
  expect(await screen.findByRole("alert")).toHaveTextContent("previous acceptance is preserved");
  expect(accept).toBeDisabled();
});
it.each(["Cancel", "Escape", "Close"])("%s records no acceptance and resets confirmation", async (action) => {
  render(<ProviderAgreementReacceptance />);
  await userEvent.click(screen.getByRole("button", {name: "Review current agreement"}));
  await screen.findByText("Full trusted published paragraph.");
  await userEvent.click(screen.getByRole("checkbox"));
  if (action === "Escape") await userEvent.keyboard("{Escape}");
  else await userEvent.click(screen.getByRole("button", {name: action === "Close" ? "Close dialog" : action}));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(client.acceptCurrentProviderAgreement).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", {name: "Review current agreement"}));
  await screen.findByText("Full trusted published paragraph.");
  expect(screen.getByRole("checkbox")).not.toBeChecked();
});
it("unavailable publication cannot be accepted", async () => {
  client.reviewCurrentProviderAgreement.mockRejectedValue(new Error("missing"));
  render(<ProviderAgreementReacceptance />);
  await userEvent.click(screen.getByRole("button", {name: "Review current agreement"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("could not be loaded");
  expect(screen.getByRole("button", {name: "Accept current agreement"})).toBeDisabled();
  expect(client.acceptCurrentProviderAgreement).not.toHaveBeenCalled();
});
