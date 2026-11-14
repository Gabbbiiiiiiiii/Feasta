vi.mock("firebase/auth", () => ({onAuthStateChanged: () => () => {}}));
vi.mock("@/app/customer/packages/event-list-labels", () => ({loadEventListPackageLabels: vi.fn(async () => null)}));
import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, expect, it, vi} from "vitest";
import {bookingAgreementFixture} from "./booking-agreement-fixture";

const mocks = vi.hoisted(() => ({submit: vi.fn(), reconcile: vi.fn(), replace: vi.fn(), policies: vi.fn()}));
vi.mock("next/navigation", () => ({useRouter: () => ({replace: mocks.replace})}));
vi.mock("@/lib/firebase/client", () => ({auth: {currentUser: {uid: "customer-a"}, authStateReady: async () => {}}, functions: {}, initializeBrowserAppCheck: vi.fn()}));
vi.mock("@/app/customer/providers/menu-item-actions", () => ({loadCustomerMenuItemForEditAction: vi.fn()}));
vi.mock("@/lib/customer/bookings/customer-booking-submission-client", () => ({submitCustomerBookingRequest: mocks.submit,
  reconcileCustomerBookingSubmission: mocks.reconcile, bookingSubmissionRequiresRefundPolicyRefresh: () => false}));
vi.mock("@/lib/customer/bookings/customer-refund-policy-client", async original => ({
  ...await original<typeof import("@/lib/customer/bookings/customer-refund-policy-client")>(),
  getCustomerBookingRefundPolicyDisclosures: mocks.policies,
}));
vi.mock("@/lib/customer/bookings/customer-booking-agreement", () => ({getCustomerBookingPaymentAgreements: async () => [bookingAgreementFixture("provider-one")]}));
import {CustomerEventListReview} from "@/components/customer/event-list/customer-event-list-review";
import {addCustomerEventListItem, clearCustomerEventList, readCustomerEventList, writeCustomerEventListSchedule} from "@/lib/customer/event-list/customer-event-list";

beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear();
  vi.setSystemTime(new Date("2026-09-01T02:00:00Z"));
  mocks.policies.mockResolvedValue({acknowledgementsRequired: true, policies: [{providerId: "provider-one", providerName: "Maria's Catering", effectivePolicyKey: "policy-v4",
    sourceKind: "provider_default", rules: [{stage: "preparation_not_started", refundBasisPoints: 10000}], terms: null}]});
  mocks.submit.mockResolvedValue({bookingId: "booking_new", mainEventId: "booking_new", providerRequestIds: ["request_new"], created: true});
  addCustomerEventListItem({type: "custom_menu", key: "ignored", providerId: "provider-one", providerName: "Maria's Catering",
    menuItemId: "chicken", menuItemName: "Chicken", servingOptionId: "tray", servingOptionName: "Tray", servingDescription: "Serves 10",
    servingMinimumGuests: 10, servingMaximumGuests: 20, price: 1800, imageUrl: "https://images.example.test/chicken.webp", providerHref: "/customer/providers/provider-one"});
  writeCustomerEventListSchedule({eventType: "wedding", eventDate: "2026-09-20", eventTime: "18:00", eventLocation: "Ormoc City", eventAddress: "Ballroom, Ormoc City"});
});

it.each(["confirmed_created", "confirmed_rejected", "unresolved"])("recovers Event List %s without automatic submission or clearing selections", async outcome => {
  mocks.reconcile.mockResolvedValue({outcome, booking: {bookingId: "booking_existing", created: false}});
  render(<CustomerEventListReview />);
  fireEvent.click(screen.getByRole("button", {name: "Check Previous Request"}));
  await waitFor(() => expect(mocks.reconcile).toHaveBeenCalledWith("customer-a"));
  if (outcome === "confirmed_created") await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/customer/bookings?submitted=booking_existing"));
  else expect(await screen.findByText(outcome === "confirmed_rejected" ? /Previous request was confirmed rejected/ : /Previous request is unresolved/)).toBeVisible();
  expect(mocks.submit).not.toHaveBeenCalled();
  expect(readCustomerEventList()).toHaveLength(1);
});

it("keeps recovery available after all Event List selections are removed", async () => {
  clearCustomerEventList();
  mocks.reconcile.mockResolvedValue({outcome: "unresolved"});
  render(<CustomerEventListReview />);
  fireEvent.click(screen.getByRole("button", {name: "Check Previous Request"}));
  expect(await screen.findByText(/Previous request is unresolved/)).toBeVisible();
  expect(mocks.submit).not.toHaveBeenCalled();
});

it("submits the existing custom-menu payload only after both acknowledgments", async () => {
  const user = userEvent.setup(); render(<CustomerEventListReview />);
  const submit = await screen.findByRole("button", {name: "Submit Booking"});
  expect(submit).toBeDisabled();
  await waitFor(() => expect(screen.getAllByRole("checkbox", {name: /I (have )?reviewed/})).toHaveLength(2));
  const acknowledgments = screen.getAllByRole("checkbox", {name: /I (have )?reviewed/});
  expect(acknowledgments).toHaveLength(2);
  for (const checkbox of acknowledgments) await user.click(checkbox);
  await user.click(submit);
  await waitFor(() => expect(mocks.submit).toHaveBeenCalledOnce());
  expect(mocks.submit.mock.calls[0][0]).toMatchObject({cateringSelectionType: "custom_menu", providerId: "provider-one",
    menuSelections: [{menuItemId: "chicken", servingOptionId: "tray"}], addonIds: [],
    policyAcknowledgements: [{providerId: "provider-one", effectivePolicyKey: "policy-v4"}],
    agreementAcknowledgements: [{providerId: "provider-one", agreementKey: "a".repeat(64)}]});
  expect(mocks.submit.mock.calls[0][1]).toEqual({customerId: "customer-a", freshAttempt: false});
  expect(readCustomerEventList()).toHaveLength(0);
});

it("requires renewed policy and agreement acknowledgments after confirmed rejection", async () => {
  const user = userEvent.setup(); render(<CustomerEventListReview />);
  await waitFor(() => expect(screen.getAllByRole("checkbox", {name: /I (have )?reviewed/})).toHaveLength(2));
  for (const checkbox of await screen.findAllByRole("checkbox", {name: /I (have )?reviewed/})) await user.click(checkbox);
  mocks.reconcile.mockResolvedValue({outcome: "confirmed_rejected"});
  await user.click(screen.getByRole("button", {name: "Check Previous Request"}));
  await screen.findByText(/Previous request was confirmed rejected/);
  const submit = screen.getByRole("button", {name: "Submit Booking"});
  expect(submit).toBeDisabled();
  expect(mocks.submit).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getAllByRole("checkbox", {name: /I (have )?reviewed/})).toHaveLength(2));
  for (const checkbox of await screen.findAllByRole("checkbox", {name: /I (have )?reviewed/})) {
    expect(checkbox).not.toBeChecked(); await user.click(checkbox);
  }
  await user.click(submit);
  await waitFor(() => expect(mocks.submit).toHaveBeenCalledOnce());
  expect(mocks.submit.mock.calls[0][1]).toEqual({customerId: "customer-a", freshAttempt: true});
});
