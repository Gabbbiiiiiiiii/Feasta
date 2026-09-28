import type {Metadata} from "next";

import {CustomerEventListReview} from "@/components/customer/event-list/customer-event-list-review";

export const metadata: Metadata = {
  title: {
    absolute: "Review Event List | FEASTA",
  },
  description:
    "Review packages saved to your FEASTA planning list. This page does not submit a booking.",
};

export default function CustomerEventListReviewPage() {
  return <CustomerEventListReview />;
}
