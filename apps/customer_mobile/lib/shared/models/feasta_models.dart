import 'package:cloud_firestore/cloud_firestore.dart';
import '../../core/constants/status_constants.dart';

DateTime? dateFromTimestamp(dynamic value) {
  if (value == null) return null;
  if (value is Timestamp) return value.toDate();
  return null;
}

double doubleFromValue(dynamic value) {
  if (value == null) return 0;
  if (value is int) return value.toDouble();
  if (value is double) return value;
  return 0;
}

int intFromValue(dynamic value) {
  if (value == null) return 0;
  if (value is int) return value;
  if (value is double) return value.toInt();
  return 0;
}

List<String> stringListFromValue(dynamic value) {
  if (value == null) return [];
  return List<String>.from(value);
}

List<Map<String, dynamic>> mapListFromValue(dynamic value) {
  if (value == null) return [];
  return List<Map<String, dynamic>>.from(value);
}

class UserModel {
  final String id;
  final String uid;
  final String firstName;
  final String lastName;
  final String email;
  final String phoneNumber;
  final String role;
  final String? profileImageUrl;
  final bool isEmailVerified;
  final bool isPhoneVerified;
  final bool isActive;
  final bool isBlocked;
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final DateTime? lastLoginAt;

  UserModel({
    required this.id,
    required this.uid,
    required this.firstName,
    required this.lastName,
    required this.email,
    required this.phoneNumber,
    required this.role,
    this.profileImageUrl,
    required this.isEmailVerified,
    required this.isPhoneVerified,
    required this.isActive,
    required this.isBlocked,
    this.createdAt,
    this.updatedAt,
    this.lastLoginAt,
  });

  String get fullName => '$firstName $lastName';

  factory UserModel.fromDoc(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;

    return UserModel(
      id: doc.id,
      uid: data['uid'] ?? doc.id,
      firstName: data['firstName'] ?? '',
      lastName: data['lastName'] ?? '',
      email: data['email'] ?? '',
      phoneNumber: data['phoneNumber'] ?? '',
      role: data['role'] ?? 'customer',
      profileImageUrl: data['profileImageUrl'],
      isEmailVerified: data['isEmailVerified'] ?? false,
      isPhoneVerified: data['isPhoneVerified'] ?? false,
      isActive: data['isActive'] ?? true,
      isBlocked: data['isBlocked'] ?? false,
      createdAt: dateFromTimestamp(data['createdAt']),
      updatedAt: dateFromTimestamp(data['updatedAt']),
      lastLoginAt: dateFromTimestamp(data['lastLoginAt']),
    );
  }
}

class CustomerModel {
  final String id;
  final String userId;
  final String firstName;
  final String lastName;
  final String email;
  final String phoneNumber;
  final String address;
  final String city;
  final String province;
  final String? profileImageUrl;
  final int totalBookings;
  final int completedBookings;
  final int cancelledBookings;
  final bool isActive;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  CustomerModel({
    required this.id,
    required this.userId,
    required this.firstName,
    required this.lastName,
    required this.email,
    required this.phoneNumber,
    required this.address,
    required this.city,
    required this.province,
    this.profileImageUrl,
    required this.totalBookings,
    required this.completedBookings,
    required this.cancelledBookings,
    required this.isActive,
    this.createdAt,
    this.updatedAt,
  });

  String get fullName => '$firstName $lastName';

  factory CustomerModel.fromDoc(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;

    return CustomerModel(
      id: doc.id,
      userId: data['userId'] ?? doc.id,
      firstName: data['firstName'] ?? '',
      lastName: data['lastName'] ?? '',
      email: data['email'] ?? '',
      phoneNumber: data['phoneNumber'] ?? '',
      address: data['address'] ?? '',
      city: data['city'] ?? '',
      province: data['province'] ?? '',
      profileImageUrl: data['profileImageUrl'],
      totalBookings: intFromValue(data['totalBookings']),
      completedBookings: intFromValue(data['completedBookings']),
      cancelledBookings: intFromValue(data['cancelledBookings']),
      isActive: data['isActive'] ?? true,
      createdAt: dateFromTimestamp(data['createdAt']),
      updatedAt: dateFromTimestamp(data['updatedAt']),
    );
  }
}

