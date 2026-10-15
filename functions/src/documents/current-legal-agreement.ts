import {HttpsError, onCall} from "firebase-functions/v2/https";

import {AGREEMENT_TYPES} from "../shared/agreement-types.js";
import {resolvePublishedLegalAgreement} from "../shared/published-legal-agreement.js";
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
  const agreement = resolvePublishedLegalAgreement(purpose, types, agreements);
  return {agreement};
});
