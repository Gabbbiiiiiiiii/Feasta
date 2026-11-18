import {randomUUID} from "node:crypto";
import {afterAll, expect, it, vi} from "vitest";
import {deleteApp} from "firebase-admin/app";
import {Timestamp} from "firebase-admin/firestore";

const fixture = vi.hoisted(() => ({
  host: process.env.FIRESTORE_EMULATOR_HOST,
  projectId: "demo-feasta-walk-in",
  providerId: "",
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({
  requireApprovedProvider: async () => ({providerId: fixture.providerId, uid: "walk-in-owner"}),
}));
vi.mock("@/lib/firebase/admin", async () => {
  const {initializeApp} = await import("firebase-admin/app");
  const {getFirestore} = await import("firebase-admin/firestore");
  const app = fixture.host && /^127\.0\.0\.1:\d+$/.test(fixture.host)
    ? initializeApp({projectId: fixture.projectId}, "walk-in-firestore-test") : undefined;
  return {adminDb: app && getFirestore(app), testApp: app};
});

const testApp = await vi.importMock<{testApp?: Parameters<typeof deleteApp>[0]}>("@/lib/firebase/admin");
const {adminDb} = await import("@/lib/firebase/admin");
const {mutateWalkIn} = await import("@/lib/provider/bookings/walk-in-booking-service");
afterAll(async () => { if (testApp.testApp) await deleteApp(testApp.testApp); });

it.skipIf(!fixture.host || !/^127\.0\.0\.1:\d+$/.test(fixture.host))(
  "serializes competing walk-ins, releases a cancellation and honors an online booking",
  async () => {
    fixture.providerId = `walk-in-${randomUUID()}`;
    const provider = adminDb.collection("providers").doc(fixture.providerId);
    const walkIns = provider.collection("walkInBookings");
    const online = adminDb.collection("providerRequests").doc(fixture.providerId);
    const dateKey = (offset: number) => new Date(Date.now() + (8 + offset * 24) * 3600000).toISOString().slice(0, 10);
    const date = dateKey(2);
    const fields = (values: Record<string, string>) => {
      const form = new FormData();
      Object.entries(values).forEach(([key, value]) => form.set(key, value));
      return form;
    };
    const create = () => fields({
      action: "create", "full name": "Sample Customer", "contact number": "09123456789",
      "event type": "Wedding", "event date": date, "start time": "09:00",
      "end time": "12:00", location: "Manila", "number of guests": "50",
      "custom service": "Photography", "agreement date": dateKey(0), acknowledgment: "on",
    });
    await provider.set({ownerId: "walk-in-owner", verificationStatus: "approved", isActive: true});
    try {
      const results = await Promise.all([mutateWalkIn(create()), mutateWalkIn(create())]);
      expect(results.filter((result) => result.message)).toHaveLength(1);
      expect(results.filter((result) => result.error)).toHaveLength(1);
      const records = await walkIns.get();
      expect(records.size).toBe(1);
      const record = records.docs[0];
      expect(record.get("status")).toBe("confirmed");
      expect((await provider.get()).get("walkInReservedDates")).toEqual([date]);
      expect(await mutateWalkIn(fields({action: "cancelled", reference: record.id}))).toHaveProperty("message");
      expect((await record.ref.get()).get("status")).toBe("cancelled");
      expect((await provider.get()).get("walkInReservedDates")).toEqual([]);

      await online.set({
        providerId: fixture.providerId, status: "confirmed",
        eventDate: Timestamp.fromDate(new Date(`${date}T12:00:00+08:00`)),
      });
      expect(await mutateWalkIn(create())).toEqual({error: "You already have an active booking on this date."});
      expect((await walkIns.get()).size).toBe(1);
    } finally {
      const records = await walkIns.get();
      await Promise.all([...records.docs.map((doc) => doc.ref.delete()), online.delete(), provider.delete()]);
    }
  },
  30000,
);
