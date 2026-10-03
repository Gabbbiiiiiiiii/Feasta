import {HttpsError, onCall} from "firebase-functions/v2/https";

import {AGREEMENT_TYPES, parseAgreementType} from "../shared/agreement-types.js";
import {agreementVersionsFromDocument} from "../shared/agreement-versions.js";
import {resolveCurrentAgreementByPurpose} from "../shared/current-agreement.js";
import {db} from "../shared/firestore.js";
import {appCheckCallableOptions} from "../shared/function-options.js";

// Public legal text is needed before registration. Raw catalog documents and
// drafts stay private; only the explicit current published projection is sent.
export const getCurrentLegalAgreement = onCall(appCheckCallableOptions, async (request) => {
  const purpose = request.data?.purpose;
  if (purpose !== "platform_terms" && purpose !== "privacy_notice") {
    throw new HttpsError("invalid-argument", "Choose Terms of Service or Privacy Policy.");
  }
  const [types, agreements] = await Promise.all([
    db.collection(AGREEMENT_TYPES).get(),
    db.collection("agreementTemplates").get(),
  ]);
  const agreement = resolveCurrentAgreementByPurpose(
    purpose,
    types.docs.flatMap((document) => {
      const type = parseAgreementType(document.id, document.data());
      return type ? [type] : [];
    }),
    agreements.docs.map((document) => {
      const data = document.data();
      return {
        code: document.id,
        agreementTypeCode: data.agreementTypeCode,
        // Unlike legacy provider onboarding, new public policies require an
        // explicit version lifecycle; top-level content is never a fallback.
        versions: Array.isArray(data.versions) && data.versions.filter(
          (version) => version?.status === "current",
        ).length === 1 ? agreementVersionsFromDocument(data).versions : [],
      };
    }),
  );
  return {agreement};
});
