import {getOptionalAccountContext} from "@/lib/auth/session";
import {getStoredAgreementVersion} from "@/lib/documents/document-catalog-service";
import {renderProviderAgreementPdf} from "@/lib/provider/provider-agreement-pdf";
import {providerAgreementContentDisposition} from "@/lib/provider/provider-agreement-record";

export const runtime = "nodejs";

const AGREEMENT_CODE = /^[a-z0-9]+(?:_[a-z0-9]+)*$/u;

export async function GET(
  request: Request,
  context: {params: Promise<{code: string}>},
): Promise<Response> {
  const account = await getOptionalAccountContext({checkRevoked: true});
  if (!account) return new Response("Authentication required.", {status: 401});
  if (account.role !== "admin") return new Response("Access denied.", {status: 403});

  const {code} = await context.params;
  const version = new URL(request.url).searchParams.get("version") ?? "";
  if (!AGREEMENT_CODE.test(code) || version.trim().length < 1 || version.trim().length > 40) {
    return new Response("Not found.", {status: 404});
  }

  try {
    const stored = await getStoredAgreementVersion(code, version);
    if (!stored) return new Response("Not found.", {status: 404});
    const bytes = await renderProviderAgreementPdf({
      name: stored.name,
      version: stored.version,
      effectiveDate: stored.effectiveDate,
      sections: stored.sections,
      acceptance: null,
    });
    return new Response(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": providerAgreementContentDisposition(stored.version),
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new Response("The agreement could not be downloaded.", {status: 500});
  }
}
