import {ReviewManagementClient} from "@/components/admin/reviews/review-management-client";
import {getAdminReviewPage} from "@/lib/admin/reviews/admin-review-service";

export default async function AdminReviewsPage() {
  const initialPage = await getAdminReviewPage({
    search: "",
    status: "all",
    report: "all",
    rating: "all",
    date: "all",
    sortField: "createdAt",
    sortDirection: "descending",
    pageSize: 10,
    cursor: null,
  });

  return <ReviewManagementClient initialPage={initialPage} />;
}