class ProviderModel {
  final String id;
  final String ownerId;
  final String businessName;
  final String businessEmail;
  final String businessPhone;
  final String ownerFirstName;
  final String ownerLastName;
  final String description;
  final String location;
  final String address;
  final String city;
  final String province;
  final String? coverImageUrl;
  final String? logoUrl;
  final List<String> serviceAreas;
  final List<String> eventTypesSupported;
  final double minPrice;
  final double maxPrice;
  final double ratingAverage;
  final int reviewCount;
  final int totalCompletedBookings;
  final int totalViews;
  final int favoriteCount;
  final String verificationStatus;
  final String providerServiceType;
  final String providerCategory;
  final String? businessPermitUrl;
  final String? validIdUrl;
  final String? birDocumentUrl;
  final String? dtiDocumentUrl;
  final int maxEventsPerDay;
  final int availableStaffCount;
  final int availableEquipmentCount;
  final bool acceptsMultipleEventsPerDay;
  final bool isActive;
  final bool isFeatured;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  ProviderModel({
    required this.id,
    required this.ownerId,
    required this.businessName,
    required this.businessEmail,
    required this.businessPhone,
    required this.ownerFirstName,
    required this.ownerLastName,
    required this.description,
    required this.location,
    required this.address,
    required this.city,
    required this.province,
    this.coverImageUrl,
    this.logoUrl,
    required this.serviceAreas,
    required this.eventTypesSupported,
    required this.minPrice,
    required this.maxPrice,
    required this.ratingAverage,
    required this.reviewCount,
    required this.totalCompletedBookings,
    required this.totalViews,
    required this.favoriteCount,
    required this.verificationStatus,
    required this.providerServiceType,
    required this.providerCategory,
    this.businessPermitUrl,
    this.validIdUrl,
    this.birDocumentUrl,
    this.dtiDocumentUrl,
    required this.maxEventsPerDay,
    required this.availableStaffCount,
    required this.availableEquipmentCount,
    required this.acceptsMultipleEventsPerDay,
    required this.isActive,
    required this.isFeatured,
    this.createdAt,
    this.updatedAt,
  });

  bool get isVerified => verificationStatus == 'verified';

  factory ProviderModel.fromDoc(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;

    return ProviderModel(
      id: doc.id,
      ownerId: data['ownerId'] ?? '',
      businessName: data['businessName'] ?? '',
      businessEmail: data['businessEmail'] ?? '',
      businessPhone: data['businessPhone'] ?? '',
      ownerFirstName: data['ownerFirstName'] ?? '',
      ownerLastName: data['ownerLastName'] ?? '',
      description: data['description'] ?? '',
      location: data['location'] ?? '',
      address: data['address'] ?? '',
      city: data['city'] ?? '',
      province: data['province'] ?? '',
      coverImageUrl: data['coverImageUrl'],
      logoUrl: data['logoUrl'],
      serviceAreas: stringListFromValue(data['serviceAreas']),
      eventTypesSupported: stringListFromValue(data['eventTypesSupported']),
      minPrice: doubleFromValue(data['minPrice']),
      maxPrice: doubleFromValue(data['maxPrice']),
      ratingAverage: doubleFromValue(data['ratingAverage']),
      reviewCount: intFromValue(data['reviewCount']),
      totalCompletedBookings:
          ((data['totalCompletedBookings'] ?? 0) as num).toInt(),
      totalViews: ((data['totalViews'] ?? 0) as num).toInt(),
      favoriteCount: ((data['favoriteCount'] ?? 0) as num).toInt(),
      verificationStatus: data['verificationStatus'] ?? 'pending',
      providerServiceType: data['providerServiceType'] ?? 'catering',
      providerCategory: data['providerCategory'] ?? 'catering_service',
      businessPermitUrl: data['businessPermitUrl'],
      validIdUrl: data['validIdUrl'],
      birDocumentUrl: data['birDocumentUrl'],
      dtiDocumentUrl: data['dtiDocumentUrl'],
      maxEventsPerDay: intFromValue(data['maxEventsPerDay']),
      availableStaffCount: intFromValue(data['availableStaffCount']),
      availableEquipmentCount: intFromValue(data['availableEquipmentCount']),
      acceptsMultipleEventsPerDay: data['acceptsMultipleEventsPerDay'] ?? false,
      isActive: data['isActive'] ?? true,
      isFeatured: data['isFeatured'] ?? false,
      createdAt: dateFromTimestamp(data['createdAt']),
      updatedAt: dateFromTimestamp(data['updatedAt']),
    );
  }
}

