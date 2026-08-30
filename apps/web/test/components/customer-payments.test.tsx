import {act, fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import {StrictMode} from "react";
import {beforeEach, describe, expect, it, vi} from "vitest";

import {CustomerPaymentsClient} from "@/components/customer/payments/customer-payments-client";
import type {
  CustomerPayment,
  CustomerPaymentPage,
  CustomerPaymentReturnDetails,
  CustomerPaymentReturnLoadResult,
} from "@/lib/customer/payments/customer-payment-types";

const mocks = vi.hoisted(() => ({
  loadPayments: vi.fn(),
  loadPaymentReturn: vi.fn(),
  clearPaymentReturn: vi.fn(),
  createCheckout: vi.fn(),
  readPaymentReturn: vi.fn(),
  redirectCheckout: vi.fn(),
}));

vi.mock("@/app/customer/payments/actions", () => ({
  loadCustomerPaymentsAction: mocks.loadPayments,
  loadCustomerPaymentReturnAction: mocks.loadPaymentReturn,
}));

vi.mock("@/lib/customer/payments/customer-payment-client", () => ({
  clearCustomerPaymentReturnContext: mocks.clearPaymentReturn,
  createCustomerPaymentCheckout: mocks.createCheckout,
  readCustomerPaymentReturnContext: mocks.readPaymentReturn,
  redirectToCustomerPaymentCheckout: mocks.redirectCheckout,
}));

const initialPage: CustomerPaymentPage = {
  payments: [
    {
      id: "payment_pending_12345678",
      paymentId: "payment_pending_12345678",
      bookingId: "booking_pending_12345678",
      bookingCode: "FEASTA-1001",
      providerRequestId: "request_pending_12345678",
      providerId: "provider_one_12345678",
      providerName: "Ana Events",
      amountInCentavos: 250000,
      formattedAmount: "₱2,500.00",
      currency: "PHP",
      paymentType: "provider_down_payment",
      gateway: "paymongo",
      status: "pending",
      canStartCheckout: true,
      createdAt: "2026-08-08T01:00:00.000Z",
      updatedAt: null,
      paidAt: null,
      failedAt: null,
      expiredAt: null,
      refundedAt: null,
    },
    {
      id: "payment_paid_123456789",
      paymentId: "payment_paid_123456789",
      bookingId: "booking_paid_123456789",
      bookingCode: "FEASTA-1002",
      providerRequestId: "request_paid_123456789",
      providerId: "provider_two_123456789",
      providerName: "Ormoc Catering",
      amountInCentavos: 500000,
      formattedAmount: "₱5,000.00",
      currency: "PHP",
      paymentType: "provider_down_payment",
      gateway: "paymongo",
      status: "paid",
      canStartCheckout: false,
      createdAt: "2026-08-07T01:00:00.000Z",
      updatedAt: null,
      paidAt: "2026-08-07T02:00:00.000Z",
      failedAt: null,
      expiredAt: null,
      refundedAt: null,
    },
  ],
  statistics: {
    totalPayments: 2,
    awaitingPayment: 1,
    processing: 0,
    paid: 1,
    failedOrExpired: 0,
    refunded: 0,
    totalPaidInCentavos: 500000,
    totalPaidFormatted: "₱5,000.00",
  },
  nextCursor: null,
  hasMore: false,
};

const returnLookup = {
  paymentId: "payment_pending_12345678",
  providerRequestId: "request_pending_12345678",
  bookingId: "booking_pending_12345678",
};

const processingReturn: CustomerPaymentReturnDetails = {
  providerRequestId: returnLookup.providerRequestId,
  providerName: "Ana Events",
  serviceLabel: "Wedding photography",
  categoryLabel: "Photography",
  requestAmountFormatted: "â‚±10,000.00",
  downPaymentAmountFormatted: "â‚±2,500.00",
  paymentStatus: "processing",
  providerRequestStatus: "payment_processing",
  canStartCheckout: false,
  bookingLabel: "FEASTA-1001",
  bookingDetailsPath: `/customer/bookings/${returnLookup.bookingId}`,
};

describe("customer payments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readPaymentReturn.mockReturnValue(null);
    mocks.loadPayments.mockResolvedValue(initialPage);
  });

  it("does not inspect retained return context during a normal payments visit", () => {
    mocks.readPaymentReturn.mockReturnValue(returnLookup);

    render(<CustomerPaymentsClient initialPage={initialPage} />);

    expect(mocks.readPaymentReturn).not.toHaveBeenCalled();
    expect(mocks.loadPaymentReturn).not.toHaveBeenCalled();
    expect(screen.queryByText(/payment verification in progress/iu)).not.toBeInTheDocument();
  });

  it("renders owned payment facts and checkout only for eligible records", () => {
    render(<CustomerPaymentsClient initialPage={initialPage} />);

    expect(screen.getByRole("heading", {name: "Payments"})).toBeVisible();
    expect(screen.getByText("Ana Events")).toBeVisible();
    expect(screen.getByText("Ormoc Catering")).toBeVisible();
    expect(screen.getAllByText("₱5,000.00").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", {name: /pay now/iu})).toHaveLength(1);
  });

  it("sends exact search and canonical status filters through the action", async () => {
    mocks.loadPayments.mockResolvedValue({...initialPage, payments: []});
    render(<CustomerPaymentsClient initialPage={initialPage} />);

    fireEvent.change(screen.getByRole("searchbox", {name: /search payments/iu}), {
      target: {value: "FEASTA-1001"},
    });
    fireEvent.click(screen.getByRole("button", {name: "Search"}));

    await waitFor(() => expect(mocks.loadPayments).toHaveBeenCalledWith({
      search: "FEASTA-1001",
      status: "all",
      pageSize: 10,
      cursor: null,
    }));

    fireEvent.change(screen.getByRole("combobox", {name: "Payment status"}), {
      target: {value: "paid"},
    });
    await waitFor(() => expect(mocks.loadPayments).toHaveBeenLastCalledWith({
      search: "FEASTA-1001",
      status: "paid",
      pageSize: 10,
      cursor: null,
    }));
  });

  it("requires confirmation before creating and redirecting to checkout", async () => {
    const checkout = {
      paymentId: "payment_pending_12345678",
      providerRequestId: "request_pending_12345678",
      bookingId: "booking_pending_12345678",
      checkoutUrl: "https://checkout.paymongo.com/example",
      created: true,
    };
    mocks.createCheckout.mockResolvedValue(checkout);
    render(<CustomerPaymentsClient initialPage={initialPage} />);

    fireEvent.click(screen.getByRole("button", {name: /pay now/iu}));
    expect(screen.getByRole("heading", {name: /continue to secure checkout/iu})).toBeVisible();
    expect(mocks.createCheckout).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", {name: /continue to paymongo/iu}));
    await waitFor(() => expect(mocks.createCheckout).toHaveBeenCalledWith("request_pending_12345678"));
    expect(mocks.redirectCheckout).toHaveBeenCalledWith(checkout);
  });

  it("shows confirmed only when the trusted return record is already paid", async () => {
    const trustedBookingPath = "/customer/bookings/trusted_booking_12345678";
    mocks.readPaymentReturn.mockReturnValue(returnLookup);
    mocks.loadPaymentReturn.mockResolvedValue({
      status: "ready",
      payment: {
        ...processingReturn,
        paymentStatus: "paid",
        providerRequestStatus: "confirmed",
        bookingDetailsPath: trustedBookingPath,
      },
    });

    render(
      <CustomerPaymentsClient
        initialPage={initialPage}
        paymentReturnKind="success"
      />,
    );

    expect(
      await screen.findByRole("heading", {name: "Payment confirmed"}),
    ).toBeVisible();
    expect(screen.getAllByText("Ana Events").length).toBeGreaterThan(0);
    expect(screen.getByText("Wedding photography")).toBeVisible();
    expect(screen.getByText("Photography")).toBeVisible();
    expect(screen.getAllByText("â‚±2,500.00").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("link", {name: "View booking details"}),
    ).toHaveAttribute("href", trustedBookingPath);
    expect(
      screen.getByRole("link", {name: "View booking details"}),
    ).not.toHaveAttribute("href", `/customer/bookings/${returnLookup.bookingId}`);
    expect(mocks.clearPaymentReturn).toHaveBeenCalledTimes(1);
  });

  it("does not infer paid from a success return while trusted state is processing", async () => {
    mocks.readPaymentReturn.mockReturnValue(returnLookup);
    mocks.loadPaymentReturn.mockResolvedValue({
      status: "ready",
      payment: processingReturn,
    });

    render(
      <CustomerPaymentsClient
        initialPage={initialPage}
        paymentReturnKind="success"
      />,
    );

    expect(
      await screen.findByRole("heading", {
        name: "Payment verification in progress",
      }),
    ).toBeVisible();
    expect(screen.queryByText("Payment confirmed")).not.toBeInTheDocument();
    expect(screen.getByText(/only the trusted backend confirmation/iu)).toBeVisible();
    expect(mocks.clearPaymentReturn).not.toHaveBeenCalled();
  });

  it("reconciles the bounded payment page after an explicit processing-to-paid recheck", async () => {
    const paidAt = "2026-08-08T02:00:00.000Z";
    const paidReturn = {
      ...processingReturn,
      paymentStatus: "paid" as const,
      providerRequestStatus: "confirmed" as const,
    };
    const reconciledPage = pageWithReturnedPayment({
      status: "paid",
      paidAt,
      canStartCheckout: false,
    });
    mocks.readPaymentReturn.mockReturnValue(returnLookup);
    mocks.loadPaymentReturn
      .mockResolvedValueOnce({status: "ready", payment: processingReturn})
      .mockResolvedValueOnce({status: "ready", payment: paidReturn});
    mocks.loadPayments.mockResolvedValue(reconciledPage);

    render(
      <CustomerPaymentsClient
        initialPage={initialPage}
        paymentReturnKind="success"
      />,
    );

    const recheck = await screen.findByRole("button", {
      name: "Recheck payment",
    });
    await waitFor(() => expect(mocks.loadPaymentReturn).toHaveBeenCalledTimes(1));
    fireEvent.click(recheck);
    await waitFor(() => expect(mocks.loadPaymentReturn).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByRole("heading", {name: "Payment confirmed"}),
    ).toBeVisible();
    expect(mocks.loadPayments).toHaveBeenCalledWith({
      search: "",
      status: "all",
      pageSize: 10,
      cursor: null,
    });

    const returnedPaymentCard = screen.getByRole("heading", {
      name: "Ana Events",
    }).closest("article");
    expect(returnedPaymentCard).not.toBeNull();
    expect(within(returnedPaymentCard!).getAllByText("Paid").length).toBeGreaterThan(0);
    expect(
      within(returnedPaymentCard!).getByText("Aug 8, 2026, 10:00 AM"),
    ).toBeVisible();
    expect(within(screen.getByRole("region", {name: "Paid"})).getByText("2")).toBeVisible();
    expect(
      within(screen.getByRole("region", {name: "Awaiting payment"})).getByText("0"),
    ).toBeVisible();
    expect(mocks.clearPaymentReturn).toHaveBeenCalledTimes(1);
  });

  it.each([
    {status: "refunded" as const, title: "Payment was refunded"},
    {status: "failed" as const, title: "Payment is not confirmed"},
    {status: "expired" as const, title: "Payment is not confirmed"},
  ])("reconciles a terminal $status recheck", async ({status, title}) => {
    const refundedAt = status === "refunded"
      ? "2026-08-09T03:00:00.000Z"
      : null;
    mocks.readPaymentReturn.mockReturnValue(returnLookup);
    mocks.loadPaymentReturn
      .mockResolvedValueOnce({status: "ready", payment: processingReturn})
      .mockResolvedValueOnce({
        status: "ready",
        payment: {
          ...processingReturn,
          paymentStatus: status,
          providerRequestStatus: "confirmed",
        },
      });
    mocks.loadPayments.mockResolvedValue(pageWithReturnedPayment({
      status,
      refundedAt,
      canStartCheckout: false,
    }));

    render(
      <CustomerPaymentsClient
        initialPage={initialPage}
        paymentReturnKind="success"
      />,
    );

    fireEvent.click(await screen.findByRole("button", {name: "Recheck payment"}));

    expect(await screen.findByRole("heading", {name: title})).toBeVisible();
    const returnedPaymentCard = screen.getByRole("heading", {
      name: "Ana Events",
    }).closest("article");
    expect(returnedPaymentCard).not.toBeNull();
    expect(
      within(returnedPaymentCard!).getAllByText(
        status[0].toUpperCase() + status.slice(1),
      ).length,
    ).toBeGreaterThan(0);
    if (refundedAt) {
      expect(
        within(returnedPaymentCard!).getByText(/Aug 9, 2026/iu),
      ).toBeVisible();
    }
    expect(mocks.clearPaymentReturn).toHaveBeenCalledTimes(1);
  });

  it("prevents duplicate concurrent explicit rechecks", async () => {
    const recheck = deferredReturnLoad();
    mocks.readPaymentReturn.mockReturnValue(returnLookup);
    mocks.loadPaymentReturn
      .mockResolvedValueOnce({status: "ready", payment: processingReturn})
      .mockReturnValueOnce(recheck.promise);

    render(
      <CustomerPaymentsClient
        initialPage={initialPage}
        paymentReturnKind="success"
      />,
    );

    const button = await screen.findByRole("button", {name: "Recheck payment"});
    fireEvent.click(button);
    fireEvent.click(button);

    expect(mocks.loadPaymentReturn).toHaveBeenCalledTimes(2);
    expect(
      screen.getByRole("button", {name: "Rechecking payment"}),
    ).toBeDisabled();

    await act(async () => {
      recheck.resolve({status: "ready", payment: processingReturn});
    });
    await waitFor(() => expect(mocks.loadPayments).toHaveBeenCalledTimes(1));
  });

  it("preserves the active payment cursor while reconciling", async () => {
    const firstPage = {
      ...initialPage,
      nextCursor: "cursor-page-2",
      hasMore: true,
    };
    const secondPage = pageWithReturnedPayment({status: "processing"});
    const reconciledSecondPage = pageWithReturnedPayment({
      status: "paid",
      paidAt: "2026-08-08T02:00:00.000Z",
      canStartCheckout: false,
    });
    mocks.readPaymentReturn.mockReturnValue(returnLookup);
    mocks.loadPaymentReturn
      .mockResolvedValueOnce({status: "ready", payment: processingReturn})
      .mockResolvedValueOnce({
        status: "ready",
        payment: {
          ...processingReturn,
          paymentStatus: "paid",
          providerRequestStatus: "confirmed",
        },
      });
    mocks.loadPayments
      .mockResolvedValueOnce(secondPage)
      .mockResolvedValueOnce(reconciledSecondPage);

    render(
      <CustomerPaymentsClient
        initialPage={firstPage}
        paymentReturnKind="success"
      />,
    );

    fireEvent.click(await screen.findByRole("button", {name: "Next"}));
    expect(await screen.findByText("Page 2")).toBeVisible();
    fireEvent.click(screen.getByRole("button", {name: "Recheck payment"}));

    await waitFor(() => expect(mocks.loadPayments).toHaveBeenLastCalledWith({
      search: "",
      status: "all",
      pageSize: 10,
      cursor: "cursor-page-2",
    }));
    expect(screen.getByText("Page 2")).toBeVisible();
  });

  it("does not let an older reconciliation overwrite a newer filtered page", async () => {
    const olderReconciliation = deferredPaymentPage();
    const paidOnlyPage = {
      ...initialPage,
      payments: initialPage.payments.slice(1),
    };
    mocks.readPaymentReturn.mockReturnValue(returnLookup);
    mocks.loadPaymentReturn
      .mockResolvedValueOnce({status: "ready", payment: processingReturn})
      .mockResolvedValueOnce({
        status: "ready",
        payment: {
          ...processingReturn,
          paymentStatus: "paid",
          providerRequestStatus: "confirmed",
        },
      });
    mocks.loadPayments
      .mockReturnValueOnce(olderReconciliation.promise)
      .mockResolvedValueOnce(paidOnlyPage);

    render(
      <CustomerPaymentsClient
        initialPage={initialPage}
        paymentReturnKind="success"
      />,
    );

    fireEvent.click(await screen.findByRole("button", {name: "Recheck payment"}));
    await waitFor(() => expect(mocks.loadPayments).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByRole("combobox", {name: "Payment status"}), {
      target: {value: "paid"},
    });
    await waitFor(() => expect(mocks.loadPayments).toHaveBeenLastCalledWith({
      search: "",
      status: "paid",
      pageSize: 10,
      cursor: null,
    }));

    await act(async () => {
      olderReconciliation.resolve(initialPage);
    });

    const paymentRecords = screen.getByRole("region", {name: "Payment records"});
    expect(within(paymentRecords).queryByText("Ana Events")).not.toBeInTheDocument();
    expect(within(paymentRecords).getByText("Ormoc Catering")).toBeVisible();
  });

  it("does not synthesize a returned payment outside the current page", async () => {
    const pageWithoutReturnedPayment = {
      ...initialPage,
      payments: initialPage.payments.slice(1),
    };
    mocks.readPaymentReturn.mockReturnValue(returnLookup);
    mocks.loadPaymentReturn
      .mockResolvedValueOnce({status: "ready", payment: processingReturn})
      .mockResolvedValueOnce({
        status: "ready",
        payment: {
          ...processingReturn,
          paymentStatus: "paid",
          providerRequestStatus: "confirmed",
        },
      });
    mocks.loadPayments.mockResolvedValue(pageWithoutReturnedPayment);

    render(
      <CustomerPaymentsClient
        initialPage={initialPage}
        paymentReturnKind="success"
      />,
    );

    fireEvent.click(await screen.findByRole("button", {name: "Recheck payment"}));
    await screen.findByRole("heading", {name: "Payment confirmed"});
    const paymentRecords = screen.getByRole("region", {name: "Payment records"});
    expect(within(paymentRecords).queryByText("Ana Events")).not.toBeInTheDocument();
    expect(within(paymentRecords).getByText("Ormoc Catering")).toBeVisible();
  });

  it("prevents a stale return response from overwriting a newer return state", async () => {
    const first = deferredReturnLoad();
    const second = deferredReturnLoad();
    const newerLookup = {
      paymentId: "payment_newer_12345678",
      providerRequestId: "request_newer_12345678",
      bookingId: "booking_newer_12345678",
    };
    mocks.readPaymentReturn
      .mockReturnValueOnce(returnLookup)
      .mockReturnValueOnce(newerLookup);
    mocks.loadPaymentReturn
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const {rerender} = render(
      <CustomerPaymentsClient
        initialPage={initialPage}
        paymentReturnKind="success"
      />,
    );
    await waitFor(() => expect(mocks.loadPaymentReturn).toHaveBeenCalledWith(returnLookup));

    rerender(
      <CustomerPaymentsClient
        initialPage={initialPage}
        paymentReturnKind="cancelled"
      />,
    );
    await waitFor(() => expect(mocks.loadPaymentReturn).toHaveBeenCalledWith(newerLookup));

    await act(async () => {
      second.resolve({
        status: "ready",
        payment: {
          ...processingReturn,
          providerRequestId: newerLookup.providerRequestId,
          providerName: "Newer Studio",
          paymentStatus: "paid",
          providerRequestStatus: "confirmed",
        },
      });
    });
    expect(
      await screen.findByRole("heading", {name: "Payment confirmed"}),
    ).toBeVisible();
    expect(screen.getByText("Newer Studio")).toBeVisible();

    await act(async () => {
      first.resolve({status: "unavailable"});
    });
    expect(screen.getByRole("heading", {name: "Payment confirmed"})).toBeVisible();
    expect(screen.getByText("Newer Studio")).toBeVisible();
    expect(mocks.clearPaymentReturn).toHaveBeenCalledTimes(1);
  });

  it("invalidates an unfinished explicit recheck when the component unmounts", async () => {
    const pendingRecheck = deferredReturnLoad();
    mocks.readPaymentReturn.mockReturnValue(returnLookup);
    mocks.loadPaymentReturn
      .mockResolvedValueOnce({status: "ready", payment: processingReturn})
      .mockReturnValueOnce(pendingRecheck.promise);

    const {unmount} = render(
      <CustomerPaymentsClient
        initialPage={initialPage}
        paymentReturnKind="success"
      />,
    );
    fireEvent.click(await screen.findByRole("button", {name: "Recheck payment"}));
    await waitFor(() => expect(mocks.loadPaymentReturn).toHaveBeenCalledTimes(2));

    unmount();
    await act(async () => {
      pendingRecheck.resolve({
        status: "ready",
        payment: {
          ...processingReturn,
          paymentStatus: "paid",
          providerRequestStatus: "confirmed",
        },
      });
    });

    expect(mocks.clearPaymentReturn).not.toHaveBeenCalled();
    expect(mocks.loadPayments).not.toHaveBeenCalled();
  });

  it("loads one effective return request under React Strict Mode", async () => {
    mocks.readPaymentReturn.mockReturnValue(returnLookup);
    mocks.loadPaymentReturn.mockResolvedValue({
      status: "ready",
      payment: processingReturn,
    });

    render(
      <StrictMode>
        <CustomerPaymentsClient
          initialPage={initialPage}
          paymentReturnKind="success"
        />
      </StrictMode>,
    );

    await screen.findByRole("heading", {
      name: "Payment verification in progress",
    });
    expect(mocks.loadPaymentReturn).toHaveBeenCalledTimes(1);
  });

  it("reports a cancelled return without mutating payment state", async () => {
    mocks.readPaymentReturn.mockReturnValue(returnLookup);
    mocks.loadPaymentReturn.mockResolvedValue({
      status: "ready",
      payment: {
        ...processingReturn,
        paymentStatus: "pending",
        providerRequestStatus: "waiting_for_down_payment",
        canStartCheckout: true,
      },
    });

    render(
      <CustomerPaymentsClient
        initialPage={initialPage}
        paymentReturnKind="cancelled"
      />,
    );

    expect(
      await screen.findByRole("heading", {name: "Checkout was not completed"}),
    ).toBeVisible();
    expect(screen.getByText(/return did not change your payment/iu)).toBeVisible();
    expect(mocks.createCheckout).not.toHaveBeenCalled();
    expect(mocks.clearPaymentReturn).not.toHaveBeenCalled();
    expect(screen.getByRole("button", {name: "Retry secure checkout"})).toBeVisible();
  });

  it("reuses the existing confirmation flow when a trusted return remains payable", async () => {
    const payableReturn = {
      ...processingReturn,
      paymentStatus: "pending" as const,
      providerRequestStatus: "waiting_for_down_payment" as const,
      canStartCheckout: true,
    };
    mocks.readPaymentReturn.mockReturnValue(returnLookup);
    mocks.loadPaymentReturn.mockResolvedValue({
      status: "ready",
      payment: payableReturn,
    });

    render(
      <CustomerPaymentsClient
        initialPage={initialPage}
        paymentReturnKind="cancelled"
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", {name: "Retry secure checkout"}),
    );
    expect(
      screen.getByRole("heading", {name: /continue to secure checkout/iu}),
    ).toBeVisible();
    expect(mocks.createCheckout).not.toHaveBeenCalled();
  });

  it("fails closed for a foreign or unavailable return without exposing identifiers", async () => {
    mocks.readPaymentReturn.mockReturnValue(returnLookup);
    mocks.loadPaymentReturn.mockResolvedValue({status: "unavailable"});

    render(
      <CustomerPaymentsClient
        initialPage={{...initialPage, payments: []}}
        paymentReturnKind="success"
      />,
    );

    expect(
      await screen.findByRole("heading", {name: "Payment details are unavailable"}),
    ).toBeVisible();
    expect(screen.queryByText(returnLookup.paymentId)).not.toBeInTheDocument();
    expect(screen.queryByText(returnLookup.providerRequestId)).not.toBeInTheDocument();
    expect(screen.queryByText(returnLookup.bookingId)).not.toBeInTheDocument();
    expect(mocks.clearPaymentReturn).toHaveBeenCalledTimes(1);
  });

  it("fails safely when return context is missing without calling the server", async () => {
    mocks.readPaymentReturn.mockReturnValue(null);

    render(
      <CustomerPaymentsClient
        initialPage={initialPage}
        paymentReturnKind="success"
      />,
    );

    expect(
      await screen.findByRole("heading", {name: "Payment details are unavailable"}),
    ).toBeVisible();
    expect(mocks.loadPaymentReturn).not.toHaveBeenCalled();
  });

  it("retains return context after a transient load error so recheck can recover", async () => {
    mocks.readPaymentReturn.mockReturnValue(returnLookup);
    mocks.loadPaymentReturn
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce({
        status: "ready",
        payment: processingReturn,
      });

    render(
      <CustomerPaymentsClient
        initialPage={initialPage}
        paymentReturnKind="success"
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", {name: "Recheck payment"}),
    );
    expect(
      await screen.findByRole("heading", {
        name: "Payment verification in progress",
      }),
    ).toBeVisible();
    expect(mocks.loadPaymentReturn).toHaveBeenCalledTimes(2);
    expect(mocks.clearPaymentReturn).not.toHaveBeenCalled();
  });

  it("fails safely for malformed return params without loading a record", () => {
    render(
      <CustomerPaymentsClient
        initialPage={initialPage}
        paymentReturnKind="invalid"
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: "We could not verify this payment return",
      }),
    ).toBeVisible();
    expect(mocks.readPaymentReturn).not.toHaveBeenCalled();
    expect(mocks.loadPaymentReturn).not.toHaveBeenCalled();
  });

  it("keeps internal return and gateway data out of the trusted presentation", async () => {
    mocks.readPaymentReturn.mockReturnValue(returnLookup);
    mocks.loadPaymentReturn.mockResolvedValue({
      status: "ready",
      payment: processingReturn,
    });

    render(
      <CustomerPaymentsClient
        initialPage={{...initialPage, payments: []}}
        paymentReturnKind="success"
      />,
    );

    await screen.findByText("Wedding photography");
    expect(screen.queryByText(returnLookup.paymentId)).not.toBeInTheDocument();
    expect(screen.queryByText(returnLookup.providerRequestId)).not.toBeInTheDocument();
    expect(screen.queryByText("cs_test_12345678")).not.toBeInTheDocument();
    expect(
      screen.queryByText("https://checkout.paymongo.com/example"),
    ).not.toBeInTheDocument();
  });
});

