import type {QuerySnapshot} from "firebase-admin/firestore";

import {parseAgreementType} from "./agreement-types.js";
import {agreementVersionsFromDocument} from "./agreement-versions.js";
import {resolveCurrentAgreementByPurpose} from "./current-agreement.js";

/** Shared public-display and consent authority; never falls back to legacy text. */
export function resolvePublishedLegalAgreement(
  purpose: "platform_terms" | "privacy_notice",
  types: QuerySnapshot,
  agreements: QuerySnapshot,
) {
  return resolveCurrentAgreementByPurpose(
    purpose,
    types.docs.flatMap((document) => {
      const type = parseAgreementType(document.id, document.data());
      return type && type.isActive ? [type] : [];
    }),
    agreements.docs.map((document) => {
      const data = document.data();
      const raw = data.versions;
      const parsed = agreementVersionsFromDocument(data).versions;
      // Count raw entries before parsing: malformed current entries cannot
      // disappear and turn an ambiguous lineage into an acceptable one.
      const valid = Array.isArray(raw) &&
        raw.filter((entry) => entry?.status === "current").length === 1 &&
        parsed.length === raw.length &&
        new Set(parsed.map((entry) => entry.version)).size === parsed.length &&
        parsed.every((entry) => entry.version.length <= 100 &&
          validDate(entry.effectiveDate));
      return {
        code: document.id,
        agreementTypeCode: data.agreementTypeCode,
        versions: valid ? parsed : [],
      };
    }),
  );
}

function validDate(value: string): boolean {
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value;
}
