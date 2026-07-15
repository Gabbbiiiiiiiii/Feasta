import 'package:cloud_firestore/cloud_firestore.dart';

import '../core/constants/promotion_firestore_schema.dart';

class PromotionStatus {
  PromotionStatus._();

  static const String draft = 'draft';
  static const String active = 'active';
  static const String paused = 'paused';
  static const String expired = 'expired';
}

class PromotionModel {
  final String id;
  final String title;
  final String? subtitle;
  final String description;
  final String? imageUrl;
  final String? linkUrl;
  final String buttonText;
  final DateTime? startDate;
  final DateTime? endDate;
  final int order; // used as priority
  final bool isActive;
  final bool isFeatured;
  final bool isSponsored;
  final String promotionType;
  final String? actionType;
  final String? providerId;
  final String? packageId;
  final String? category;
  final double? discount;
  final String status;
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final String? createdBy;
  final bool isDeleted;
  final int clicks;
  final int impressions;
  final DateTime? lastClickedAt;
  final bool weeklyFeatured;
  final bool limited;
  final int? maxImpressions;
  final int? maxClicks;

  const PromotionModel({
    required this.id,
    required this.title,
    this.subtitle,
    required this.description,
    this.imageUrl,
    this.linkUrl,
    required this.buttonText,
    this.startDate,
    this.endDate,
    required this.order,
    required this.isActive,
    required this.isFeatured,
    this.isSponsored = false,
    this.promotionType = '',
    this.actionType,
    this.providerId,
    this.packageId,
    this.category,
    this.discount,
    required this.status,
    this.createdAt,
    this.updatedAt,
    this.createdBy,
    this.isDeleted = false,
    this.clicks = 0,
    this.impressions = 0,
    this.lastClickedAt,
    this.weeklyFeatured = false,
    this.limited = false,
    this.maxImpressions,
    this.maxClicks,
  });

  bool get isCurrentlyActive {
    final now = DateTime.now();
    final afterStart = startDate == null || !startDate!.isAfter(now);
    final beforeEnd = endDate == null || !endDate!.isBefore(now);

    return !isDeleted && isActive && afterStart && beforeEnd;
  }

  PromotionModel copyWith({
    String? id,
    String? title,
    String? subtitle,
    String? description,
    String? imageUrl,
    String? linkUrl,
    String? buttonText,
    DateTime? startDate,
    DateTime? endDate,
    int? order,
    bool? isActive,
    bool? isFeatured,
    bool? isSponsored,
    String? promotionType,
    String? actionType,
    String? providerId,
    String? packageId,
    String? category,
    double? discount,
    String? status,
    DateTime? createdAt,
    DateTime? updatedAt,
    String? createdBy,
    bool? isDeleted,
    int? clicks,
    int? impressions,
    DateTime? lastClickedAt,
    bool? weeklyFeatured,
    bool? limited,
    int? maxImpressions,
    int? maxClicks,
  }) {
    return PromotionModel(
      id: id ?? this.id,
      title: title ?? this.title,
      subtitle: subtitle ?? this.subtitle,
      description: description ?? this.description,
      imageUrl: imageUrl ?? this.imageUrl,
      linkUrl: linkUrl ?? this.linkUrl,
      buttonText: buttonText ?? this.buttonText,
      startDate: startDate ?? this.startDate,
      endDate: endDate ?? this.endDate,
      order: order ?? this.order,
      isActive: isActive ?? this.isActive,
      isFeatured: isFeatured ?? this.isFeatured,
      isSponsored: isSponsored ?? this.isSponsored,
      promotionType: promotionType ?? this.promotionType,
      actionType: actionType ?? this.actionType,
      providerId: providerId ?? this.providerId,
      packageId: packageId ?? this.packageId,
      category: category ?? this.category,
      discount: discount ?? this.discount,
      status: status ?? this.status,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      createdBy: createdBy ?? this.createdBy,
      isDeleted: isDeleted ?? this.isDeleted,
      clicks: clicks ?? this.clicks,
      impressions: impressions ?? this.impressions,
      lastClickedAt: lastClickedAt ?? this.lastClickedAt,
      weeklyFeatured: weeklyFeatured ?? this.weeklyFeatured,
      limited: limited ?? this.limited,
      maxImpressions: maxImpressions ?? this.maxImpressions,
      maxClicks: maxClicks ?? this.maxClicks,
    );
  }

