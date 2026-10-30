import {render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, describe, expect, it, vi} from "vitest";
import {OccasionRequestDialog} from "@/components/provider/occasion-request-dialog";
import {validateOccasionRequest, occasionRequestError} from "@/lib/provider/provider-occasion-suggestions";
const mocks = vi.hoisted(() => ({submit: vi.fn(), list: vi.fn(), available: vi.fn()}));
vi.mock("@/lib/provider/provider-occasion-suggestions", async (original) => ({...await original<object>(), occasionRequestsAvailable: mocks.available, submitOccasionRequest: mocks.submit, listOccasionRequests: mocks.list}));
const item = {suggestionId: "one", name: "Graduation", status: "approved", createdAt: "2026-10-25T00:00:00Z", reviewReason: "Approved for future activation"};
beforeEach(() => {mocks.available.mockReset().mockReturnValue(true);mocks.submit.mockReset(); mocks.list.mockReset(); mocks.list.mockResolvedValue({items: [], nextCursor: null});});
async function open() {const user = userEvent.setup(); render(<OccasionRequestDialog />); await user.click(screen.getByRole("button", {name: "+ Add Occasion"})); return user;}
async function fill(user: ReturnType<typeof userEvent.setup>) {await user.type(screen.getByLabelText("Occasion Name *"), "Graduation");}
describe("occasion requests", () => {
  it("opens, focuses input, closes with Escape, restores trigger focus and clears feedback", async () => {
    const user = await open(); await waitFor(() => expect(screen.getByLabelText("Occasion Name *")).toHaveFocus());
    await user.keyboard("{Escape}"); await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("button", {name: "+ Add Occasion"})).toHaveFocus();
    await user.click(screen.getByRole("button", {name: "+ Add Occasion"})); await user.click(screen.getByRole("button", {name: "Cancel"})); expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it.each(["", "a", "x".repeat(81), "Bad\nName", "Bad\u200bName"])("rejects invalid name %j", (name) => {expect(validateOccasionRequest(name, "").name).toBeTruthy();});
  it("normalizes names and validates optional reason against server rules", () => {
    expect(validateOccasionRequest("  Ｇraduation   Day ", "").value.name).toBe("Graduation Day");
    expect(validateOccasionRequest("Party", "x".repeat(500)).reason).toBeNull();
    expect(validateOccasionRequest("Party", "x".repeat(501)).reason).toBeTruthy();
    expect(validateOccasionRequest("Party", "line\nline").reason).toBeTruthy();
  });
  it("associates validation and prevents invalid submission", async () => {const user = await open(); await user.click(screen.getByRole("button", {name: "Submit Request"})); expect(screen.getByLabelText("Occasion Name *")).toHaveAttribute("aria-invalid", "true"); expect(mocks.submit).not.toHaveBeenCalled();});
  it.each(["created", "own_duplicate", "canonical_match", "idempotent_replay"])("handles confirmed %s without activating a selection", async (outcome) => {
    const result = {outcome: "created", suggestion: {...item, status: "pending"}};
    mocks.submit.mockResolvedValue(outcome === "idempotent_replay" ? {outcome, originalOutcome: "created", result} : outcome === "canonical_match" ? {outcome, match: {label: "Graduation"}} : {outcome, suggestion: item});
    const user = await open(); await fill(user); await user.click(screen.getByRole("button", {name: "Submit Request"}));
    await waitFor(() => expect(screen.getByText(outcome === "own_duplicate" ? /You already requested/ : outcome === "canonical_match" ? /already exists in the catalog/ : /Request submitted/)).toBeInTheDocument());
    expect(screen.queryByRole("option", {name: "Graduation"})).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", {name: "Cancel"})); await user.click(screen.getByRole("button", {name: "+ Add Occasion"})); expect(screen.queryByText(/Request submitted/)).not.toBeInTheDocument();
  });
  it("retries with the same identity and blocks double submission", async () => {
    mocks.submit.mockRejectedValueOnce({code: "functions/unavailable"}).mockResolvedValueOnce({outcome: "created", suggestion: item});
    const user = await open(); await fill(user); await user.click(screen.getByRole("button", {name: "Submit Request"})); await screen.findByText(/No submission is confirmed/);
    await user.click(screen.getByRole("button", {name: "Submit Request"})); await screen.findByText(/Request submitted/);
    expect(mocks.submit.mock.calls[0][0].idempotencyKey).toBe(mocks.submit.mock.calls[1][0].idempotencyKey);
  });
  it("loads history with a cursor and review remarks", async () => {
    mocks.list.mockResolvedValueOnce({items: [item], nextCursor: "signed"}).mockResolvedValueOnce({items: [{...item, suggestionId: "two", name: "Reunion"}], nextCursor: null});
    const user = await open(); await screen.findByText("Approved for future activation", {exact: false});
    await user.click(screen.getByRole("button", {name: "Load more requests"})); await screen.findByText("Reunion");
    expect(mocks.list).toHaveBeenLastCalledWith({pageSize: 10, cursor: "signed"}); expect(screen.getByText("Graduation")).toBeInTheDocument();
  });
  it.each([{details: {reason: "FEATURE_DISABLED"}}, {details: {reason: "CONFIG_UNAVAILABLE"}}, {code: "functions/permission-denied"}, {code: "functions/unavailable"}])("reports service failure without success %j", async (error) => {
    mocks.submit.mockRejectedValue(error); const user = await open(); await fill(user); await user.click(screen.getByRole("button", {name: "Submit Request"}));
    await screen.findByText(occasionRequestError(error)); expect(screen.queryByText(/Request submitted/)).not.toBeInTheDocument();
  });
  it("shows history errors and allows refresh", async () => {mocks.list.mockRejectedValueOnce({code: "functions/unavailable"}); const user = await open(); await screen.findByRole("alert"); await user.click(screen.getByRole("button", {name: "Refresh requests"})); await screen.findByText("No occasion requests yet.");});
});

it("prevents additional calls while a submission is pending", async () => {
  let finish!: (value: unknown) => void;
  mocks.submit.mockImplementation(() => new Promise((resolve) => {finish = resolve;}));
  const user = await open(); await fill(user);
  await user.click(screen.getByRole("button", {name: "Submit Request"}));
  expect(screen.getByRole("button", {name: "Submitting…"})).toBeDisabled();
  await user.click(screen.getByRole("button", {name: "Submitting…"}));
  expect(mocks.submit).toHaveBeenCalledTimes(1);
  finish({outcome: "created", suggestion: item}); await screen.findByText(/Request submitted/);
});
it("blocks submission and history while browser integration is unverified", async () => {
  mocks.available.mockReturnValue(false);
  await open();
  expect(screen.getByRole("status")).toHaveTextContent("unavailable until backend integration is verified");
  expect(screen.queryByRole("button", {name: "Submit Request"})).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Occasion Name *")).not.toBeInTheDocument();
  expect(mocks.list).not.toHaveBeenCalled();
  expect(mocks.submit).not.toHaveBeenCalled();
});

it("keeps the real browser transport blocked before Firebase initialization", async () => {
  const actual = await vi.importActual<typeof import("@/lib/provider/provider-occasion-suggestions")>("@/lib/provider/provider-occasion-suggestions");
  expect(actual.occasionRequestsAvailable()).toBe(false);
  await expect(actual.submitOccasionRequest({name: "Graduation", idempotencyKey: "request-one"})).rejects.toMatchObject({details: {reason: "BROWSER_INTEGRATION_UNVERIFIED"}});
  await expect(actual.listOccasionRequests({pageSize: 10})).rejects.toMatchObject({details: {reason: "BROWSER_INTEGRATION_UNVERIFIED"}});
});
