import {render, screen} from "@testing-library/react";
import {expect, it} from "vitest";
import {AdminBookingPerformance} from "@/components/admin/reports/admin-booking-performance";
import type {AdminBookingPerformance as BookingData} from "@/lib/admin/reports/admin-report-types";

it("does not portray unrelated payments as booking conversion", () => {
  const rate = {value: 0, previousValue: null, percentageChange: null, comparisonAvailable: false, trend: "not_comparable" as const, numerator: 0, denominator: 0, formattedValue: "0%"};
  const report: BookingData = {
    trend: [{periodStart: "2026-10-01", periodEndExclusive: "2026-10-02", label: "Oct 1", created: 1, confirmed: 0, completed: 0, cancelled: 0, expired: 0}],
    statusDistribution: [{status: "draft", count: 1, percentage: 100}],
    funnel: [
      {id: "booking_created", label: "Booking created", count: 1, conversionFromCreated: 100, conversionFromPrevious: null},
      {id: "payment_completed", label: "Payment completed", count: 3, conversionFromCreated: 300, conversionFromPrevious: 300},
    ],
    providerRequests: {totalRequests: 0, acceptanceRate: rate, rejectionRate: rate, averageResponseTimeInMinutes: null, byStatus: []},
    averageLeadTimeInDays: null,
  };
  const {container} = render(<AdminBookingPerformance report={report} />);
  expect(screen.getByRole("img", {name: /Booking activity trend/})).toBeInTheDocument();
  expect(screen.getByRole("table", {name: "Booking activity values"})).toHaveTextContent("Oct 11");
  expect(container.textContent).not.toMatch(/funnel|300%|of created|from previous/i);
});
