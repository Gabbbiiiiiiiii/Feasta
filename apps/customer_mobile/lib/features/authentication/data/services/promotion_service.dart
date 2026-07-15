import 'dart:typed_data';

import '../../../../shared/models/promotion_model.dart';
import '../repositories/promotion_repository.dart';
import '../../../../core/constants/promotion_firestore_schema.dart';
import 'cloudinary_upload_helper.dart';

class PromotionService {
  PromotionService({PromotionRepository? repository}) : _repository = repository;

  PromotionRepository? _repository;

  PromotionRepository get _effectiveRepository {
    _repository ??= PromotionRepository();
    return _repository!;
  }

  static List<String> validatePromotionPayload({
    String? title,
    String? description,
    String? imageUrl,
    Uint8List? imageBytes,
    String? linkUrl,
    String? buttonText,
    DateTime? startDate,
    DateTime? endDate,
    int? order,
    String? promotionType,
    double? discount,
  }) {
    final errors = <String>[];

    if ((title ?? '').trim().isEmpty) {
      errors.add('Title is required.');
    }

    if ((description ?? '').trim().isEmpty) {
      errors.add('Description is required.');
    }

    if ((imageUrl ?? '').trim().isEmpty && imageBytes == null) {
      errors.add('At least one of imageUrl or imageBytes must be provided.');
    }

    if (linkUrl != null && linkUrl.trim().isNotEmpty) {
      final parsed = Uri.tryParse(linkUrl);
      if (parsed == null || (!parsed.hasScheme || !parsed.hasAuthority)) {
        errors.add('Link URL must be a valid absolute URL.');
      }
    }

    if (startDate != null && endDate != null && endDate.isBefore(startDate)) {
      errors.add('End date cannot be earlier than the start date.');
    }

    if (order != null && order < 0) {
      errors.add('Order must be zero or greater.');
    }

    if ((promotionType ?? '').trim().isEmpty) {
      errors.add('Promotion type is required.');
    }

    if (discount != null && (discount < 0 || discount > 100)) {
      errors.add('Discount must be between 0 and 100.');
    }

    return errors;
  }

  Future<PromotionModel> createPromotion({
    required String title,
    required String description,
    String? imageUrl,
    Uint8List? imageBytes,
    String? linkUrl,
    String? buttonText,
    DateTime? startDate,
    DateTime? endDate,
    int order = 0,
    bool isActive = true,
    bool isFeatured = false,
    bool isSponsored = false,
    String promotionType = '',
    String? actionType,
    String? providerId,
    String? packageId,
    String? category,
    double? discount,
    String? subtitle,
    String status = PromotionStatus.active,
  }) async {
    final errors = validatePromotionPayload(
      title: title,
      description: description,
      imageUrl: imageUrl,
      imageBytes: imageBytes,
      linkUrl: linkUrl,
      buttonText: buttonText,
      startDate: startDate,
      endDate: endDate,
      order: order,
      promotionType: promotionType,
      discount: discount,
    );

    if (errors.isNotEmpty) {
      throw FormatException(errors.join(' '));
    }

    String? uploadedImageUrl = imageUrl?.trim();

    if (imageBytes != null && imageBytes.isNotEmpty) {
      uploadedImageUrl = await CloudinaryUploadHelper.uploadFile(
        fileBytes: imageBytes,
        fileName: '${title.trim().toLowerCase().replaceAll(RegExp(r'[^a-z0-9]+'), '_')}_${DateTime.now().millisecondsSinceEpoch}.jpg',
      );
    }

    final promotion = PromotionModel(
      id: '',
      title: title.trim(),
      subtitle: subtitle?.trim(),
      description: description.trim(),
      imageUrl: uploadedImageUrl,
      linkUrl: linkUrl?.trim(),
      buttonText: (buttonText ?? '').trim().isEmpty ? 'View More' : buttonText!.trim(),
      startDate: startDate,
      endDate: endDate,
      order: order,
      isActive: isActive,
      isFeatured: isFeatured,
      isSponsored: isSponsored,
      promotionType: promotionType,
      actionType: actionType,
      providerId: providerId,
      packageId: packageId,
      category: category,
      discount: discount,
      status: status,
      createdAt: DateTime.now(),
      updatedAt: DateTime.now(),
    );

    return _effectiveRepository.createPromotion(promotion);
  }