  Map<String, dynamic> toFirestoreMap() {
    return {
      PromotionFirestoreSchema.titleField: title,
      PromotionFirestoreSchema.subtitleField: subtitle,
      PromotionFirestoreSchema.descriptionField: description,
      PromotionFirestoreSchema.imageUrlField: imageUrl,
      PromotionFirestoreSchema.linkUrlField: linkUrl,
      PromotionFirestoreSchema.buttonTextField: buttonText,
      PromotionFirestoreSchema.startDateField: startDate != null ? Timestamp.fromDate(startDate!) : null,
      PromotionFirestoreSchema.endDateField: endDate != null ? Timestamp.fromDate(endDate!) : null,
      PromotionFirestoreSchema.orderField: order,
      PromotionFirestoreSchema.promotionTypeField: promotionType,
      PromotionFirestoreSchema.actionTypeField: actionType,
      PromotionFirestoreSchema.providerIdField: providerId,
      PromotionFirestoreSchema.packageIdField: packageId,
      PromotionFirestoreSchema.categoryField: category,
      PromotionFirestoreSchema.discountField: discount,
      PromotionFirestoreSchema.isSponsoredField: isSponsored,
      PromotionFirestoreSchema.isActiveField: isActive,
      PromotionFirestoreSchema.isFeaturedField: isFeatured,
      PromotionFirestoreSchema.createdByField: createdBy,
      PromotionFirestoreSchema.isDeletedField: isDeleted,
      PromotionFirestoreSchema.clicksField: clicks,
      PromotionFirestoreSchema.impressionsField: impressions,
      PromotionFirestoreSchema.lastClickedAtField: lastClickedAt != null ? Timestamp.fromDate(lastClickedAt!) : null,
      PromotionFirestoreSchema.weeklyFeaturedField: weeklyFeatured,
      PromotionFirestoreSchema.limitedField: limited,
      PromotionFirestoreSchema.maxImpressionsField: maxImpressions,
      PromotionFirestoreSchema.maxClicksField: maxClicks,
      PromotionFirestoreSchema.statusField: status,
      PromotionFirestoreSchema.updatedAtField: FieldValue.serverTimestamp(),
    };
  }

  factory PromotionModel.fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    final data = doc.data() ?? <String, dynamic>{};

    return PromotionModel(
      id: doc.id,
      title: data[PromotionFirestoreSchema.titleField]?.toString() ?? '',
      subtitle: data[PromotionFirestoreSchema.subtitleField]?.toString(),
      description: data[PromotionFirestoreSchema.descriptionField]?.toString() ?? '',
      imageUrl: data[PromotionFirestoreSchema.imageUrlField]?.toString(),
      linkUrl: data[PromotionFirestoreSchema.linkUrlField]?.toString(),
      buttonText: data[PromotionFirestoreSchema.buttonTextField]?.toString() ?? 'View More',
      startDate: _dateFromValue(data[PromotionFirestoreSchema.startDateField]),
      endDate: _dateFromValue(data[PromotionFirestoreSchema.endDateField]),
      order: data[PromotionFirestoreSchema.orderField] is int ? data[PromotionFirestoreSchema.orderField] as int : 0,
      isActive: data[PromotionFirestoreSchema.isActiveField] as bool? ?? true,
      isFeatured: data[PromotionFirestoreSchema.isFeaturedField] as bool? ?? false,
      isSponsored: data[PromotionFirestoreSchema.isSponsoredField] as bool? ?? false,
      promotionType: data[PromotionFirestoreSchema.promotionTypeField]?.toString() ?? '',
      actionType: data[PromotionFirestoreSchema.actionTypeField]?.toString(),
      providerId: data[PromotionFirestoreSchema.providerIdField]?.toString(),
      packageId: data[PromotionFirestoreSchema.packageIdField]?.toString(),
      category: data[PromotionFirestoreSchema.categoryField]?.toString(),
      discount: data[PromotionFirestoreSchema.discountField] is num ? (data[PromotionFirestoreSchema.discountField] as num).toDouble() : null,
      status: data[PromotionFirestoreSchema.statusField]?.toString() ?? PromotionStatus.active,
      createdAt: _dateFromValue(data[PromotionFirestoreSchema.createdAtField]),
      updatedAt: _dateFromValue(data[PromotionFirestoreSchema.updatedAtField]),
      createdBy: data[PromotionFirestoreSchema.createdByField]?.toString(),
      isDeleted: data[PromotionFirestoreSchema.isDeletedField] as bool? ?? false,
      clicks: data[PromotionFirestoreSchema.clicksField] is int ? data[PromotionFirestoreSchema.clicksField] as int : (data[PromotionFirestoreSchema.clicksField] is num ? (data[PromotionFirestoreSchema.clicksField] as num).toInt() : 0),
      impressions: data[PromotionFirestoreSchema.impressionsField] is int ? data[PromotionFirestoreSchema.impressionsField] as int : (data[PromotionFirestoreSchema.impressionsField] is num ? (data[PromotionFirestoreSchema.impressionsField] as num).toInt() : 0),
      lastClickedAt: _dateFromValue(data[PromotionFirestoreSchema.lastClickedAtField]),
      weeklyFeatured: data[PromotionFirestoreSchema.weeklyFeaturedField] as bool? ?? false,
      limited: data[PromotionFirestoreSchema.limitedField] as bool? ?? false,
      maxImpressions: data[PromotionFirestoreSchema.maxImpressionsField] is int ? data[PromotionFirestoreSchema.maxImpressionsField] as int : (data[PromotionFirestoreSchema.maxImpressionsField] is num ? (data[PromotionFirestoreSchema.maxImpressionsField] as num).toInt() : null),
      maxClicks: data[PromotionFirestoreSchema.maxClicksField] is int ? data[PromotionFirestoreSchema.maxClicksField] as int : (data[PromotionFirestoreSchema.maxClicksField] is num ? (data[PromotionFirestoreSchema.maxClicksField] as num).toInt() : null),
    );
  }

  double get ctr {
    if (impressions <= 0) return 0.0;
    return clicks / impressions;
  }

  static DateTime? _dateFromValue(dynamic value) {
    if (value == null) return null;
    if (value is Timestamp) return value.toDate();
    if (value is DateTime) return value;
    return null;
  }
}
