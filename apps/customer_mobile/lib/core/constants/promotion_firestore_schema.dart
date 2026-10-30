class PromotionFirestoreSchema {
  PromotionFirestoreSchema._();

  static const String collectionName = 'promotions';
  static const String idField = 'id';
  static const String titleField = 'title';
  static const String descriptionField = 'description';
  static const String imageUrlField = 'imageUrl';
  static const String linkUrlField = 'linkUrl';
  static const String buttonTextField = 'buttonText';
  static const String startDateField = 'startDate';
  static const String endDateField = 'endDate';
  static const String orderField = 'order';
  // alias kept for clarity in admin UI
  static const String priorityField = orderField;
  static const String isActiveField = 'isActive';
  static const String isFeaturedField = 'isFeatured';
  static const String statusField = 'status';
  static const String createdAtField = 'createdAt';
  static const String updatedAtField = 'updatedAt';
  // Additional admin fields
  static const String subtitleField = 'subtitle';
  static const String promotionTypeField = 'promotionType';
  static const String actionTypeField = 'actionType';
  static const String providerIdField = 'providerId';
  static const String packageIdField = 'packageId';
  static const String categoryField = 'category';
  static const String discountField = 'discount';
  static const String isSponsoredField = 'isSponsored';
  static const String createdByField = 'createdBy';
  static const String isDeletedField = 'isDeleted';
  // Analytics and scheduling
  static const String clicksField = 'clicks';
  static const String impressionsField = 'impressions';
  static const String lastClickedAtField = 'lastClickedAt';
  static const String weeklyFeaturedField = 'weeklyFeatured';
  static const String limitedField = 'limited';
  static const String maxImpressionsField = 'maxImpressions';
  static const String maxClicksField = 'maxClicks';
}
