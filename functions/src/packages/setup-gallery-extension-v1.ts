/** Setup Gallery extension v1. Independent of the frozen Package V2 contract. */
export type SetupGalleryLegacyEventType =
  "birthday" | "wedding" | "debut" | "corporate" | "anniversary" | "other";

export interface UpdateSetupGalleryLegacyMappingRequest {
  occasionId: string;
  setupGalleryLegacyEventType: SetupGalleryLegacyEventType | null;
  expectedOccasionRevision: number;
  expectedCatalogRevision: number;
  reason: string;
  idempotencyKey: string;
}

export interface UpdateSetupGalleryLegacyMappingResponse {
  extensionVersion: 1;
  occasionId: string;
  setupGalleryLegacyEventType: SetupGalleryLegacyEventType | null;
  occasionRevision: number;
  catalogRevision: number;
  operationId: string;
}
