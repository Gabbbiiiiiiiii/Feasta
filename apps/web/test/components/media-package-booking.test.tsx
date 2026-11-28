import {fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import {expect, it, vi} from "vitest";

import {bookingAgreementFixture} from "./booking-agreement-fixture";
import {agreementTime} from "@/components/customer/bookings/booking-payment-agreement-review";
import {MediaPackageBooking} from "@/components/customer/providers/media-package-booking";

vi.mock("@/lib/customer/bookings/customer-provider-availability-client", () => ({
  getCustomerProviderCalendarAvailability: async (_providerId: string, month: string) => ({month, dates: []}),
}));

vi.mock("@/components/customer/bookings/customer-event-address-map", () => ({
  CustomerEventAddressMap: ({onConfirm}: {onConfirm: (location: unknown) => void}) => (
    <button type="button" onClick={() => onConfirm({
      address: "Barangay Linao, Ormoc City",
      city: "Ormoc City",
      province: "Leyte",
      latitude: 11,
      longitude: 124,
    })}>Confirm venue</button>
  ),
}));

it("uses the catering calendar and fills the location and address from the map", async () => {
  render(<MediaPackageBooking providerId="provider-one" serviceId="photo-package" serviceName="Wedding Photography"
    revision={1} occasions={[{id: "wedding", label: "Wedding"}]} defaultLocation="Ormoc City, Eastern Visayas"
    guestCapacity="20–25 guests" providerName="Example Studio" authenticated returnTo="/customer/packages"
    requestClassName="" />);

  fireEvent.click(screen.getByRole("button", {name: "Customize & request"}));
  expect(screen.getByRole("heading", {name: "Event details"})).toBeVisible();
  expect(screen.getByLabelText("Event type")).toHaveValue("wedding");
  expect(screen.queryByLabelText(/^Municipality$/i)).not.toBeInTheDocument();
  expect(screen.getByLabelText("Event location")).toHaveValue("Ormoc City, Eastern Visayas");

  const calendarTrigger = screen.getByRole("button", {name: "Event date"});
  fireEvent.click(calendarTrigger);
  const booking = screen.getByRole("dialog", {name: "Wedding Photography"});
  const calendar = within(booking).getByRole("dialog", {name: "Choose event date"});
  const [availableDate] = await within(calendar).findAllByRole("button", {name: /, Available$/});
  fireEvent.click(availableDate);
  expect(within(booking).queryByRole("dialog", {name: "Choose event date"})).not.toBeInTheDocument();
  expect(calendarTrigger).toHaveAccessibleName(/^Event date: /);

  fireEvent.click(screen.getByRole("button", {name: "Choose on map"}));
  fireEvent.click(screen.getByRole("button", {name: "Confirm venue"}));
  expect(screen.getByLabelText("Event location")).toHaveValue("Ormoc City, Leyte");
  expect(screen.getByLabelText("Complete event address")).toHaveValue("Barangay Linao, Ormoc City");
  expect(screen.getByRole("button", {name: "Choose on map"})).toHaveAttribute("aria-expanded", "false");
});

const call = vi.hoisted(() => vi.fn());
vi.mock("firebase/functions", () => ({
  httpsCallable: (_functions: unknown, name: string) => (input: unknown) => call(name, input),
}));
vi.mock("@/lib/firebase/client", () => ({
  auth: {authStateReady: async () => undefined, currentUser: {}},
  functions: {},
  initializeBrowserAppCheck: vi.fn(),
}));

it.each([true, false])("reviews canonical media terms and gates submission (refund acknowledgement required: %s)", async (required) => {
  const agreement = {
    ...bookingAgreementFixture("provider-one", "Example Studio"),
    serviceNames: ["Wedding Photography"],
    serviceTierLabel: null,
    requiredUpfrontAmountInCentavos: 1000000,
    remainingBalanceInCentavos: 0,
    depositEligible: false,
    paymentDefaultAllocation: null,
  };
  const effectivePolicyKey = "b".repeat(64);
  call.mockReset()
    .mockResolvedValueOnce({data: {agreements: [agreement], refundPolicies: {
      acknowledgementsRequired: required,
      policies: required ? [{
        providerId: "provider-one", effectivePolicyKey,
        rules: [{stage: "preparation_not_started", refundBasisPoints: 7500}],
        terms: "Venue travel costs are nonrefundable.",
      }] : [],
    }}})
    .mockResolvedValueOnce({data: {bookingId: "booking-result"}});

  render(<MediaPackageBooking providerId="provider-one" serviceId="photo-package" serviceName="Wedding Photography"
    revision={0} occasions={[{id: "wedding", label: "Wedding"}]} defaultLocation="Ormoc City"
    guestCapacity={null} providerName="Example Studio" authenticated returnTo="/customer/packages" requestClassName="" />);

  fireEvent.click(screen.getByRole("button", {name: "Customize & request"}));
  fireEvent.click(screen.getByRole("button", {name: "Event date"}));
  const calendar = screen.getByRole("dialog", {name: "Choose event date"});
  const [availableDate] = await within(calendar).findAllByRole("button", {name: /, Available$/});
  fireEvent.click(availableDate);
  for (const [label, value] of [["Number of guests", "30"], ["Start time", "13:00"], ["End time", "17:00"], ["Complete event address", "Example venue"]]) {
    fireEvent.change(screen.getByLabelText(label), {target: {value}});
  }
  fireEvent.click(screen.getByRole("button", {name: "Review booking"}));

  const review = within(await screen.findByRole("region", {name: "Booking & Payment Agreement"}));
  expect(review.getByText(agreementTime(agreement.eventStartAt))).toBeVisible();
  expect(review.getByText(/Preparation Period begins/)).toHaveTextContent(agreementTime(agreement.preparationStartsAt));
  expect(review.getByText("Full payment required")).toBeVisible();
  expect(review.getByText(/Required upfront amount/)).toHaveTextContent(/10,000\.00/);
  expect(review.getByText(/The Provider confirms completion/)).toBeVisible();
  expect(review.queryByText("Failure to Pay Remaining Balance")).not.toBeInTheDocument();

  const submit = screen.getByRole("button", {name: "Send booking request"});
  const form = submit.closest("form")!;
  expect(submit).toBeDisabled();
  fireEvent.submit(form);
  expect(call).toHaveBeenCalledTimes(1);
  const paymentCheckbox = review.getByRole("checkbox");
  if (required) {
    const refundReview = within(screen.getByRole("region", {name: "Cancellation and refunds"}));
    expect(refundReview.getByText(/75% refundable/)).toBeVisible();
    expect(refundReview.getByText("Venue travel costs are nonrefundable.")).toBeVisible();
    fireEvent.click(refundReview.getByRole("checkbox"));
    expect(submit).toBeDisabled();
    fireEvent.click(refundReview.getByRole("checkbox"));
    fireEvent.click(paymentCheckbox);
    expect(submit).toBeDisabled();
    fireEvent.submit(form);
    expect(call).toHaveBeenCalledTimes(1);
    fireEvent.click(refundReview.getByRole("checkbox"));
  } else {
    expect(screen.queryByRole("region", {name: "Cancellation and refunds"})).not.toBeInTheDocument();
    fireEvent.click(paymentCheckbox);
  }

  expect(submit).toBeEnabled();
  const [disclosureName, {submission}] = call.mock.calls[0];
  expect(disclosureName).toBe("getMultiProviderBookingDisclosures");
  fireEvent.click(submit);
  await waitFor(() => expect(call).toHaveBeenNthCalledWith(2, "submitMultiProviderBookingRequest", {
    submission,
    agreementAcknowledgements: [{providerId: "provider-one", agreementKey: agreement.agreementKey}],
    policyAcknowledgements: required ? [{providerId: "provider-one", effectivePolicyKey}] : [],
  }));
  expect(await screen.findByRole("link", {name: "View booking request"})).toHaveAttribute("href", "/customer/bookings/booking-result");
});
