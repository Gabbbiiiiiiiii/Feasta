import "server-only";

import {
  loadPrivateProviderSetupGalleryV2,
  savePrivateProviderSetupGalleryV2,
  type PrivateSetupGalleryV2,
} from "./provider-setup-gallery-v2-writer";

export type PrivateGalleryResult =
  | {ok: true; gallery: PrivateSetupGalleryV2}
  | {ok: false; code: "INVALID_REQUEST" | "UNAVAILABLE" | "CONFLICT" | "FORBIDDEN" | "INVALID_SELECTION" | "IMAGE_VERIFICATION" | "INTERNAL"; error: string};

export async function privateGalleryResult(
  operation: "load" | "save", input: unknown,
): Promise<PrivateGalleryResult> {
  try {
    const gallery = await (operation === "load"
      ? loadPrivateProviderSetupGalleryV2(input)
      : savePrivateProviderSetupGalleryV2(input));
    return {ok: true, gallery};
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/^NEXT_REDIRECT/u.test(message) || /provider|account|catering provider/iu.test(message) && /required|eligible|cannot|access/iu.test(message)) {
      return {ok: false, code: "FORBIDDEN", error: "Sign in with an authorized, active linked provider account."};
    }
    if (/changed|Reload/iu.test(message)) return {ok: false, code: "CONFLICT", error: "The gallery or its authority changed. Reload before saving."};
    if (/image|photo/iu.test(message)) return {ok: false, code: "IMAGE_VERIFICATION", error: "Setup images could not be verified. Check ownership and upload again."};
    if (/disabled|unavailable|policy|stable|scan|publication/iu.test(message)) return {ok: false, code: "UNAVAILABLE", error: "Setup Gallery V2 is unavailable. Saving and V2 publication must remain disabled."};
    if (/occasion|approvals|categories/iu.test(message)) return {ok: false, code: "INVALID_SELECTION", error: "Occasion eligibility requires review. Reload the approved selections."};
    if (/^Invalid|^Stored|^Duplicate|downgraded|identifiers/iu.test(message)) return {ok: false, code: "INVALID_REQUEST", error: "Invalid gallery version, fields, or stored records. Use the V2 contract and reload."};
    return {ok: false, code: "INTERNAL", error: "The private gallery could not be processed. Try again or contact support."};
  }
}
