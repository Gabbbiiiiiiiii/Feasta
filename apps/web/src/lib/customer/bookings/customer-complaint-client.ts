"use client";

import {FirebaseError} from "firebase/app";
import {httpsCallable} from "firebase/functions";
import {auth, functions, initializeBrowserAppCheck} from "@/lib/firebase/client";

export const COMPLAINT_CATEGORIES = [
  ["service_quality", "Service quality"], ["provider_conduct", "Provider conduct"],
  ["booking_details", "Booking details"], ["payment", "Payment concern"], ["other", "Other"],
] as const;
export type BookingComplaintInput = {providerRequestId: string; category: string; description: string};

export async function submitCustomerBookingComplaint(input: BookingComplaintInput): Promise<{created: boolean}> {
  try {
    await auth.authStateReady();
    if (!auth.currentUser) throw new Error("Please sign in again before reporting an issue.");
    const providerRequestId = input.providerRequestId.trim();
    const description = input.description.trim();
    if (!/^[A-Za-z0-9_-]{1,160}$/u.test(providerRequestId)) throw new Error("This booked service is unavailable.");
    if (!COMPLAINT_CATEGORIES.some(([value]) => value === input.category)) throw new Error("Choose an issue category.");
    if (description.length < 10 || description.length > 4000) throw new Error("Describe the issue in 10 to 4,000 characters.");
    initializeBrowserAppCheck();
    const callable = httpsCallable<BookingComplaintInput, {success: boolean; complaintId: string; created: boolean; idempotentReplay: boolean}>(
      functions, "createComplaint", {timeout: 30_000});
    const {data} = await callable({providerRequestId, category: input.category, description});
    if (data.success !== true || !/^complaint_[a-f0-9]{32}$/u.test(data.complaintId) ||
      typeof data.created !== "boolean" || typeof data.idempotentReplay !== "boolean") {
      throw new Error("The report could not be confirmed. Please retry with the same details.");
    }
    return {created: data.created};
  } catch (error: unknown) {
    if (error instanceof FirebaseError) {
      const code = error.code.replace(/^functions\//u, "");
      if (code === "unauthenticated") throw new Error("Please sign in again before reporting an issue.");
      if (["permission-denied", "not-found", "failed-precondition"].includes(code)) throw new Error("This booked service is unavailable for reporting. Refresh the booking and try again.");
      if (code === "resource-exhausted") throw new Error("Too many reports were attempted. Please wait before trying again.");
      throw new Error("Your report could not be submitted. Please retry with the same details.");
    }
    throw error instanceof Error ? error : new Error("Your report could not be submitted. Please try again.");
  }
}
