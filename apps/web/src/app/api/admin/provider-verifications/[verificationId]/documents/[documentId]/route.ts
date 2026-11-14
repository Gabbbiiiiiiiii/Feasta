import {getOptionalAccountContext} from "@/lib/auth/session";
import {adminDb} from "@/lib/firebase/admin";
import {secureStorageFileResponse} from "@/lib/admin/provider-verification/secure-provider-file";

const allowedDocumentTypes = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
const maximumDocumentBytes = 10 * 1024 * 1024;
const safeId = /^[A-Za-z0-9_-]{1,150}$/u;

export async function GET(
  request: Request,
  context: {
    params: Promise<{verificationId: string; documentId: string}>;
  },
) {
  const account = await getOptionalAccountContext({checkRevoked: true});
  if (!account) return new Response("Authentication required.", {status: 401});
  if (account.role !== "admin") {
    return new Response("Access denied.", {status: 403});
  }

  const {verificationId, documentId} = await context.params;
  if (!safeId.test(verificationId) || !safeId.test(documentId)) {
    return new Response("Not found.", {status: 404});
  }
  const verificationReference = adminDb
    .collection("providerVerifications")
    .doc(verificationId);
  const [verificationSnapshot, documentSnapshot] = await Promise.all([
    verificationReference.get(),
    verificationReference.collection("documents").doc(documentId).get(),
  ]);
  if (!verificationSnapshot.exists || !documentSnapshot.exists) {
    return new Response("Not found.", {status: 404});
  }

  const verification = verificationSnapshot.data() ?? {};
  const document = documentSnapshot.data() ?? {};
  const providerId = typeof verification.providerId === "string"
    ? verification.providerId
    : "";
  const documentType = typeof document.documentType === "string"
    ? document.documentType
    : "";
  const storagePath = typeof document.storagePath === "string"
    ? document.storagePath
    : "";
  if (
    !providerId ||
    document.providerId !== providerId ||
    !storagePath.startsWith(
      `providers/${providerId}/verification/${documentType}/`,
    )
  ) {
    return new Response("Not found.", {status: 404});
  }

  const url = new URL(request.url);
  const disposition = url.searchParams.get("disposition") === "attachment"
    ? "attachment"
    : "inline";
  return secureStorageFileResponse({
    storagePath,
    fileName: typeof document.originalFileName === "string"
      ? document.originalFileName
      : `${documentType || "verification-document"}`,
    disposition,
    allowedContentTypes: allowedDocumentTypes,
    maximumBytes: maximumDocumentBytes,
  });
}