class PackageModel {
  final String id;
  final String providerId;
  final String name;
  final String description;
  final String eventType;
  final double price;
  final double downPaymentPercentage;
  final double downPaymentAmount;
  final int guestCapacity;
  final int minimumGuests;
  final int maximumGuests;
  final String? imageUrl;
  final List<String> foodInclusions;
  final List<String> decorInclusions;
  final List<String> furnitureInclusions;
  final List<String> serviceInclusions;
  final bool isCustomizable;
  final bool isActive;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  PackageModel({
    required this.id,
    required this.providerId,
    required this.name,
    required this.description,
    required this.eventType,
    required this.price,
    required this.downPaymentPercentage,
    required this.downPaymentAmount,
    required this.guestCapacity,
    required this.minimumGuests,
    required this.maximumGuests,
    this.imageUrl,
    required this.foodInclusions,
    required this.decorInclusions,
    required this.furnitureInclusions,
    required this.serviceInclusions,
    required this.isCustomizable,
    required this.isActive,
    this.createdAt,
    this.updatedAt,
  });

  factory PackageModel.fromDoc(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;

    return PackageModel(
      id: doc.id,
      providerId: data['providerId'] ?? '',
      name: data['name'] ?? '',
      description: data['description'] ?? '',
      eventType: data['eventType'] ?? '',
      price: doubleFromValue(data['price']),
      downPaymentPercentage: doubleFromValue(data['downPaymentPercentage']),
      downPaymentAmount: doubleFromValue(data['downPaymentAmount']),
      guestCapacity: intFromValue(data['guestCapacity']),
      minimumGuests: intFromValue(data['minimumGuests']),
      maximumGuests: intFromValue(data['maximumGuests']),
      imageUrl: data['imageUrl'],
      foodInclusions: stringListFromValue(data['foodInclusions']),
      decorInclusions: stringListFromValue(data['decorInclusions']),
      furnitureInclusions: stringListFromValue(data['furnitureInclusions']),
      serviceInclusions: stringListFromValue(data['serviceInclusions']),
      isCustomizable: data['isCustomizable'] ?? true,
      isActive: data['isActive'] ?? true,
      createdAt: dateFromTimestamp(data['createdAt']),
      updatedAt: dateFromTimestamp(data['updatedAt']),
    );
  }
}

class MenuItemModel {
  final String id;
  final String providerId;
  final String name;
  final String description;
  final String category;
  final double pricePerServing;
  final String? imageUrl;
  final bool isAvailable;
  final bool isActive;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  MenuItemModel({
    required this.id,
    required this.providerId,
    required this.name,
    required this.description,
    required this.category,
    required this.pricePerServing,
    this.imageUrl,
    required this.isAvailable,
    required this.isActive,
    this.createdAt,
    this.updatedAt,
  });

  factory MenuItemModel.fromDoc(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;

    return MenuItemModel(
      id: doc.id,
      providerId: data['providerId'] ?? '',
      name: data['name'] ?? '',
      description: data['description'] ?? '',
      category: data['category'] ?? '',
      pricePerServing: doubleFromValue(data['pricePerServing']),
      imageUrl: data['imageUrl'],
      isAvailable: data['isAvailable'] ?? true,
      isActive: data['isActive'] ?? true,
      createdAt: dateFromTimestamp(data['createdAt']),
      updatedAt: dateFromTimestamp(data['updatedAt']),
    );
  }
}

class AddonRequestModel {
  final String id;
  final String bookingId;
  final String addonId;
  final String addonProviderId;
  final String addonProviderBusinessName;

  final String customerId;
  final String customerFirstName;
  final String customerLastName;

  final DateTime? eventDate;
  final String eventTime;
  final String eventEndTime;
  final String eventAddress;

  final String addonName;
  final String category;
  final double price;

  final String status;

  final String linkStatus;
  final String mainBookingStatus;
  final String currentMainBookingId;
  final String originalCateringProviderId;
  final String? currentCateringProviderId;

  final String paymentStatus;
  final bool paymentRequired;
  final String paymentType;
  final String? paymentId;
  final DateTime? paidAt;

