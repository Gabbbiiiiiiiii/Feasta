import {HttpsError, onCall} from "firebase-functions/v2/https";

import {db} from "../shared/firestore.js";
import {appCheckCallableOptions} from "../shared/function-options.js";
import {enforceCallableRateLimit} from "../shared/rate-limit.js";

const MAX_CATEGORIES = 200;
const CODE_PATTERN = /^[a-z0-9]+(?:_[a-z0-9]+)*$/u;

export const listPublicServiceCategories = onCall(
  appCheckCallableOptions,
  async (request) => {
    const input = request.data;

    if (
      input !== null &&
      input !== undefined &&
      (
        typeof input !== "object" ||
        Array.isArray(input) ||
        Object.keys(input as Record<string, unknown>).length !== 0
      )
    ) {
      throw new HttpsError(
        "invalid-argument",
        "This catalog request accepts no parameters.",
      );
    }

    await enforceCallableRateLimit(request, {
      scope: "listPublicServiceCategories",
      limit: 60,
      windowSeconds: 3600,
    });

    const snapshot = await db
      .collection("serviceCategories")
      .where("status", "==", "active")
      .limit(MAX_CATEGORIES + 1)
      .get();

    if (snapshot.size > MAX_CATEGORIES) {
      throw new HttpsError(
        "failed-precondition",
        "Public category catalog exceeds the supported limit.",
      );
    }

    const items = snapshot.docs.flatMap((document) => {
      const data = document.data();
      const code = document.id;
      const name = data.name;
      const serviceType = data.serviceType;

      if (
        code.length < 2 ||
        code.length > 100 ||
        !CODE_PATTERN.test(code) ||
        typeof name !== "string" ||
        name.trim().length < 2 ||
        name.trim().length > 100 ||
        (
          serviceType !== "catering" &&
          serviceType !== "addon"
        )
      ) {
        return [];
      }

      return [{
        code,
        name: name.trim(),
        serviceType,
        status: "active",
      }];
    });

    items.sort((a, b) =>
      a.name.toLowerCase().localeCompare(b.name.toLowerCase()) ||
      a.code.localeCompare(b.code)
    );

    return {items};
  },
);
