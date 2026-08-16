import "server-only";

import {
  FIRESTORE_COLLECTIONS,
} from "@feasta/shared-types";

import {adminDb} from "@/lib/firebase/admin";
import {
  normalizePublicProvider,
} from "@/lib/customer/providers/provider-normalization";
import {
  isPublicProviderId,
} from "@/lib/customer/providers/provider-route-policy";

import type {
  PublicEventService,
  PublicEventServicePage,
} from "./marketplace-types";

const EVENT_SERVICE_CANDIDATE_LIMIT = 60;
const EVENT_SERVICE_RESULT_LIMIT = 20;

export async function getPublicEventServices(
  cateringProviderId: string,
): Promise<PublicEventServicePage> {
  if (!isPublicProviderId(cateringProviderId)) {
    return {
      services: [],
    };
  }

  const snapshot = await adminDb
    .collection(FIRESTORE_COLLECTIONS.addons)
    .where("isActive", "==", true)
    .where("isAvailable", "==", true)
    .limit(EVENT_SERVICE_CANDIDATE_LIMIT)
    .get();

  const candidates = snapshot.docs.flatMap(
    (document) => {
      const data = document.data();

      if (data.isDeleted === true) {
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
    await adminDb.getAll(
      ...providerIds.map(
        (providerId) =>
          adminDb
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
      ? await adminDb.getAll(
          ...ownerIds.map(
            (ownerId) =>
              adminDb
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