  final DateTime? acceptedAt;
  final DateTime? rejectedAt;
  final String? rejectedReason;

  final DateTime? createdAt;
  final DateTime? updatedAt;

  AddonRequestModel({
    required this.id,
    required this.bookingId,
    required this.addonId,
    required this.addonProviderId,
    required this.addonProviderBusinessName,
    required this.customerId,
    required this.customerFirstName,
    required this.customerLastName,
    required this.eventDate,
    required this.eventTime,
    required this.eventEndTime,
    required this.eventAddress,
    required this.addonName,
    required this.category,
    required this.price,
    required this.status,

    required this.linkStatus,
    required this.mainBookingStatus,
    required this.currentMainBookingId,
    required this.originalCateringProviderId,
    this.currentCateringProviderId,

    required this.paymentStatus,
    required this.paymentRequired,
    required this.paymentType,
    this.paymentId,
    this.paidAt,

    this.acceptedAt,
    this.rejectedAt,
    this.rejectedReason,
    this.createdAt,
    this.updatedAt,
  });

  factory AddonRequestModel.fromDoc(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;

    return AddonRequestModel(
      id: doc.id,
      bookingId: data['bookingId'] ?? '',
      addonId: data['addonId'] ?? '',
      addonProviderId: data['addonProviderId'] ?? '',
      addonProviderBusinessName: data['addonProviderBusinessName'] ?? '',
      customerId: data['customerId'] ?? '',
      customerFirstName: data['customerFirstName'] ?? '',
      customerLastName: data['customerLastName'] ?? '',
      eventDate: dateFromTimestamp(data['eventDate']),
      eventTime: data['eventTime'] ?? '',
      eventEndTime: data['eventEndTime'] ?? '',
      eventAddress: data['eventAddress'] ?? '',
      addonName: data['addonName'] ?? '',
      category: data['category'] ?? '',
      price: doubleFromValue(data['price']),
      status: data['status'] ?? 'pending',

      linkStatus: data['linkStatus'] ?? AddonLinkStatus.active,
      mainBookingStatus: data['mainBookingStatus'] ?? BookingStatus.pending,
      currentMainBookingId: data['currentMainBookingId'] ?? data['bookingId'] ?? '',
      originalCateringProviderId: data['originalCateringProviderId'] ?? '',
      currentCateringProviderId: data['currentCateringProviderId'],

      paymentStatus: data['paymentStatus'] ?? 'unpaid',
      paymentRequired: data['paymentRequired'] ?? true,
      paymentType: data['paymentType'] ?? 'full_payment',
      paymentId: data['paymentId'],
      paidAt: dateFromTimestamp(data['paidAt']),

      acceptedAt: dateFromTimestamp(data['acceptedAt']),
      rejectedAt: dateFromTimestamp(data['rejectedAt']),
      rejectedReason: data['rejectedReason'],
      createdAt: dateFromTimestamp(data['createdAt']),
      updatedAt: dateFromTimestamp(data['updatedAt']),
    );
  }
}

class AddonModel {
  final String id;
  final String providerId;
  final String name;
  final String description;
  final String category;
  final double price;
  final String? imageUrl;
  final bool isAvailable;
  final bool isActive;
  final String providerBusinessName;
  final String providerType;

  AddonModel({
    required this.id,
    required this.providerId,
    required this.name,
    required this.description,
    required this.category,
    required this.price,
    this.imageUrl,
    required this.isAvailable,
    required this.isActive,
    required this.providerBusinessName,
    required this.providerType,
  });

  factory AddonModel.fromDoc(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;

    return AddonModel(
      id: doc.id,
      providerId: data['providerId'] ?? '',
      name: data['name'] ?? '',
      description: data['description'] ?? '',
      category: data['category'] ?? '',
      price: doubleFromValue(data['price']),
      imageUrl: data['imageUrl'],
      isAvailable: data['isAvailable'] ?? true,
      isActive: data['isActive'] ?? true,
      providerBusinessName: data['providerBusinessName'] ?? '',
      providerType: data['providerType'] ?? 'catering_provider',
    );
  }

Map<String, dynamic> toBookingMap({
  String source = 'catering_provider',
}) {
  return {
    'addonId': id,
    'providerId': providerId,
    'providerBusinessName': providerBusinessName,
    'providerType': providerType,
    'name': name,
    'category': category,
    'price': price,
    'source': source,
  };
}
}

