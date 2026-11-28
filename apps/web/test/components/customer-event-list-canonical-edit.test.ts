import {describe, expect, it} from "vitest";
import type {PlanningEntry, RecordValue} from "../../../../functions/src/customer-event-lists/contract";
import fixtures from "../../../../contracts/customer-event-list/fixtures.json";
import {decodeDocument} from "@/lib/customer/event-list/customer-event-list-cloud-contract";
import {planCloudCanonicalConfigurationEdit} from "@/lib/customer/event-list/customer-event-list-cloud-mutations";
import {canonicalConfigurationDraft, projectCanonicalBookingReview} from "@/lib/customer/event-list/configuration-edit";

const requestId = "canonicalEditTestRequest001";

function setup() {
  const document = decodeDocument(
    structuredClone(fixtures.document),
    "customer_A",
  );

  const original = document.entries[1];

  if (
    !original ||
    original.kind !== "catering_package" ||
    !original.configuration
  ) {
    throw new Error("Expected a configured catering package fixture.");
  }

  return {document, original};
}

describe("canonical Mobile-saved Event List editing", () => {
  it("projects Mobile theme and provider instructions for booking without changing stored fields", () => {
    const {original} = setup(); original.configuration!.selectedAddOns = [];
    const before = structuredClone(original);
    const projection = projectCanonicalBookingReview(original);
    expect(projection.status).toBe("supported");
    if (projection.status !== "supported" || projection.item.type === "custom_menu") throw Error();
    expect(projection.item.configuration?.themeInspiration?.notes).toBe(original.configuration!.customTheme);
    expect(projection.item.configuration?.event.specialRequest).toContain("Provider-specific instructions");
    expect(original).toEqual(before);
  });
  it("keeps nonempty Mobile add-ons blocked instead of silently dropping them", () => {
    const {original} = setup();
    expect(projectCanonicalBookingReview(original)).toMatchObject({status: "read_only", reason: expect.stringContaining("add-ons")});
  });
  it("restores Mobile event and package selections without changing the canonical data", () => {
    const {original} = setup();
    const before = structuredClone(original);
    const draft = canonicalConfigurationDraft(original);
    expect(draft.event).toMatchObject({eventAddress: "Event hall", guestCount: "100"});
    expect(draft.customization.foodChoiceSelections).toEqual(original.configuration!.foodChoiceSelections);
    expect(original).toEqual(before);
  });
  it("updates the original selection rather than creating a new entry", () => {
    const {document, original} = setup();
    const event = original.configuration!.event as RecordValue;

    const command = planCloudCanonicalConfigurationEdit(
      document,
      original,
      {event: {...event, eventAddress: "Edited event address"}},
      requestId,
    );

    expect(command).toMatchObject({
      action: "update",
      expectedRevision: document.revision,
      requestId,
      entry: {
        identity: original.identity,
        providerId: original.providerId,
        selectionId: original.selectionId,
      },
    });
  });

  it("preserves the Mobile-saved configuration outside the edited event", () => {
    const {document, original} = setup();
    const configuration = original.configuration!;
    const before = structuredClone(configuration);

    const command = planCloudCanonicalConfigurationEdit(
      document,
      original,
      {
        event: {
          ...(configuration.event as RecordValue),
          eventAddress: "Updated location",
        },
      },
      requestId,
    );

    if (command.action !== "update") {
      throw new Error("Expected an update command.");
    }

    const edited = (command.entry as PlanningEntry).configuration;

    expect(edited).not.toBeNull();

    for (const key of Object.keys(before)) {
      if (key === "event") continue;

      expect(
        (edited as Record<string, unknown>)[key],
      ).toEqual(
        (before as Record<string, unknown>)[key],
      );
    }

    expect(edited?.event).toMatchObject({
      ...(before.event as RecordValue),
      eventAddress: "Updated location",
    });

    expect(original.configuration).toEqual(before);
  });

  it("rejects stale entries rather than overwriting a different-device edit", () => {
    const {document, original} = setup();

    const staleOriginal = {
      ...original,
      name: `${original.name} outdated`,
    };

    expect(() =>
      planCloudCanonicalConfigurationEdit(
        document,
        staleOriginal,
        {event: {...(original.configuration!.event as RecordValue)}},
        requestId,
      ),
    ).toThrow(/changed on another device/i);
  });

  it("rejects attempts to edit immutable selection fields", () => {
    const {document, original} = setup();

    expect(() =>
      planCloudCanonicalConfigurationEdit(
        document,
        original,
        {identity: "different-selection"},
        requestId,
      ),
    ).toThrow(/unsupported canonical configuration edit/i);
  });

  it("rejects an entry that no longer exists", () => {
    const {document, original} = setup();

    expect(() =>
      planCloudCanonicalConfigurationEdit(
        document,
        {...original, identity: "catering_package:missing:missing"},
        {event: {...(original.configuration!.event as RecordValue)}},
        requestId,
      ),
    ).toThrow(/no longer exists/i);
  });
});
