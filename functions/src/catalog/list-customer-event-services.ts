// Mirrors Customer Web's bounded, server-normalized event-service catalog.
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {db} from "../shared/firestore.js";
import {appCheckCallableOptions} from "../shared/function-options.js";
import {enforceCallableRateLimit} from "../shared/rate-limit.js";
const FIRESTORE_COLLECTIONS = {addons: "addons", providers: "providers", users: "users"} as const;
type RecordData = Readonly<Record<string, unknown>>;
type PublicEventService = {
 id: string; providerId: string; providerName: string; name: string;
 description: string | null; category: string | null; price: number | null;
 imageUrl: string | null; source: string; bookingLeadTimeDays: number | null;
};
type PublicEventServicePage = {services: PublicEventService[]};
function isPublicProviderId(value: string): boolean {
 return /^[A-Za-z0-9_-]{1,128}$/u.test(value);
}
function normalizePublicProvider(id: string, provider: RecordData, owner: RecordData) {
 const ownerId = safeText(provider.ownerId, 128);
 const businessName = safeText(provider.businessName, 160);
 if (!isPublicProviderId(id) || provider.verificationStatus !== "approved" ||
     provider.publiclyVisible !== true || provider.isActive !== true ||
     provider.isSuspended === true || provider.isDeleted === true || !ownerId ||
     owner.role !== "provider" || owner.providerId !== id || owner.accountStatus !== "active" ||
     owner.isActive === false || owner.isBlocked === true || !businessName ||
     !["catering", "addon", "both"].includes(provider.providerServiceType as string)) return null;
 const lead = provider.bookingLeadTimeDays;
 return {id, businessName, bookingLeadTimeDays: typeof lead === "number" &&
   Number.isSafeInteger(lead) && lead >= 0 && lead <= 365 ? lead : null};
}
export const listCustomerEventServices = onCall(appCheckCallableOptions, async (request) => {
 const input = request.data;
 if (!input || typeof input !== "object" || Array.isArray(input) ||
     Object.keys(input).some((key) => key !== "cateringProviderId" && key !== "addonId") ||
     (input.addonId !== undefined &&
       (typeof input.addonId !== "string" || !isPublicProviderId(input.addonId))) ||
     typeof input.cateringProviderId !== "string" ||
     !isPublicProviderId(input.cateringProviderId)) {
   throw new HttpsError("invalid-argument", "A valid catering provider is required.");
 }
 await enforceCallableRateLimit(request, {
   scope: "listCustomerEventServices", limit: 60, windowSeconds: 3600,
 });
 return loadPublicEventServices(input.cateringProviderId, input.addonId);
});

const EVENT_SERVICE_CANDIDATE_LIMIT = 60;
const EVENT_SERVICE_RESULT_LIMIT = 20;

