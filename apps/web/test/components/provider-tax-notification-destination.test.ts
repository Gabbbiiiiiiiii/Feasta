import {describe, expect, it} from "vitest";
import {resolveNotificationDestination} from "@/lib/notifications/notification-destination";

describe("provider tax-profile notification routing", () => {
  it("opens the exact Admin review when an application ID is provided", () => {
    expect(resolveNotificationDestination("admin", {
      type: "provider_tax_profile_submitted",
      relatedCollection: "providerVerifications",
      relatedId: "verification_one",
    })).toBe("/admin/providers?selected=verification_one");
  });
  it("falls back safely when the verification application ID is not available", () => {
    expect(resolveNotificationDestination("admin", {
      type: "provider_tax_profile_submitted",
      relatedCollection: "providerTaxProfiles",
      relatedId: "provider_one",
    })).toBe("/admin/providers");
  });
  it.each(["provider_tax_profile_verified", "provider_tax_profile_rejected"])(
    "sends %s to the provider tax profile", (type) => {
      expect(resolveNotificationDestination("provider", {
        type, relatedCollection: "providerTaxProfiles", relatedId: "provider_one",
      })).toBe("/provider/tax-profile");
    },
  );
  it("does not interpret unrelated notifications as tax events", () => {
    expect(resolveNotificationDestination("admin", {
      type: "new_message", relatedCollection: "chatrooms", relatedId: "room_one",
    })).toBeNull();
  });
});