class BookingModel {
  final String id;
  final String bookingCode;
  final String customerId;
  final String providerId;
  final String packageId;
  final String customerFirstName;
  final String customerLastName;
  final String customerEmail;
  final String customerPhoneNumber;
  final String providerBusinessName;
  final String packageName;
  final String eventType;
  final DateTime? eventDate;
  final String eventTime;
  final String eventEndTime;
  final int guestCount;
  final String eventLocation;
  final String eventAddress;
  final List<String> selectedFoods;
  final List<String> selectedDecorations;
  final List<String> selectedFurniture;
  final List<Map<String, dynamic>> selectedAddOns;
  final bool willArrangeOwnAddOns;
  final String customerArrangedAddOnsNote;
  final String specialRequest;
  final double packagePrice;
  final double addOnsTotal;
  final double totalAmount;
  final double downPaymentPercentage;
  final double downPaymentAmount;
  final double remainingBalance;
  final String status;
  final String paymentStatus;
  final String? cancellationReason;
  final String? rejectedReason;

  final String cancellationStatus;
  final String refundStatus;
  final double refundAmount;
  final String? refundPolicyType;
  final double refundPercentage;

  final String recoveryStatus;
  final String originalProviderId;
  final String currentProviderId;
  final List<String> rejectedByProviderIds;
  final String? selectedRecoveryOfferId;
  final DateTime? recoveryOpenedAt;
  final DateTime? recoveryCompletedAt;

  final DateTime? paymentDeadline;
  final DateTime? acceptedAt;
  final DateTime? confirmedAt;
  final DateTime? completedAt;
  final DateTime? cancelledAt;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  BookingModel({
    required this.id,
    required this.bookingCode,
    required this.customerId,
    required this.providerId,
    required this.packageId,
    required this.customerFirstName,
    required this.customerLastName,
    required this.customerEmail,
    required this.customerPhoneNumber,
    required this.providerBusinessName,
    required this.packageName,
    required this.eventType,
    this.eventDate,
    required this.eventTime,
    required this.eventEndTime,
    required this.guestCount,
    required this.eventLocation,
    required this.eventAddress,
    required this.selectedFoods,
    required this.selectedDecorations,
    required this.selectedFurniture,
    required this.selectedAddOns,
    required this.willArrangeOwnAddOns,
    required this.customerArrangedAddOnsNote,
    required this.specialRequest,
    required this.packagePrice,
    required this.addOnsTotal,
    required this.totalAmount,
    required this.downPaymentPercentage,
    required this.downPaymentAmount,
    required this.remainingBalance,
    required this.status,
    required this.paymentStatus,
    this.cancellationReason,
    this.rejectedReason,

    required this.cancellationStatus,
    required this.refundStatus,
    required this.refundAmount,
    this.refundPolicyType,
    required this.refundPercentage,

    required this.recoveryStatus,
    required this.originalProviderId,
    required this.currentProviderId,
    required this.rejectedByProviderIds,
    this.selectedRecoveryOfferId,
    this.recoveryOpenedAt,
    this.recoveryCompletedAt,

    this.paymentDeadline,
    this.acceptedAt,
    this.confirmedAt,
    this.completedAt,
    this.cancelledAt,
    this.createdAt,
    this.updatedAt,
  });

