import type {Metadata} from "next";

import {CustomerEventListReview} from "@/components/customer/event-list/customer-event-list-review";

export const metadata: Metadata = {
  title: {
    absolute: "Review Event List | FEASTA",
  },
  description:
    "Review your selected FEASTA providers, packages, menu items, and event services before booking.",
};

export default function CustomerEventListReviewPage() {
  return <CustomerEventListReview />;
}
