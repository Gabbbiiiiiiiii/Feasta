import "server-only";

import {requireAdmin} from "@/lib/auth/session";
import {adminDb} from "@/lib/firebase/admin";

type PageProps = {
  searchParams: Promise<{providerId?: string | string[]}>;
};

type OccasionRow = {
  id: string;
  label: string;
  active: boolean;
  approved: boolean;
  categoryCompatible: boolean;
};

const validId = /^[A-Za-z0-9_-]{1,128}$/u;

export default async function AdminProviderOccasionsPage({
  searchParams,
}: PageProps) {
  await requireAdmin();

  const parameters = await searchParams;
  const rawId = parameters.providerId;
  const providerId = typeof rawId === "string" ? rawId.trim() : "";

  if (!providerId) {
    return (
      <main className="mx-auto max-w-5xl space-y-6 p-6">
        <h1 className="text-2xl font-semibold">Provider Occasion Eligibility</h1>
        <p className="text-sm text-muted-foreground">
          Review the protected occasion approvals for a provider.
          This page does not change permissions.
        </p>
        <form method="get" className="flex max-w-xl gap-3">
          <input
            name="providerId"
            aria-label="Provider ID"
            placeholder="Enter provider ID"
            required
            maxLength={128}
            className="min-w-0 flex-1 rounded-md border px-3 py-2"
          />
          <button type="submit" className="rounded-md border px-4 py-2">
            Review
          </button>
        </form>
      </main>
    );
  }

  if (!validId.test(providerId)) {
    return (
      <main className="p-6">
        <h1 className="text-xl font-semibold">Invalid provider ID</h1>
        <p>Enter a valid provider identifier.</p>
      </main>
    );
  }

  const [providerSnapshot, authoritySnapshot, catalogSnapshot] =
    await Promise.all([
      adminDb.collection("providers").doc(providerId).get(),
      adminDb.collection("providerEligibilityAuthorities").doc(providerId).get(),
      adminDb.doc("occasionCatalog/current").get(),
    ]);

  if (!providerSnapshot.exists) {
    return (
      <main className="p-6">
        <h1 className="text-xl font-semibold">Provider not found</h1>
        <p>No provider exists with the supplied identifier.</p>
      </main>
    );
  }

  const provider = providerSnapshot.data()!;
  const authority = authoritySnapshot.data();
  const catalog = catalogSnapshot.data();

  const stable =
    catalog?.activationState === "stable" &&
    Number.isSafeInteger(catalog.revision) &&
    catalog.revision > 0;

  const revisionValid =
    Number.isSafeInteger(authority?.revision) &&
    authority!.revision > 0;

  const grantsValid =
    Array.isArray(authority?.approvedOccasionIds) &&
    authority.approvedOccasionIds.length <= 200 &&
    authority.approvedOccasionIds.every(
      (id: unknown) =>
        typeof id === "string" &&
        /^[a-z][a-z0-9_]{1,63}$/u.test(id),
    ) &&
    new Set(authority.approvedOccasionIds).size ===
      authority.approvedOccasionIds.length;

  const categoriesValid =
    Array.isArray(authority?.approvedCategoryCodes) &&
    authority.approvedCategoryCodes.every(
      (code: unknown) => typeof code === "string",
    );

  const verifiedAuthority =
    revisionValid && grantsValid && categoriesValid;

  const approvedIds: string[] = verifiedAuthority
    ? authority!.approvedOccasionIds
    : [];

  const approvedCategories: string[] = verifiedAuthority
    ? authority!.approvedCategoryCodes
    : [];

  const occasionSnapshot = stable
    ? await adminDb
        .collection("occasions")
        .where("active", "==", true)
        .limit(201)
        .get()
    : null;

  const inventoryComplete =
    occasionSnapshot !== null && occasionSnapshot.size <= 200;

  const occasions: OccasionRow[] = inventoryComplete
    ? occasionSnapshot!.docs
        .filter((document) => {
          const value = document.data();
          return (
            value.id === document.id &&
            value.active === true &&
            value.moderationState === "approved" &&
            typeof value.label === "string" &&
            Array.isArray(value.applicableServiceCategoryCodes)
          );
        })
        .map((document) => {
          const value = document.data();
          return {
            id: document.id,
            label: value.label as string,
            active: true,
            approved: approvedIds.includes(document.id),
            categoryCompatible:
              Array.isArray(value.applicableServiceCategoryCodes) &&
              value.applicableServiceCategoryCodes.some(
                (code: unknown) =>
                  typeof code === "string" &&
                  approvedCategories.includes(code),
              ),
          };
        })
        .sort((a, b) => a.label.localeCompare(b.label))
    : [];

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">
          Provider Occasion Eligibility
        </h1>
        <p className="text-sm text-muted-foreground">
          Admin-only review. No approval or revocation is performed here.
        </p>
      </div>

      <form method="get" className="flex max-w-xl gap-3">
        <input
          name="providerId"
          aria-label="Provider ID"
          defaultValue={providerId}
          maxLength={128}
          required
          className="min-w-0 flex-1 rounded-md border px-3 py-2"
        />
        <button type="submit" className="rounded-md border px-4 py-2">
          Review
        </button>
      </form>

      <section className="space-y-2 rounded-lg border p-4">
        <h2 className="text-lg font-semibold">
          {typeof provider.businessName === "string"
            ? provider.businessName
            : "Provider"}
        </h2>
        <p className="break-all text-sm">Provider ID: {providerId}</p>
        <p className="text-sm">
          Verification: {String(provider.verificationStatus ?? "unknown")}
        </p>
        <p className="text-sm">
          Catalog revision: {stable ? String(catalog!.revision) : "Unavailable"}
        </p>
        <p className="text-sm">
          Eligibility revision:{" "}
          {revisionValid ? String(authority!.revision) : "Unavailable"}
        </p>
        <p className="text-sm">
          Protected authority:{" "}
          {verifiedAuthority ? "Valid structure" : "Missing or malformed"}
        </p>
        <p className="text-sm">
          Explicit approvals: {verifiedAuthority ? approvedIds.length : "Unavailable"}
        </p>
      </section>

      {!stable || !inventoryComplete || !verifiedAuthority ? (
        <p role="alert" className="rounded-md border p-4 text-sm">
          Eligibility review is incomplete. Catalog or authority evidence
          is unavailable, invalid, or exceeds the supported inventory bound.
          Do not infer approvals from legacy event types.
        </p>
      ) : (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Active approved occasions</h2>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="p-3">Occasion</th>
                  <th className="p-3">Explicit provider grant</th>
                  <th className="p-3">Approved category match</th>
                </tr>
              </thead>
              <tbody>
                {occasions.map((occasion) => (
                  <tr key={occasion.id} className="border-b">
                    <td className="p-3">
                      <div className="font-medium">{occasion.label}</div>
                      <div className="text-muted-foreground">
                        {occasion.id}
                      </div>
                    </td>
                    <td className="p-3">
                      {occasion.approved ? "Granted" : "Not granted"}
                    </td>
                    <td className="p-3">
                      {occasion.categoryCompatible ? "Matches" : "No match"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {occasions.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No active approved occasions were found.
            </p>
          )}
        </section>
      )}
    </main>
  );
}