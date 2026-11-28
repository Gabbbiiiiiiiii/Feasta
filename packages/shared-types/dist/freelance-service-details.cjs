"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supportsServicePackageDetails = supportsServicePackageDetails;
exports.parseFreelanceServiceDetails = parseFreelanceServiceDetails;
exports.readFreelanceServiceDetails = readFreelanceServiceDetails;
function supportsServicePackageDetails(registrationType, category) {
    return registrationType === "individual" || category === "photographer" || category === "videographer";
}
function parseFreelanceServiceDetails(value) {
    if (value == null)
        return null;
    const invalid = () => { throw new Error("Check the package details. Each row needs a name and valid terms."); };
    function record(input) {
        return input && typeof input === "object" && !Array.isArray(input)
            ? input : invalid();
    }
    function text(input, max, required = true) {
        if (typeof input !== "string" || input.trim().length > max || (required && !input.trim()))
            return invalid();
        return input.trim();
    }
    function integer(input, min, max) {
        return typeof input === "number" && Number.isSafeInteger(input) && input >= min && input <= max
            ? input : invalid();
    }
    function choice(input, choices) {
        return choices.find((item) => item === input) ?? invalid();
    }
    function rows(input, parse) {
        if (!Array.isArray(input) || input.length > 10)
            return invalid();
        const ids = new Set();
        return input.map((item) => {
            const row = record(item);
            const id = text(row.id, 64);
            if (ids.has(id))
                return invalid();
            ids.add(id);
            return parse(row);
        });
    }
    const data = record(value);
    const details = {
        deliverables: rows(data.deliverables, (row) => {
            const min = integer(row.min, 1, 8760);
            const unit = choice(row.unit, ["hours", "days", "weeks"]);
            const limit = { hours: 8760, days: 365, weeks: 52 }[unit];
            return { id: text(row.id, 64), name: text(row.name, 100), min,
                max: integer(row.max, min, limit), unit,
                method: choice(row.method, ["gallery", "digital_files", "in_person"]) };
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
            return { id: text(row.id, 64), name: text(row.name, 100), mode,
                feeCentavos: mode === "fixed_fee" ? integer(row.feeCentavos, 1, 10_000_000_000) : null };
        }),
    };
    if (data.crewSize !== undefined)
        details.crewSize = integer(data.crewSize, 1, 100);
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
    if (data.coverageMinutes !== undefined)
        details.coverageMinutes = integer(data.coverageMinutes, 1, 1440);
    if (data.inclusions !== undefined)
        details.inclusions = rows(data.inclusions, (row) => ({
            id: text(row.id, 64), label: text(row.label, 120), kind: choice(row.kind, ["session", "keepsake", "other"]),
        }));
    if (data.planning !== undefined) {
        const { consultationIncluded, customShotListIncluded } = record(data.planning);
        if (typeof consultationIncluded !== "boolean" || typeof customShotListIncluded !== "boolean")
            return invalid();
        details.planning = { consultationIncluded, customShotListIncluded };
    }
    if (details.collaboration === "named_lead" && !details.collaborationNotes)
        return invalid();
    return details.deliverables.length || details.collaboration || details.collaborationNotes ||
        details.addOns.length || details.travelZones.length || details.coverageMinutes || details.inclusions?.length ||
        details.crewSize || details.clientRequirements || details.distanceSurcharge ||
        details.planning?.consultationIncluded || details.planning?.customShotListIncluded ? details : null;
}
function readFreelanceServiceDetails(value) {
    try {
        return parseFreelanceServiceDetails(value);
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=freelance-service-details.cjs.map