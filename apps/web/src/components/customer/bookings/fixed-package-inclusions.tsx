import {Armchair, Check, CircleCheckBig, Palette, Soup, UsersRound, Wrench} from "lucide-react";
import type {PublicPackageDetail} from "@/lib/customer/discovery/marketplace-types";
import {cateringPackageServiceTierLabel, type CateringPackageServiceTier} from "@/lib/catering/catering-service-tier";

// Compare within each category: similar names in different categories can be distinct items.
function unique(items: readonly string[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.trim().replace(/\s+/gu, " ").toLocaleLowerCase("en");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function FixedPackageInclusions({detail, serviceTier}: {
  detail: PublicPackageDetail;
  serviceTier: CateringPackageServiceTier | null;
}) {
  const {packageRecord: record, customization: shared} = detail;
  const tier = serviceTier ? record.serviceOptions?.[serviceTier] : undefined;
  // customization is normalized directly from the published shared inclusion fields.
  const categories = [
    {label: "Food", icon: Soup, shared: record.foodInclusions ?? shared.foods, tier: []},
    {label: "Decorations", icon: Palette, shared: shared.decorations, tier: tier?.decorInclusions ?? []},
    {label: "Furniture", icon: Armchair, shared: shared.furniture, tier: tier?.furnitureInclusions ?? []},
    {label: "Services", icon: UsersRound, shared: shared.services, tier: tier?.includedServices ?? []},
    {label: "Equipment", icon: Wrench, shared: record.equipmentInclusions ?? [], tier: tier?.equipmentInclusions ?? []},
  ];
  return <section aria-labelledby="fixed-inclusions-title" className="grid gap-4 rounded-2xl border border-feasta-border-soft bg-feasta-canvas p-4 sm:p-5">
    <div className="flex items-start gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary-strong"><CircleCheckBig aria-hidden="true" className="size-5"/></span>
      <div><h3 id="fixed-inclusions-title" className="text-lg font-extrabold">Included with your package</h3>
      <p className="text-sm text-feasta-text-secondary">These published inclusions are automatically included. No selection is needed.</p></div>
    </div>
    {categories.map((category) => {
      const sharedItems = unique(category.shared);
      const sharedKeys = new Set(sharedItems.map(item => item.trim().replace(/\s+/gu, " ").toLocaleLowerCase("en")));
      const tierItems = unique(category.tier).filter(item => !sharedKeys.has(item.trim().replace(/\s+/gu, " ").toLocaleLowerCase("en")));
      if (!sharedItems.length && !tierItems.length) return null;
      const Icon = category.icon;
      return <div key={category.label} className="rounded-2xl border border-feasta-border-soft bg-white p-4">
        <h4 className="flex items-center gap-2 font-extrabold text-foreground"><Icon aria-hidden="true" className="size-5 text-primary"/>{category.label}</h4>
        {[{label: "Shared package inclusions", items: sharedItems},
          {label: serviceTier ? cateringPackageServiceTierLabel(serviceTier) + " inclusions" : "Service tier inclusions", items: tierItems}].map(group => group.items.length ?
          <div key={group.label} className="mt-2">
            <p className="text-xs font-semibold text-feasta-text-secondary">{group.label}</p>
            <ul className="mt-1 grid gap-2 sm:grid-cols-2">{group.items.map(item => <li key={item} className="flex items-start gap-2 rounded-xl bg-feasta-canvas px-3 py-2 text-sm leading-6">
              <Check aria-hidden="true" className="mt-1 size-4 shrink-0 text-primary"/><span>{item}</span>
            </li>)}</ul>
          </div> : null)}
      </div>;
    })}
    {!categories.some(category => category.shared.length || category.tier.length) ? <p className="text-sm">No fixed inclusions are published.</p> : null}
  </section>;
}
