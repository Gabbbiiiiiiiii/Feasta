import "server-only";

import type {Query} from "firebase-admin/firestore";

import {requireAdmin} from "@/lib/auth/session";
import {adminDb} from "@/lib/firebase/admin";

const recordLimit = 5_000;
const dateFormatter = new Intl.DateTimeFormat("en-PH", {timeZone: "Asia/Manila"});

export const customerDirectoryStatuses = [
  "Active", "Inactive", "Blocked", "Pending Deletion", "Unknown",
] as const;

export type CustomerDirectoryStatus = (typeof customerDirectoryStatuses)[number];

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function accountStatus(user: Record<string, unknown>): CustomerDirectoryStatus {
  if (user.accountStatus === "pending_deletion") return "Pending Deletion";
  if (user.isBlocked === true || user.accountStatus === "blocked") return "Blocked";
  if (user.isActive === false || ["disabled", "deactivated"].includes(text(user.accountStatus))) return "Inactive";
  if (user.isActive === true || user.accountStatus === "active") return "Active";
  return "Unknown";
}

function joinedDate(value: unknown): string {
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    value = value.toDate();
  }
  const date = typeof value === "string" ? new Date(value) : value;
  return date instanceof Date && Number.isFinite(date.getTime()) ? dateFormatter.format(date) : "Unavailable";
}

async function reportRecords(query: Query) {
  const snapshot = await query.limit(recordLimit + 1).get();
  if (snapshot.size > recordLimit) {
    throw new Error("The Customer Directory cannot be generated because a source exceeds 5,000 records.");
  }
  return snapshot.docs;
}

export async function getCustomerDirectoryReport(filters: {municipality?: string; status?: string}) {
  await requireAdmin();
  const municipality = text(filters.municipality).slice(0, 150).toLowerCase();
  const [users, profiles, events] = await Promise.all([
    reportRecords(adminDb.collection("users").where("role", "==", "customer")
      .select("firstName", "lastName", "displayName", "email", "phoneNumber", "createdAt", "accountStatus", "isActive", "isBlocked")),
    reportRecords(adminDb.collection("customers").select("city")),
    reportRecords(adminDb.collection("mainEvents").select("customerId", "status")),
  ]);
  const cities = new Map(profiles.map((profile) => [profile.id, text(profile.get("city"))]));
  const bookingCounts = new Map<string, number>();
  for (const event of events) {
    const customerId = text(event.get("customerId"));
    if (customerId && event.get("status") !== "draft") {
      bookingCounts.set(customerId, (bookingCounts.get(customerId) ?? 0) + 1);
    }
  }

  const municipalities = new Map<string, string>();
  const rows = users.flatMap((document) => {
    const user = document.data();
    const city = cities.get(document.id) ?? "";
    const cityKey = city.toLowerCase();
    if (city && !municipalities.has(cityKey)) municipalities.set(cityKey, city);

    const status = accountStatus(user);
    if ((municipality && municipality !== cityKey) || (filters.status && filters.status !== status)) return [];

    return [{
      name: [text(user.firstName), text(user.lastName)].filter(Boolean).join(" ") || text(user.displayName) || "Unnamed account",
      email: text(user.email) || "Unavailable",
      phone: text(user.phoneNumber) || "Unavailable",
      municipality: city || "Unavailable",
      bookings: bookingCounts.get(document.id) ?? 0,
      joined: joinedDate(user.createdAt),
      status,
    }];
  });
  return {
    municipalities: [...municipalities.entries()].sort((left, right) => left[1].localeCompare(right[1])),
    rows: rows.sort((left, right) => left.name.localeCompare(right.name)),
  };
}
