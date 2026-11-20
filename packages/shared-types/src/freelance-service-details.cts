export type FreelanceServiceDetails = {
  coverageMinutes?: number;
  crewSize?: number;
  clientRequirements?: string;
  distanceSurcharge?: {from: string; afterKm: number; feeCentavos: number};
  inclusions?: {id: string; kind: "session" | "keepsake" | "other"; label: string}[];
  planning?: {consultationIncluded: boolean; customShotListIncluded: boolean};
  deliverables: {id: string; name: string; min: number; max: number; unit: "hours" | "days" | "weeks"; method: "gallery" | "digital_files" | "in_person"}[];
  collaboration: "direct" | "named_lead" | "team" | "";
  collaborationNotes: string;
  addOns: {id: string; name: string; priceCentavos: number; unit: "booking" | "hour"}[];
  travelZones: {id: string; name: string; mode: "included" | "fixed_fee" | "quote_required"; feeCentavos: number | null}[];
};

export function supportsServicePackageDetails(registrationType: unknown, category: unknown): boolean {
  return registrationType === "individual" || category === "photographer" || category === "videographer";
}

export function parseFreelanceServiceDetails(value: unknown): FreelanceServiceDetails | null {
  if (value == null) return null;
  const invalid = (): never => { throw new Error("Check the package details. Each row needs a name and valid terms."); };
  function record(input: unknown): Record<string, unknown> {
    return input && typeof input === "object" && !Array.isArray(input)
      ? input as Record<string, unknown> : invalid();
  }
  function text(input: unknown, max: number, required = true): string {
    if (typeof input !== "string" || input.trim().length > max || (required && !input.trim())) return invalid();
    return input.trim();
  }
  function integer(input: unknown, min: number, max: number): number {
    return typeof input === "number" && Number.isSafeInteger(input) && input >= min && input <= max
      ? input : invalid();
  }
  function choice<T extends string>(input: unknown, choices: readonly T[]): T {
    return choices.find((item) => item === input) ?? invalid();
  }
  function rows<T>(input: unknown, parse: (row: Record<string, unknown>) => T): T[] {
    if (!Array.isArray(input) || input.length > 10) return invalid();
    const ids = new Set<string>();
    return input.map((item) => {
      const row = record(item);
      const id = text(row.id, 64);
      if (ids.has(id)) return invalid();
      ids.add(id);
      return parse(row);
    });
  }

  const data = record(value);
  const details: FreelanceServiceDetails = {
    deliverables: rows(data.deliverables, (row) => {
      const min = integer(row.min, 1, 8760);
      const unit = choice(row.unit, ["hours", "days", "weeks"]);
      const limit = {hours: 8760, days: 365, weeks: 52}[unit];
      return {id: text(row.id, 64), name: text(row.name, 100), min,
        max: integer(row.max, min, limit), unit,
        method: choice(row.method, ["gallery", "digital_files", "in_person"])};
    }),
    collaboration: choice(data.collaboration, ["", "direct", "named_lead", "team"]),
    collaborationNotes: text(data.collaborationNotes, 400, false),
    addOns: rows(data.addOns, (row) => ({
      id: text(row.id, 64), name: text(row.name, 100),
      priceCentavos: integer(row.priceCentavos, 1, 10_000_000_000),
      unit: choice(row.unit, ["booking", "hour"]),
    })),
    travelZones: rows(data.travelZones, (row) => {
      const mode = choice(row.mode, ["included", "fixed_fee", "quote_required"]);
      return {id: text(row.id, 64), name: text(row.name, 100), mode,
        feeCentavos: mode === "fixed_fee" ? integer(row.feeCentavos, 1, 10_000_000_000) : null};
    }),
  };
  if (data.crewSize !== undefined) details.crewSize = integer(data.crewSize, 1, 100);
  if (data.clientRequirements !== undefined) {
    details.clientRequirements = text(data.clientRequirements, 500, false);
  }
  if (data.distanceSurcharge !== undefined) {
    const rule = record(data.distanceSurcharge);
    details.distanceSurcharge = {
      from: text(rule.from, 120),
      afterKm: integer(rule.afterKm, 1, 1000),
      feeCentavos: integer(rule.feeCentavos, 1, 10_000_000_000),
    };
  }
  if (data.coverageMinutes !== undefined) details.coverageMinutes = integer(data.coverageMinutes, 1, 1440);
  if (data.inclusions !== undefined) details.inclusions = rows(data.inclusions, (row) => ({
    id: text(row.id, 64), label: text(row.label, 120), kind: choice(row.kind, ["session", "keepsake", "other"]),
  }));
  if (data.planning !== undefined) {
    const {consultationIncluded, customShotListIncluded} = record(data.planning);
    if (typeof consultationIncluded !== "boolean" || typeof customShotListIncluded !== "boolean") return invalid();
    details.planning = {consultationIncluded, customShotListIncluded};
  }
  if (details.collaboration === "named_lead" && !details.collaborationNotes) return invalid();
  return details.deliverables.length || details.collaboration || details.collaborationNotes ||
    details.addOns.length || details.travelZones.length || details.coverageMinutes || details.inclusions?.length ||
    details.crewSize || details.clientRequirements || details.distanceSurcharge ||
    details.planning?.consultationIncluded || details.planning?.customShotListIncluded ? details : null;
}

export function readFreelanceServiceDetails(value: unknown): FreelanceServiceDetails | null {
  try {
    return parseFreelanceServiceDetails(value);
  } catch {
    return null;
  }
}
