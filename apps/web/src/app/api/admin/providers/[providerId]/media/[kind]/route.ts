import {getOptionalAccountContext} from "@/lib/auth/session";
import {adminDb} from "@/lib/firebase/admin";
import {secureStorageFileResponse} from "@/lib/admin/provider-verification/secure-provider-file";

const allowedImageTypes = ["image/jpeg", "image/png", "image/webp"] as const;
const safeId = /^[A-Za-z0-9_-]{1,150}$/u;

export async function GET(
  _request: Request,
  context: {params: Promise<{providerId: string; kind: string}>},
) {
  const account = await getOptionalAccountContext({checkRevoked: true});
  if (!account) return new Response("Authentication required.", {status: 401});
  if (account.role !== "admin") {
    return new Response("Access denied.", {status: 403});
  }

  const {providerId, kind} = await context.params;
  if (
    !safeId.test(providerId) ||
    (kind !== "logo" && kind !== "cover")
  ) {
    return new Response("Not found.", {status: 404});
  }
  const providerSnapshot = await adminDb
    .collection("providers")
    .doc(providerId)
    .get();
  if (!providerSnapshot.exists) {
    return new Response("Not found.", {status: 404});
  }
  const provider = providerSnapshot.data() ?? {};
  const field = kind === "logo" ? "logoStoragePath" : "coverStoragePath";
  const storagePath = typeof provider[field] === "string"
    ? provider[field]
    : "";
  if (!storagePath.startsWith(`providers/${providerId}/${kind}/`)) {
    return new Response("Not found.", {status: 404});
  }
  return secureStorageFileResponse({
    storagePath,
    fileName: `${providerId}-${kind}`,
    disposition: "inline",
    allowedContentTypes: allowedImageTypes,
    maximumBytes: kind === "logo" ? 5 * 1024 * 1024 : 10 * 1024 * 1024,
  });
}