export async function loadPublicEventServices(
  cateringProviderId: string,
  addonId?: string,
): Promise<PublicEventServicePage> {
  if (!isPublicProviderId(cateringProviderId)) {
    return {
      services: [],
    };
  }

  const snapshot = addonId ? {docs: (await db.getAll(
    db.collection(FIRESTORE_COLLECTIONS.addons).doc(addonId),
  )).filter((doc) => doc.exists)} : await db
    .collection(FIRESTORE_COLLECTIONS.addons)
    .where("isActive", "==", true)
    .where("isAvailable", "==", true)
    .limit(EVENT_SERVICE_CANDIDATE_LIMIT)
    .get();

  const candidates = snapshot.docs.flatMap(
    (document) => {
      const data = document.data();
      if (!data) return [];

      if (data.isDeleted === true || data.status !== "published" || data.isPublished !== true ||
          data.isActive !== true || data.isAvailable !== true) {
        return [];
      }

      const providerId =
        safeDocumentId(data.providerId);

      if (
        !providerId ||
        !isPublicProviderId(providerId)
      ) {
        return [];
      }

      return [{
        documentId: document.id,
        providerId,
        data,
      }];
    },
  );

  if (candidates.length === 0) {
    return {
      services: [],
    };
  }

  const providerIds = [
    ...new Set(
      candidates.map(
        (candidate) =>
          candidate.providerId,
      ),
    ),
  ];

  const providerSnapshots =
    await db.getAll(
      ...providerIds.map(
        (providerId) =>
          db
            .collection(
              FIRESTORE_COLLECTIONS.providers,
            )
            .doc(providerId),
      ),
    );

  const ownerIds = [
    ...new Set(
      providerSnapshots.flatMap(
        (snapshot) => {
          const ownerId =
            safeDocumentId(
              snapshot.data()?.ownerId,
            );

          return ownerId
            ? [ownerId]
            : [];
        },
      ),
    ),
  ];

  const ownerSnapshots =
    ownerIds.length > 0
      ? await db.getAll(
          ...ownerIds.map(
            (ownerId) =>
              db
                .collection(
                  FIRESTORE_COLLECTIONS.users,
                )
                .doc(ownerId),
          ),
        )
      : [];

  const owners = new Map(
    ownerSnapshots.map(
      (snapshot) => [
        snapshot.id,
        snapshot.exists
          ? snapshot.data() ?? {}
          : {},
      ],
    ),
  );

  const providers = new Map(
    providerSnapshots.flatMap(
      (snapshot) => {
        if (!snapshot.exists) {
          return [];
        }

        const data =
          snapshot.data() ?? {};

        const ownerId =
          safeDocumentId(data.ownerId);

        if (!ownerId) {
          return [];
        }

        const provider =
          normalizePublicProvider(
            snapshot.id,
            data,
            owners.get(ownerId) ?? {},
          );

        return provider
          ? [[provider.id, provider] as const]
          : [];
      },
    ),
  );

  const services =
    candidates.flatMap(
      (
        candidate,
      ): PublicEventService[] => {
        const provider =
          providers.get(
            candidate.providerId,
          );

        if (!provider) {
          return [];
        }
        const providerRecord = providerSnapshots.find(
          (snapshot) => snapshot.id === candidate.providerId,
        )?.data();
        if (!providerRecord ||
            candidate.data.ownerId !== providerRecord.ownerId) return [];

        const name =
          safeText(
            candidate.data.name,
            160,
          );

        if (!name) {
          return [];
        }

        return [{
          id: candidate.documentId,
          providerId:
            candidate.providerId,
          providerName:
            provider.businessName,
          name,
          description:
            safeText(
              candidate.data.description,
              600,
            ),
          category:
            safeText(
              candidate.data.category,
              80,
            ),
          price:
            safeMoney(
              candidate.data.price,
            ),
          imageUrl:
            safeHttpsUrl(
              candidate.data.imageUrl,
            ),
          bookingLeadTimeDays: provider.bookingLeadTimeDays,
          source:
            candidate.providerId ===
            cateringProviderId
              ? "catering_provider"
              : "feasta_addon_provider",
        }];
      },
    )
      .sort(
        (left, right) => {
          if (
            left.source !==
            right.source
          ) {
            return left.source ===
              "catering_provider"
              ? -1
              : 1;
          }

          return left.name.localeCompare(
            right.name,
            "en",
            {
              sensitivity: "base",
            },
          );
        },
      )
      .slice(
        0,
        EVENT_SERVICE_RESULT_LIMIT,
      );

  return {
    services,
  };
}

function safeDocumentId(
  value: unknown,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized =
    value.trim().slice(0, 128);

  return normalized &&
      !normalized.includes("/")
    ? normalized
    : null;
}

function safeText(
  value: unknown,
  maximumLength: number,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value
    .trim()
    .replace(/\s+/gu, " ")
    .slice(0, maximumLength);

  return normalized || null;
}

function safeMoney(
  value: unknown,
): number | null {
  return typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= 100_000_000
    ? value
    : null;
}

function safeHttpsUrl(
  value: unknown,
): string | null {
  const text =
    safeText(value, 1000);

  if (!text) {
    return null;
  }

  try {
    const url = new URL(text);

    return url.protocol === "https:" &&
        url.username === "" &&
        url.password === "" &&
        url.port === "" &&
        url.hash === ""
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}
