import type {
  ProviderEventType,
  ProviderServiceCategory,
  ProviderServiceType,
} from "@feasta/shared-types";

export type ProviderBusinessMedia = {
  url: string;
  publicId: string;
};

export type ProviderBusinessProfile = {
  providerId: string;
  businessName: string;
  businessEmail: string;
  businessPhone: string;
  description: string;
  address: string;
  city: string;
  province: string;
  providerServiceType: ProviderServiceType;
  primaryServiceCategory: ProviderServiceCategory | null;
  serviceCategories: readonly ProviderServiceCategory[];
  serviceAreas: readonly string[];
  eventTypesSupported: readonly ProviderEventType[];
  maxServiceDistanceKm: number | null;
  logo: ProviderBusinessMedia | null;
  coverImage: ProviderBusinessMedia | null;
  updatedAt: string | null;
};

export type UpdateProviderBusinessProfileInput = {
  businessPhone?: string;
  description?: string;
  address?: string;
  city?: string;
  province?: string;
  logo?: ProviderBusinessMedia | null;
  coverImage?: ProviderBusinessMedia | null;
};

export type UpdateProviderBusinessProfileResult = {
  providerId: string;
  updated: boolean;
  updatedFields: readonly string[];
};
