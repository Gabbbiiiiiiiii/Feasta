import {initializeApp} from "firebase-admin/app";
import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";

type SeedServiceCategory = {
  code: string;
  name: string;
  serviceType: "catering" | "addon";
};

const EXPECTED_PROJECT_ID = "feasta-catering-system";
const SERVICE_CATEGORIES_COLLECTION = "serviceCategories";

const DEFAULT_SERVICE_CATEGORIES = [
  {
    code: "catering_service",
    name: "Catering Service",
    serviceType: "catering",
  },
  {
    code: "food_trays_packed_meals",
    name: "Food Trays & Packed Meals",
    serviceType: "catering",
  },
  {
    code: "catering_event_styling",
    name: "Catering & Event Styling",
    serviceType: "catering",
  },
  {
    code: "photographer",
    name: "Photography",
    serviceType: "addon",
  },
  {
    code: "videographer",
    name: "Videography",
    serviceType: "addon",
  },
  {
    code: "photo_booth",
    name: "Photo Booth",
    serviceType: "addon",
  },
  {
    code: "event_coordinator",
    name: "Event Coordinator",
    serviceType: "addon",
  },
  {
    code: "event_host_emcee",
    name: "Event Host / Emcee",
    serviceType: "addon",
  },
  {
    code: "sound_system",
    name: "Sound System",
    serviceType: "addon",
  },
  {
    code: "lights_and_sounds",
    name: "Lights & Sounds",
    serviceType: "addon",
  },
  {
    code: "singer_band",
    name: "Singer / Band",
    serviceType: "addon",
  },
  {
    code: "dancer_performer",
    name: "Dancer / Performer",
    serviceType: "addon",
  },
  {
    code: "decorator_event_stylist",
    name: "Decorator / Event Stylist",
    serviceType: "addon",
  },
  {
    code: "florist",
    name: "Florist",
    serviceType: "addon",
  },
  {
    code: "cake_provider",
    name: "Cake Provider",
    serviceType: "addon",
  },
  {
    code: "gown_suit_rental",
    name: "Gown & Suit Rental",
    serviceType: "addon",
  },
  {
    code: "car_rental",
    name: "Car Rental",
    serviceType: "addon",
  },
  {
    code: "venue_provider",
    name: "Venue Provider",
    serviceType: "addon",
  },
  {
    code: "tables_chairs_rental",
    name: "Tables & Chairs Rental",
    serviceType: "addon",
  },
  {
    code: "other_event_service",
    name: "Other Event Service",
    serviceType: "addon",
  },
] as const satisfies readonly SeedServiceCategory[];

function sortName(name: string): string {
  return name.trim().toLocaleLowerCase("en");
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");

  const app = initializeApp({
    projectId: EXPECTED_PROJECT_ID,
  });

  if (app.options.projectId !== EXPECTED_PROJECT_ID) {
    throw new Error(
      `Refusing to run against unexpected Firebase project "${
        app.options.projectId ?? "unknown"
      }".`,
    );
  }

  const firestore = getFirestore(app);

  console.log(
    `Target Firebase project: ${EXPECTED_PROJECT_ID}`,
  );

  const references = DEFAULT_SERVICE_CATEGORIES.map((category) =>
    firestore
      .collection(SERVICE_CATEGORIES_COLLECTION)
      .doc(category.code)
  );

  const snapshots = await firestore.getAll(...references);

  const missing = DEFAULT_SERVICE_CATEGORIES.filter(
    (_, index) => !snapshots[index]?.exists,
  );

  const existing = DEFAULT_SERVICE_CATEGORIES.filter(
    (_, index) => snapshots[index]?.exists,
  );

  console.log(
    `${existing.length} existing service categor${
      existing.length === 1 ? "y" : "ies"
    } will be left unchanged.`,
  );

  console.log(
    `${missing.length} service categor${
      missing.length === 1 ? "y" : "ies"
    } ${apply ? "will be created" : "would be created"}.`,
  );

  for (const category of missing) {
    console.log(
      `${apply ? "Creating" : "Would create"}: ` +
        `${category.code} (${category.name})`,
    );
  }

  if (!apply) {
    console.log(
      "Dry run only. Re-run with --apply to create missing categories.",
    );
    return;
  }

  if (missing.length === 0) {
    console.log("No service categories need to be created.");
    return;
  }

  const batch = firestore.batch();

  for (const category of missing) {
    const reference = firestore
      .collection(SERVICE_CATEGORIES_COLLECTION)
      .doc(category.code);

    batch.create(reference, {
      code: category.code,
      name: category.name,
      serviceType: category.serviceType,
      status: "active",
      sortName: sortName(category.name),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: "system_seed",
      updatedBy: "system_seed",
    });
  }

  await batch.commit();

  console.log(
    `Created ${missing.length} service categor${
      missing.length === 1 ? "y" : "ies"
    }.`,
  );
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
