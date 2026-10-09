import {secureStorageFileResponse} from "@/lib/admin/provider-verification/secure-provider-file";
import {getOptionalAccountContext} from "@/lib/auth/session";
import {adminDb} from "@/lib/firebase/admin";

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

  if (!account) {
    return new Response("Authentication required.", {status: 401});
  }

  if (account.role !== "provider" || !account.providerId) {
    return new Response("Access denied.", {status: 403});
  }

  const {verificationId, documentId} = await context.params;

  if (!safeId.test(verificationId) || !safeId.test(documentId)) {
    return new Response("Not found.", {status: 404});
  }

  const verificationReference = adminDb
    .collection("providerVerifications")
    .doc(verificationId);

  const providerReference = adminDb
    .collection("providers")
    .doc(account.providerId);

  const [verificationSnapshot, documentSnapshot, providerSnapshot] =
    await Promise.all([
      verificationReference.get(),
      verificationReference
        .collection("documents")
        .doc(documentId)
        .get(),
      providerReference.get(),
    ]);

  if (
    !verificationSnapshot.exists ||
    !documentSnapshot.exists ||
    !providerSnapshot.exists
  ) {
    return new Response("Not found.", {status: 404});
  }

  const provider = providerSnapshot.data() ?? {};
  const verification = verificationSnapshot.data() ?? {};
  const document = documentSnapshot.data() ?? {};

  if (
    provider.ownerId !== account.uid ||
    verification.providerId !== account.providerId ||
    document.providerId !== account.providerId ||
    document.ownerId !== account.uid
  ) {
    return new Response("Not found.", {status: 404});
  }

  const documentType =
    typeof document.documentType === "string"
      ? document.documentType
      : "";

  const storagePath =
    typeof document.storagePath === "string"
      ? document.storagePath
      : "";

  if (
    !documentType ||
    documentType !== documentId ||
    !storagePath.startsWith(
      `providers/${account.providerId}/verification/${documentType}/`,
    )
  ) {
    return new Response("Not found.", {status: 404});
  }

  const url = new URL(request.url);

  const disposition =
    url.searchParams.get("disposition") === "attachment"
      ? "attachment"
      : "inline";

  return secureStorageFileResponse({
    storagePath,
    fileName:
      typeof document.originalFileName === "string"
        ? document.originalFileName
        : documentType,
    disposition,
    allowedContentTypes: allowedDocumentTypes,
    maximumBytes: maximumDocumentBytes,
  });
}