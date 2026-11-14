"use client";

export type CustomerBookingStanding = {
  activeCount: number;
  status: "clear" | "warning" | "final_warning" | "restricted";
  restrictionExpiresAt: string | null;
  serverTime: string;
};

export async function loadCustomerBookingStanding(): Promise<CustomerBookingStanding> {
  const [{httpsCallable}, {auth, functions, initializeBrowserAppCheck}] = await Promise.all([
    import("firebase/functions"), import("@/lib/firebase/client"),
  ]);
  await auth.authStateReady();
  if (!auth.currentUser) throw new Error("Sign in to check booking standing.");
  initializeBrowserAppCheck();
  const {data} = await httpsCallable<Record<string, never>, CustomerBookingStanding>(
    functions, "getCustomerBookingStanding",
  )({});
  // An unavailable or incompatible response must never look like clear standing.
  if (!data || !Number.isInteger(data.activeCount) || data.activeCount < 0 || data.activeCount > 3 ||
    !["clear", "warning", "final_warning", "restricted"].includes(data.status) ||
    !Number.isFinite(Date.parse(data.serverTime)) ||
    (data.restrictionExpiresAt !== null && !Number.isFinite(Date.parse(data.restrictionExpiresAt))) ||
    (data.status === "clear" && data.activeCount !== 0) ||
    (data.status === "warning" && data.activeCount !== 1) ||
    (data.status === "final_warning" && data.activeCount !== 2) ||
    (data.status !== "restricted" && data.restrictionExpiresAt !== null)) {
    throw new Error("Booking standing is unavailable.");
  }
  return data;
}
