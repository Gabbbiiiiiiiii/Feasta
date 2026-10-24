import {db} from "../shared/firestore.js";
import {requireActiveServiceCategoryInTransaction} from "../shared/service-category-policy.js";
import {buildBookingPaymentPolicySnapshot, type BookingPaymentPolicySnapshot} from "./booking-payment-eligibility-policy.js";

export async function loadBookingPaymentPolicySnapshot(input: {
  transaction: FirebaseFirestore.Transaction;
  packageId: string | null;
  packageData: Readonly<Record<string, unknown>> | null;
  platformSettings?: Readonly<Record<string, unknown>> | null;
}): Promise<BookingPaymentPolicySnapshot> {
  // Package category authority comes exclusively from the canonical package.
  // Custom menus have no category in their contract and must not call this loader.
  const serviceCategoryCode = await requireActiveServiceCategoryInTransaction(
    input.transaction, input.packageData?.serviceCategoryCode, "catering", "serviceCategoryCode",
  );
  const category = await input.transaction.get(db.collection("serviceCategories").doc(serviceCategoryCode));
  const platformSettings = input.platformSettings === undefined
    ? (await input.transaction.get(db.collection("appSettings").doc("platform"))).data() ?? null
    : input.platformSettings;
  return buildBookingPaymentPolicySnapshot({platformSettings, serviceCategoryCode,
    serviceCategory: category.data()!, packageId: input.packageId, packageData: input.packageData});
}
