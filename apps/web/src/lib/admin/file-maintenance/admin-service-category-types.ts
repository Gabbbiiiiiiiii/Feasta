export type AdminServiceCategoryStatus =
  "active" | "discontinued";

export type AdminServiceCategoryServiceType =
  "catering" | "addon";

export type AdminServiceCategory = {
  code: string;
  name: string;
  serviceType: AdminServiceCategoryServiceType;
  status: AdminServiceCategoryStatus;
  sortName: string;
};

export type CreateAdminServiceCategoryInput = {
  code: string;
  name: string;
  serviceType: AdminServiceCategoryServiceType;
};

export type UpdateAdminServiceCategoryInput = {
  code: string;
  name: string;
  serviceType?: AdminServiceCategoryServiceType;
};

export type ServiceCategoryCodeInput = {
  code: string;
};

export type AdminServiceCategoryMutationResult = {
  success: true;
  category?: AdminServiceCategory;
};
