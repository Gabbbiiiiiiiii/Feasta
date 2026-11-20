import {HttpsError, onCall} from "firebase-functions/v2/https";

import {requireAuth} from "../shared/auth.js";
import {requireRole} from "../shared/authorization.js";
import {USER_ROLES} from "../shared/constants.js";
import {db} from "../shared/firestore.js";
import {appCheckCallableOptions} from "../shared/function-options.js";
import {enforceCallableRateLimit} from "../shared/rate-limit.js";

type CustomerProviderTaxPreview = {
  providerId: string;
  taxStatus: "vat_registered" | "non_vat" | "unknown";
  vatRateBps: number;
};

export const getCustomerProviderTaxPreview = onCall(
  appCheckCallableOptions,
  async (request): Promise<CustomerProviderTaxPreview> => {
    const actor = requireAuth(request);

    await requireRole(actor.uid, [USER_ROLES.customer]);

    await enforceCallableRateLimit(request, {
      scope: "customerProviderTaxPreview.read",
      limit: 60,
      windowSeconds: 10 * 60,
    });

    const input = request.data;

    if (
      !input ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      Object.keys(input).length !== 1 ||
      typeof input.providerId !== "string" ||
      !/^[A-Za-z0-9_-]{1,160}$/u.test(input.providerId)
    ) {
      throw new HttpsError(
        "invalid-argument",
        "A valid provider is required.",
      );
    }

    const providerId = input.providerId;

    const [providerSnapshot, taxSnapshot] = await db.getAll(
      db.collection("providers").doc(providerId),
      db.collection("providerTaxProfiles").doc(providerId),
    );

    if (
      !providerSnapshot.exists ||
      providerSnapshot.data()?.isDeleted === true
    ) {
      throw new HttpsError(
        "not-found",
        "Provider is unavailable.",
      );
    }

    const provider = providerSnapshot.data() ?? {};
    const taxProfile = taxSnapshot.data() ?? {};

    const linked =
      taxSnapshot.exists &&
      taxProfile.providerId === providerId &&
      typeof provider.ownerId === "string" &&
      taxProfile.ownerId === provider.ownerId;

    const verified =
      linked &&
      taxProfile.verificationStatus === "verified";

    const taxStatus =
      verified && taxProfile.taxType === "vat_registered"
        ? "vat_registered"
        : verified && taxProfile.taxType === "non_vat"
          ? "non_vat"
          : "unknown";

    return {
      providerId,
      taxStatus,
      vatRateBps: taxStatus === "vat_registered" ? 1200 : 0,
    };
  },
);