  factory BookingModel.fromDoc(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;

    return BookingModel(
      id: doc.id,
      bookingCode: data['bookingCode'] ?? '',
      customerId: data['customerId'] ?? '',
      providerId: data['providerId'] ?? '',
      packageId: data['packageId'] ?? '',
      customerFirstName: data['customerFirstName'] ?? '',
      customerLastName: data['customerLastName'] ?? '',
      customerEmail: data['customerEmail'] ?? '',
      customerPhoneNumber: data['customerPhoneNumber'] ?? '',
      providerBusinessName: data['providerBusinessName'] ?? '',
      packageName: data['packageName'] ?? '',
      eventType: data['eventType'] ?? '',
      eventDate: dateFromTimestamp(data['eventDate']),
      eventTime: data['eventTime'] ?? '',
      eventEndTime: data['eventEndTime'] ?? '',
      guestCount: intFromValue(data['guestCount']),
      eventLocation: data['eventLocation'] ?? '',
      eventAddress: data['eventAddress'] ?? '',
      selectedFoods: stringListFromValue(data['selectedFoods']),
      selectedDecorations: stringListFromValue(data['selectedDecorations']),
      selectedFurniture: stringListFromValue(data['selectedFurniture']),
      selectedAddOns: mapListFromValue(data['selectedAddOns']),
      willArrangeOwnAddOns: data['willArrangeOwnAddOns'] ?? false,
      customerArrangedAddOnsNote: data['customerArrangedAddOnsNote'] ?? '',
      specialRequest: data['specialRequest'] ?? '',
      packagePrice: doubleFromValue(data['packagePrice']),
      addOnsTotal: doubleFromValue(data['addOnsTotal']),
      totalAmount: doubleFromValue(data['totalAmount']),
      downPaymentPercentage: doubleFromValue(data['downPaymentPercentage']),
      downPaymentAmount: doubleFromValue(data['downPaymentAmount']),
      remainingBalance: doubleFromValue(data['remainingBalance']),
      status: data['status'] ?? 'pending',
      paymentStatus: data['paymentStatus'] ?? 'unpaid',
      cancellationReason: data['cancellationReason'],
      rejectedReason: data['rejectedReason'],

      recoveryStatus: data['recoveryStatus'] ?? BookingRecoveryStatus.none,
      originalProviderId: data['originalProviderId'] ?? data['providerId'] ?? '',
      currentProviderId: data['currentProviderId'] ?? data['providerId'] ?? '',
      rejectedByProviderIds: stringListFromValue(data['rejectedByProviderIds']),
      selectedRecoveryOfferId: data['selectedRecoveryOfferId'],
      recoveryOpenedAt: dateFromTimestamp(data['recoveryOpenedAt']),
      recoveryCompletedAt: dateFromTimestamp(data['recoveryCompletedAt']),

      cancellationStatus: data['cancellationStatus'] ?? 'none',
      refundStatus: data['refundStatus'] ?? 'none',
      refundAmount: doubleFromValue(data['refundAmount']),
      refundPolicyType: data['refundPolicyType'],
      refundPercentage: doubleFromValue(data['refundPercentage']),

      paymentDeadline: dateFromTimestamp(data['paymentDeadline']),
      acceptedAt: dateFromTimestamp(data['acceptedAt']),
      confirmedAt: dateFromTimestamp(data['confirmedAt']),
      completedAt: dateFromTimestamp(data['completedAt']),
      cancelledAt: dateFromTimestamp(data['cancelledAt']),
      createdAt: dateFromTimestamp(data['createdAt']),
      updatedAt: dateFromTimestamp(data['updatedAt']),
    );
  }
}

class RecoveryOfferModel {
  final String id;
  final String bookingId;
  final String customerId;

  final String originalProviderId;
  final String offeringProviderId;
  final String offeringProviderBusinessName;

  final String message;
  final double estimatedPrice;
  final String status;

  final DateTime? createdAt;
  final DateTime? selectedAt;
  final DateTime? declinedAt;
  final DateTime? expiredAt;

  RecoveryOfferModel({
    required this.id,
    required this.bookingId,
    required this.customerId,
    required this.originalProviderId,
    required this.offeringProviderId,
    required this.offeringProviderBusinessName,
    required this.message,
    required this.estimatedPrice,
    required this.status,
    this.createdAt,
    this.selectedAt,
    this.declinedAt,
    this.expiredAt,
  });

  factory RecoveryOfferModel.fromDoc(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;

    return RecoveryOfferModel(
      id: doc.id,
      bookingId: data['bookingId'] ?? '',
      customerId: data['customerId'] ?? '',
      originalProviderId: data['originalProviderId'] ?? '',
      offeringProviderId: data['offeringProviderId'] ?? '',
      offeringProviderBusinessName:
          data['offeringProviderBusinessName'] ?? '',
      message: data['message'] ?? '',
      estimatedPrice: doubleFromValue(data['estimatedPrice']),
      status: data['status'] ?? 'offered',
      createdAt: dateFromTimestamp(data['createdAt']),
      selectedAt: dateFromTimestamp(data['selectedAt']),
      declinedAt: dateFromTimestamp(data['declinedAt']),
      expiredAt: dateFromTimestamp(data['expiredAt']),
    );
  }
}