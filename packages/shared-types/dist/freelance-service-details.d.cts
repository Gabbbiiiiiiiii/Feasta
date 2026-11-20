export type FreelanceServiceDetails = {
    coverageMinutes?: number;
    crewSize?: number;
    clientRequirements?: string;
    distanceSurcharge?: {
        from: string;
        afterKm: number;
        feeCentavos: number;
    };
    inclusions?: {
        id: string;
        kind: "session" | "keepsake" | "other";
        label: string;
    }[];
    planning?: {
        consultationIncluded: boolean;
        customShotListIncluded: boolean;
    };
    deliverables: {
        id: string;
        name: string;
        min: number;
        max: number;
        unit: "hours" | "days" | "weeks";
        method: "gallery" | "digital_files" | "in_person";
    }[];
    collaboration: "direct" | "named_lead" | "team" | "";
    collaborationNotes: string;
    addOns: {
        id: string;
        name: string;
        priceCentavos: number;
        unit: "booking" | "hour";
    }[];
    travelZones: {
        id: string;
        name: string;
        mode: "included" | "fixed_fee" | "quote_required";
        feeCentavos: number | null;
    }[];
};
export declare function supportsServicePackageDetails(registrationType: unknown, category: unknown): boolean;
export declare function parseFreelanceServiceDetails(value: unknown): FreelanceServiceDetails | null;
export declare function readFreelanceServiceDetails(value: unknown): FreelanceServiceDetails | null;
//# sourceMappingURL=freelance-service-details.d.cts.map