  Future<PromotionModel?> getPromotionById(String id) async {
    return _effectiveRepository.getPromotionById(id);
  }

  Future<void> trackImpression({required String promotionId, String? providerId}) async {
    await _effectiveRepository.recordImpression(promotionId, providerId: providerId);
  }

  Future<void> trackClick({required String promotionId, String? providerId}) async {
    await _effectiveRepository.recordClick(promotionId, providerId: providerId);
  }

  Future<List<PromotionModel>> getPromotions({bool includeInactive = true}) async {
    return _effectiveRepository.getPromotions(includeInactive: includeInactive);
  }

  Stream<List<PromotionModel>> watchPromotions({bool includeInactive = true}) {
    return _effectiveRepository.watchPromotions(includeInactive: includeInactive);
  }

  Stream<List<PromotionModel>> watchActivePromotions() {
    return _effectiveRepository.watchActivePromotions();
  }

  Future<void> updatePromotion({
    required String id,
    String? title,
    String? description,
    String? imageUrl,
    Uint8List? imageBytes,
    String? linkUrl,
    String? buttonText,
    DateTime? startDate,
    DateTime? endDate,
    int? order,
    String? subtitle,
    bool? isSponsored,
    String? promotionType,
    String? actionType,
    String? providerId,
    String? packageId,
    String? category,
    double? discount,
    bool? isActive,
    bool? isFeatured,
    String? status,
  }) async {
    final errors = validatePromotionPayload(
      title: title,
      description: description,
      imageUrl: imageUrl,
      imageBytes: imageBytes,
      linkUrl: linkUrl,
      buttonText: buttonText,
      startDate: startDate,
      endDate: endDate,
      order: order,
      promotionType: promotionType,
      discount: discount,
    );

    if (errors.isNotEmpty) {
      throw FormatException(errors.join(' '));
    }

    String? uploadedImageUrl = imageUrl?.trim();

    if (imageBytes != null && imageBytes.isNotEmpty) {
      uploadedImageUrl = await CloudinaryUploadHelper.uploadFile(
        fileBytes: imageBytes,
        fileName: 'promotion_${DateTime.now().millisecondsSinceEpoch}.jpg',
      );
    }

    final payload = <String, dynamic>{};

    if (title != null) payload['title'] = title.trim();
    if (subtitle != null) payload[PromotionFirestoreSchema.subtitleField] = subtitle.trim();
    if (description != null) payload['description'] = description.trim();
    if (uploadedImageUrl != null) payload['imageUrl'] = uploadedImageUrl;
    if (linkUrl != null) payload['linkUrl'] = linkUrl.trim();
    if (buttonText != null) payload['buttonText'] = buttonText.trim();
    if (startDate != null) payload['startDate'] = startDate;
    if (endDate != null) payload['endDate'] = endDate;
    if (order != null) payload['order'] = order;
    if (isSponsored != null) payload[PromotionFirestoreSchema.isSponsoredField] = isSponsored;
    if (promotionType != null) payload[PromotionFirestoreSchema.promotionTypeField] = promotionType;
    if (actionType != null) payload[PromotionFirestoreSchema.actionTypeField] = actionType;
    if (providerId != null) payload[PromotionFirestoreSchema.providerIdField] = providerId;
    if (packageId != null) payload[PromotionFirestoreSchema.packageIdField] = packageId;
    if (category != null) payload[PromotionFirestoreSchema.categoryField] = category;
    if (discount != null) payload[PromotionFirestoreSchema.discountField] = discount;
    if (isActive != null) payload['isActive'] = isActive;
    if (isFeatured != null) payload['isFeatured'] = isFeatured;
    if (status != null) payload['status'] = status;

    await _effectiveRepository.updatePromotion(id, payload);
  }

  Future<void> deletePromotion(String id) async {
    await _effectiveRepository.deletePromotion(id);
  }
}
