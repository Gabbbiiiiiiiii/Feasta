import type {FreelanceServiceDetails} from "@feasta/shared-types/freelance-service-details";

const methods = {
  gallery: "private online gallery",
  digital_files: "online link or digital files",
  in_person: "physical delivery in person",
};

const collaboration = {
  direct: "Work directly with the provider",
  named_lead: "Work with a specific lead provider",
  team: "Coordinate with the provider’s team",
};

const pesos = new Intl.NumberFormat("en-PH", {style: "currency", currency: "PHP"});

export function freelanceServiceInclusions(details: FreelanceServiceDetails): string[] {
  const items: string[] = [];
  if (details.coverageMinutes) {
    const minutes = details.coverageMinutes;
    const coverage = minutes % 60 === 0
      ? `${minutes / 60} ${minutes === 60 ? "hour" : "hours"}`
      : `${minutes} minutes`;
    items.push(`${coverage} of event-day coverage`);
  }
  if (details.crewSize) {
    items.push(`${details.crewSize} crew ${details.crewSize === 1 ? "member" : "members"}`);
  }
  return [...items, ...(details.inclusions ?? []).map(({label}) => label)];
}

export function FreelanceServiceSummary({details, showInclusions = true}: {
  details: FreelanceServiceDetails;
  showInclusions?: boolean;
}) {
  const inclusions = showInclusions ? freelanceServiceInclusions(details) : [];
  return <div className="mt-3 space-y-3 text-sm">
    {inclusions.length > 0 ? <div>
      <p className="font-semibold">What’s included</p>
      <ul className="list-disc space-y-1 pl-5">
        {[...new Set(inclusions)].map((item) => <li key={item} className="break-words">{item}</li>)}
      </ul>
    </div> : null}
    {details.collaboration || details.collaborationNotes || details.planning?.consultationIncluded ||
      details.planning?.customShotListIncluded ? <div>
      {details.collaboration ? <p className="font-semibold">{collaboration[details.collaboration]}</p> : null}
      {details.planning?.consultationIncluded ? <p>Pre-event consultation call included</p> : null}
      {details.planning?.customShotListIncluded ? <p>Help planning which moments to capture included</p> : null}
      {details.collaborationNotes ? <p className="whitespace-pre-wrap break-words">{details.collaborationNotes}</p> : null}
    </div> : null}
    {details.clientRequirements ? <div>
      <p className="font-semibold">What to prepare</p>
      <p className="whitespace-pre-wrap break-words">{details.clientRequirements}</p>
    </div> : null}
    {details.deliverables.length ? <div>
      <p className="font-semibold">When & how customers receive it</p>
      <ul className="list-disc space-y-1 pl-5">
        {details.deliverables.map((row) => <li key={row.id} className="break-words">
          {row.name} · {row.min === row.max ? `within ${row.max}` : `${row.min}–${row.max}`} {row.max === 1 ? row.unit.slice(0, -1) : row.unit} · {methods[row.method]}
        </li>)}
      </ul>
    </div> : null}
    {details.addOns.length ? <div>
      <p className="font-semibold">Optional extras by separate quote</p>
      <p>These extras are not charged automatically at checkout.</p>
      <ul className="list-disc space-y-1 pl-5">
        {details.addOns.map((row) => <li key={row.id} className="break-words">{row.name} · {pesos.format(row.priceCentavos / 100)} per {row.unit}</li>)}
      </ul>
    </div> : null}
    {details.travelZones.length || details.distanceSurcharge ? <div>
      <p className="font-semibold">Travel fees</p>
      <p>Venues must be within the provider’s service area. Confirm applicable fees before paying.</p>
      <ul className="list-disc space-y-1 pl-5">
        {details.distanceSurcharge ? <li className="break-words">
          {pesos.format(details.distanceSurcharge.feeCentavos / 100)} for venues more than {details.distanceSurcharge.afterKm} km from {details.distanceSurcharge.from} · separate quote
        </li> : null}
        {details.travelZones.map((row) => <li key={row.id} className="break-words">
          {row.name} · {row.mode === "included" ? "Travel included" : row.feeCentavos !== null ? `${pesos.format(row.feeCentavos / 100)} travel fee by separate quote` : "Ask for a travel quote"}
        </li>)}
      </ul>
    </div> : null}
  </div>;
}
