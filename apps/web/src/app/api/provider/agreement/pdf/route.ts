import {getOptionalAccountContext} from "@/lib/auth/session";
import {loadProviderAgreementPdfDocument} from "@/lib/provider/provider-agreement-download";
import {providerAgreementContentDisposition} from "@/lib/provider/provider-agreement-record";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const account = await getOptionalAccountContext({checkRevoked: true});
  if (!account) {
    return new Response("Authentication required.", {status: 401});
  }
  if (account.role !== "provider") {
    return new Response("Access denied.", {status: 403});
  }

  const copy = new URL(request.url).searchParams.get("copy") === "accepted"
    ? "accepted"
    : "current";

  try {
    const document = await loadProviderAgreementPdfDocument({
      uid: account.uid,
      providerId: account.providerId,
      copy,
    });
    if (!document) {
      return new Response("Not found.", {status: 404});
    }
    return new Response(Buffer.from(document.bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": providerAgreementContentDisposition(document.version),
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new Response("The agreement could not be downloaded.", {status: 500});
  }
}
