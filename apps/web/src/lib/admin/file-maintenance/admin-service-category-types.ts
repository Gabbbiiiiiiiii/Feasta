export type AdminServiceCategoryStatus =
  "active" | "discontinued";

export type AdminServiceCategoryServiceType =
  "catering" | "addon";

export type AdminServiceCategoryCapacityCapabilities = {
  requiresGuestCapacity: boolean;
  usesStaffCapacity: boolean;
  usesEquipmentCapacity: boolean;
};

export type AdminServiceCategory = {
  code: string;
  name: string;
  serviceType: AdminServiceCategoryServiceType;
  capacityCapabilities?: AdminServiceCategoryCapacityCapabilities;
  status: AdminServiceCategoryStatus;
  sortName: string;
};

export type CreateAdminServiceCategoryInput = {
  code: string;
  name: string;
  serviceType: AdminServiceCategoryServiceType;
  capacityCapabilities: AdminServiceCategoryCapacityCapabilities;
};

export type UpdateAdminServiceCategoryInput = {
  code: string;
  name: string;
  serviceType?: AdminServiceCategoryServiceType;
  capacityCapabilities: AdminServiceCategoryCapacityCapabilities;
};

export type ServiceCategoryCodeInput = {
  code: string;
};

export type AdminServiceCategoryMutationResult = {
  success: true;
  category?: AdminServiceCategory;
};