function deferredReturnLoad() {
  let resolve!: (result: CustomerPaymentReturnLoadResult) => void;
  const promise = new Promise<CustomerPaymentReturnLoadResult>((complete) => {
    resolve = complete;
  });

  return {promise, resolve};
}

function deferredPaymentPage() {
  let resolve!: (result: CustomerPaymentPage) => void;
  const promise = new Promise<CustomerPaymentPage>((complete) => {
    resolve = complete;
  });

  return {promise, resolve};
}

function pageWithReturnedPayment(
  patch: Partial<CustomerPayment>,
): CustomerPaymentPage {
  const payments = initialPage.payments.map((payment) =>
    payment.id === returnLookup.paymentId
      ? {...payment, ...patch}
      : payment,
  );
  const totalPaidInCentavos = payments
    .filter((payment) => payment.status === "paid")
    .reduce((total, payment) => total + payment.amountInCentavos, 0);

  return {
    ...initialPage,
    payments,
    statistics: {
      ...initialPage.statistics,
      awaitingPayment: payments.filter((payment) => payment.status === "pending").length,
      processing: payments.filter((payment) => payment.status === "processing").length,
      paid: payments.filter((payment) => payment.status === "paid").length,
      failedOrExpired: payments.filter(
        (payment) => payment.status === "failed" || payment.status === "expired",
      ).length,
      refunded: payments.filter((payment) => payment.status === "refunded").length,
      totalPaidInCentavos,
      totalPaidFormatted: new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
      }).format(totalPaidInCentavos / 100),
    },
  };
}
