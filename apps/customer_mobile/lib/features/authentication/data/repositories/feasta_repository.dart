import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';

import '../../../../core/constants/firestore_collections.dart';
import '../../../../core/constants/status_constants.dart';
import '../../../../core/firestore/query_builder.dart';
import '../../../../shared/models/feasta_models.dart';
import '../../../../core/helpers/provider_category_helper.dart';

class FeastaRepository {
  final FirebaseFirestore _db = FirebaseFirestore.instance;
  final FirebaseAuth _auth = FirebaseAuth.instance;
  final FirebaseFunctions _functions = FirebaseFunctions.instanceFor(
    region: 'asia-southeast1',
  );

  String get currentUid {
    final user = _auth.currentUser;

    if (user == null) {
      throw Exception('User is not logged in.');
    }

    return user.uid;
  }

  Future<CustomerModel> getCurrentCustomer() async {
    final doc = await _db
        .collection(FirestoreCollections.customers)
        .doc(currentUid)
        .get();

    if (!doc.exists) {
      throw Exception('Customer profile not found.');
    }

    return CustomerModel.fromDoc(doc);
  }

  Stream<UserModel?> currentUserData() {
    return _db
        .collection(FirestoreCollections.users)
        .doc(currentUid)
        .snapshots()
        .map((doc) {
          if (!doc.exists) return null;
          return UserModel.fromDoc(doc);
        });
  }

  Future<void> incrementProviderViewCount(String providerId) async {
    await _db.collection(FirestoreCollections.providers).doc(providerId).update(
      {'totalViews': FieldValue.increment(1)},
    );
  }

  List<ProviderModel> _sortProvidersByPopularity(
    List<ProviderModel> providers,
  ) {
    providers.sort((a, b) {
      final completedBookingsCompare = b.totalCompletedBookings.compareTo(
        a.totalCompletedBookings,
      );
      if (completedBookingsCompare != 0) return completedBookingsCompare;

      final favoriteCompare = b.favoriteCount.compareTo(a.favoriteCount);
      if (favoriteCompare != 0) return favoriteCompare;

      final viewsCompare = b.totalViews.compareTo(a.totalViews);
      if (viewsCompare != 0) return viewsCompare;

      final ratingCompare = b.ratingAverage.compareTo(a.ratingAverage);
      if (ratingCompare != 0) return ratingCompare;

      final reviewCompare = b.reviewCount.compareTo(a.reviewCount);
      if (reviewCompare != 0) return reviewCompare;

      return a.businessName.toLowerCase().compareTo(
        b.businessName.toLowerCase(),
      );
    });

    return providers;
  }

  Stream<List<ProviderModel>> verifiedProviders() {
    return _db
        .collection(FirestoreCollections.providers)
        .where(
          'verificationStatus',
          isEqualTo: ProviderVerificationStatus.approved,
        )
        .where('isActive', isEqualTo: true)
        .where('providerServiceType', isEqualTo: 'catering')
        .where('isDeleted', isEqualTo: false)
        .orderBy('favoriteCount', descending: true)
        .orderBy(FieldPath.documentId, descending: true)
        .limit(20)
        .snapshots()
        .map((snapshot) {
          final providers = snapshot.docs.map(ProviderModel.fromDoc).toList();
          return _sortProvidersByPopularity(providers);
        });
  }

  Stream<List<ProviderModel>> homeCateringProviders({
    String eventType = 'All',
    bool nearOrmoc = false,
    bool rating4Plus = false,
    bool budgetFriendly = false,
  }) {
    if (eventType == 'All') {
      return _db
          .collection(FirestoreCollections.providers)
          .where(
            'verificationStatus',
            isEqualTo: ProviderVerificationStatus.approved,
          )
          .where('isActive', isEqualTo: true)
          .where('providerServiceType', isEqualTo: 'catering')
          .where('isDeleted', isEqualTo: false)
          .orderBy('favoriteCount', descending: true)
          .orderBy(FieldPath.documentId, descending: true)
          .limit(20)
          .snapshots()
          .map((snapshot) {
            var providers = snapshot.docs.map(ProviderModel.fromDoc).toList();

            if (nearOrmoc) {
              providers = providers.where((provider) {
                final location = provider.location.toLowerCase();
                final city = provider.city.toLowerCase();
                return location.contains('ormoc') || city.contains('ormoc');
              }).toList();
            }

            if (rating4Plus) {
              providers = providers
                  .where((provider) => provider.ratingAverage >= 4.0)
                  .toList();
            }

            if (budgetFriendly) {
              providers = providers
                  .where(
                    (provider) =>
                        provider.minPrice <= 15000 ||
                        provider.maxPrice <= 15000,
                  )
                  .toList();
            }

            return _sortProvidersByPopularity(providers);
          });
    }

    return _db
        .collection(FirestoreCollections.packages)
        .where('isActive', isEqualTo: true)
        .where('eventType', isEqualTo: eventType)
        .where('isDeleted', isEqualTo: false)
        .orderBy('createdAt', descending: true)
        .orderBy(FieldPath.documentId, descending: true)
        .limit(20)
        .snapshots()
        .asyncMap((snapshot) async {
          final providerIds = snapshot.docs
              .map((doc) => doc.data()['providerId'])
              .where((id) => id != null && id.toString().isNotEmpty)
              .map((id) => id.toString())
              .toSet()
              .toList();

          final providers = <ProviderModel>[];

          for (final providerId in providerIds) {
            final providerDoc = await _db
                .collection(FirestoreCollections.providers)
                .doc(providerId)
                .get();

            if (!providerDoc.exists) continue;

            final provider = ProviderModel.fromDoc(providerDoc);

            if (provider.verificationStatus !=
                ProviderVerificationStatus.approved) {
              continue;
            }

            if (!provider.isActive) {
              continue;
            }

            if (provider.providerServiceType != 'catering') {
              continue;
            }

            providers.add(provider);
          }

          var filteredProviders = providers;

          if (nearOrmoc) {
            filteredProviders = filteredProviders.where((provider) {
              final location = provider.location.toLowerCase();
              final city = provider.city.toLowerCase();
              return location.contains('ormoc') || city.contains('ormoc');
            }).toList();
          }

          if (rating4Plus) {
            filteredProviders = filteredProviders
                .where((provider) => provider.ratingAverage >= 4.0)
                .toList();
          }

          if (budgetFriendly) {
            filteredProviders = filteredProviders
                .where(
                  (provider) =>
                      provider.minPrice <= 15000 || provider.maxPrice <= 15000,
                )
                .toList();
          }

          return _sortProvidersByPopularity(filteredProviders);
        });
  }

  Stream<List<ProviderModel>> verifiedAddonProviders({
    String category = 'all',
  }) {
    return _db
        .collection(FirestoreCollections.providers)
        .where(
          'verificationStatus',
          isEqualTo: ProviderVerificationStatus.approved,
        )
        .where('isActive', isEqualTo: true)
        .where('providerServiceType', isEqualTo: 'addon')
        .where('isDeleted', isEqualTo: false)
        .orderBy('favoriteCount', descending: true)
        .orderBy(FieldPath.documentId, descending: true)
        .limit(20)
        .snapshots()
        .map((snapshot) {
          final providers = snapshot.docs.map(ProviderModel.fromDoc).toList();

          if (category == 'all') return providers;

          return providers
              .where((provider) => provider.providerCategory == category)
              .toList();
        });
  }

  Stream<List<ProviderModel>> featuredProviders() {
    return _db
        .collection(FirestoreCollections.providers)
        .where(
          'verificationStatus',
          isEqualTo: ProviderVerificationStatus.approved,
        )
        .where('isActive', isEqualTo: true)
        .where('isFeatured', isEqualTo: true)
        .where('providerServiceType', isEqualTo: 'catering')
        .where('isDeleted', isEqualTo: false)
        .orderBy('favoriteCount', descending: true)
        .orderBy(FieldPath.documentId, descending: true)
        .limit(20)
        .snapshots()
        .map((snapshot) {
          return snapshot.docs.map(ProviderModel.fromDoc).toList();
        });
  }

  Future<ProviderModel?> getProviderById(String providerId) async {
    final doc = await _db
        .collection(FirestoreCollections.providers)
        .doc(providerId)
        .get();

    if (!doc.exists) return null;

    return ProviderModel.fromDoc(doc);
  }

  Stream<List<PackageModel>> packagesByProvider(String providerId) {
    return _db
        .collection(FirestoreCollections.packages)
        .where('providerId', isEqualTo: providerId)
        .where('isActive', isEqualTo: true)
        .where('isDeleted', isEqualTo: false)
        .orderBy('createdAt', descending: true)
        .orderBy(FieldPath.documentId, descending: true)
        .limit(20)
        .snapshots()
        .map((snapshot) {
          return snapshot.docs.map(PackageModel.fromDoc).toList();
        });
  }

  Future<PackageModel?> getPackageById(String packageId) async {
    final doc = await _db
        .collection(FirestoreCollections.packages)
        .doc(packageId)
        .get();

    if (!doc.exists) return null;

    return PackageModel.fromDoc(doc);
  }

  Stream<List<AddonRequestModel>> addonRequestsByBooking(String bookingId) {
    return _db
        .collection(FirestoreCollections.addonRequests)
        .where('bookingId', isEqualTo: bookingId)
        .orderBy('createdAt', descending: true)
        .orderBy(FieldPath.documentId, descending: true)
        .limit(20)
        .snapshots()
        .map((snapshot) {
          return snapshot.docs.map(AddonRequestModel.fromDoc).toList();
        });
  }

  Stream<List<AddonModel>> addonsByProvider(String providerId) {
    return _db
        .collection(FirestoreCollections.addons)
        .where('providerId', isEqualTo: providerId)
        .where('isActive', isEqualTo: true)
        .where('isAvailable', isEqualTo: true)
        .where('isDeleted', isEqualTo: false)
        .orderBy('createdAt', descending: true)
        .orderBy(FieldPath.documentId, descending: true)
        .limit(20)
        .snapshots()
        .map((snapshot) {
          return snapshot.docs.map(AddonModel.fromDoc).toList();
        });
  }

  Future<bool> checkProviderAvailability({
    required String providerId,
    required DateTime eventDate,
    required int maxEventsPerDay,
  }) async {
    final start = DateTime(eventDate.year, eventDate.month, eventDate.day);
    final end = start.add(const Duration(days: 1));
    final boundedMaximum = maxEventsPerDay.clamp(
      1,
      QueryBuilder.maximumPageSize,
    );

    final snapshot = await _db
        .collection(FirestoreCollections.mainEvents)
        .where('providerId', isEqualTo: providerId)
        .where('eventDate', isGreaterThanOrEqualTo: Timestamp.fromDate(start))
        .where('eventDate', isLessThan: Timestamp.fromDate(end))
        .where(
          'status',
          whereIn: [
            BookingStatus.pending,
            BookingStatus.accepted,
            BookingStatus.waitingPayment,
            BookingStatus.paymentProcessing,
            BookingStatus.confirmed,
          ],
        )
        .limit(boundedMaximum)
        .get();

    return snapshot.docs.length < boundedMaximum;
  }

  Stream<List<AddonRequestModel>> addonRequestsByProviderOwner() async* {
    final provider = await getMyProviderProfile();

    if (provider == null) {
      yield [];
      return;
    }

    yield* _db
        .collection(FirestoreCollections.addonRequests)
        .where('addonProviderId', isEqualTo: provider.id)
        .orderBy('createdAt', descending: true)
        .orderBy(FieldPath.documentId, descending: true)
        .limit(20)
        .snapshots()
        .map((snapshot) {
          return snapshot.docs.map(AddonRequestModel.fromDoc).toList();
        });
  }

  Future<void> acceptAddonRequest(AddonRequestModel request) async {
    final now = FieldValue.serverTimestamp();

    final requestRef = _db
        .collection(FirestoreCollections.addonRequests)
        .doc(request.id);

    final notificationRef = _db
        .collection(FirestoreCollections.notifications)
        .doc();

    final batch = _db.batch();

    batch.update(requestRef, {
      'status': AddonRequestStatus.accepted,
      'paymentStatus': 'waiting_payment',
      'acceptedAt': now,
      'updatedAt': now,
    });

    batch.set(notificationRef, {
      'userId': request.customerId,
      'title': 'Add-on Request Accepted',
      'message':
          '${request.addonProviderBusinessName} accepted your ${request.addonName} request.',
      'type': NotificationType.booking,
      'relatedId': request.id,
      'relatedCollection': FirestoreCollections.addonRequests,
      'isRead': false,
      'readAt': null,
      'createdAt': now,
    });

    await batch.commit();
  }

  Future<void> rejectAddonRequest({
    required AddonRequestModel request,
    required String reason,
  }) async {
    final now = FieldValue.serverTimestamp();

    final requestRef = _db
        .collection(FirestoreCollections.addonRequests)
        .doc(request.id);

    final notificationRef = _db
        .collection(FirestoreCollections.notifications)
        .doc();

    final batch = _db.batch();

    batch.update(requestRef, {
      'status': AddonRequestStatus.rejected,
      'rejectedAt': now,
      'rejectedReason': reason.trim(),
      'updatedAt': now,
    });

    batch.set(notificationRef, {
      'userId': request.customerId,
      'title': 'Add-on Request Rejected',
      'message':
          '${request.addonProviderBusinessName} rejected your ${request.addonName} request.',
      'type': NotificationType.booking,
      'relatedId': request.id,
      'relatedCollection': FirestoreCollections.addonRequests,
      'isRead': false,
      'readAt': null,
      'createdAt': now,
    });

    await batch.commit();
  }

  Stream<List<RecoveryOfferModel>> recoveryOffersByBooking(String bookingId) {
    return _db
        .collection(FirestoreCollections.bookingRecoveryOffers)
        .where('bookingId', isEqualTo: bookingId)
        .where('status', isEqualTo: RecoveryOfferStatus.offered)
        .orderBy('createdAt', descending: true)
        .orderBy(FieldPath.documentId, descending: true)
        .limit(20)
        .snapshots()
        .map((snapshot) {
          return snapshot.docs.map(RecoveryOfferModel.fromDoc).toList();
        });
  }

  Future<void> selectRecoveryOffer({
    required BookingModel booking,
    required RecoveryOfferModel offer,
  }) async {
    if (booking.customerId != currentUid) {
      throw Exception('You are not allowed to select this recovery offer.');
    }

    if (booking.recoveryStatus != BookingRecoveryStatus.open &&
        booking.recoveryStatus != BookingRecoveryStatus.offerReceived) {
      throw Exception('This booking is not available for recovery selection.');
    }

    if (offer.status != RecoveryOfferStatus.offered) {
      throw Exception('This recovery offer is no longer available.');
    }

    final providerDoc = await _db
        .collection(FirestoreCollections.providers)
        .doc(offer.offeringProviderId)
        .get();

    if (!providerDoc.exists) {
      throw Exception('Selected provider no longer exists.');
    }

    final providerData = providerDoc.data() ?? {};
    final providerBusinessName =
        providerData['businessName'] ?? offer.offeringProviderBusinessName;

    final providerOwnerId = providerData['ownerId'];

    final deadline = DateTime.now().add(const Duration(hours: 24));
    final now = FieldValue.serverTimestamp();

    final batch = _db.batch();

    final bookingRef = _db
        .collection(FirestoreCollections.mainEvents)
        .doc(booking.id);

    final selectedOfferRef = _db
        .collection(FirestoreCollections.bookingRecoveryOffers)
        .doc(offer.id);

    final timelineRef = _db
        .collection(FirestoreCollections.bookingTimelines)
        .doc();

    final providerNotificationRef = _db
        .collection(FirestoreCollections.notifications)
        .doc();

    batch.update(bookingRef, {
      'providerId': offer.offeringProviderId,
      'currentProviderId': offer.offeringProviderId,
      'providerBusinessName': providerBusinessName,

      'status': BookingStatus.waitingPayment,
      'paymentStatus': PaymentStatus.unpaid,

      'recoveryStatus': BookingRecoveryStatus.completed,
      'selectedRecoveryOfferId': offer.id,
      'recoveryCompletedAt': now,

      'paymentDeadline': Timestamp.fromDate(deadline),
      'acceptedAt': now,
      'updatedAt': now,
    });

    batch.update(selectedOfferRef, {
      'status': RecoveryOfferStatus.selected,
      'selectedAt': now,
    });

    final otherOffersSnapshot = await _db
        .collection(FirestoreCollections.bookingRecoveryOffers)
        .where('bookingId', isEqualTo: booking.id)
        .where('status', isEqualTo: RecoveryOfferStatus.offered)
        .get();

    for (final doc in otherOffersSnapshot.docs) {
      if (doc.id == offer.id) continue;

      batch.update(doc.reference, {
        'status': RecoveryOfferStatus.declined,
        'declinedAt': now,
      });
    }

    final addonRequestsSnapshot = await _db
        .collection(FirestoreCollections.addonRequests)
        .where('bookingId', isEqualTo: booking.id)
        .get();

    for (final doc in addonRequestsSnapshot.docs) {
      final data = doc.data();
      final currentStatus = data['status'];

      if (currentStatus == AddonRequestStatus.cancelled ||
          currentStatus == AddonRequestStatus.rejected ||
          currentStatus == AddonRequestStatus.completed) {
        continue;
      }

      batch.update(doc.reference, {
        'linkStatus': AddonLinkStatus.relinked,
        'mainBookingStatus': BookingStatus.waitingPayment,
        'currentCateringProviderId': offer.offeringProviderId,
        'updatedAt': now,
      });
    }

    batch.set(timelineRef, {
      'bookingId': booking.id,
      'status': BookingStatus.waitingPayment,
      'title': 'Recovery Caterer Selected',
      'description':
          'Customer selected $providerBusinessName as the new catering provider. Customer must complete the down payment.',
      'createdBy': currentUid,
      'createdByRole': UserRoles.customer,
      'createdAt': now,
    });

    if (providerOwnerId != null) {
      batch.set(providerNotificationRef, {
        'userId': providerOwnerId,
        'title': 'Recovery Offer Selected',
        'message':
            '${booking.customerFirstName} ${booking.customerLastName} selected your recovery offer. Waiting for down payment.',
        'type': NotificationType.booking,
        'relatedId': booking.id,
        'relatedCollection': FirestoreCollections.mainEvents,
        'isRead': false,
        'readAt': null,
        'createdAt': now,
      });
    }

    await batch.commit();
  }

  Future<void> cancelRecoveryRequest({
    required BookingModel booking,
    required String reason,
  }) async {
    if (booking.customerId != currentUid) {
      throw Exception('You are not allowed to cancel this recovery request.');
    }

    if (booking.recoveryStatus != BookingRecoveryStatus.open &&
        booking.recoveryStatus != BookingRecoveryStatus.offerReceived) {
      throw Exception('This booking is not currently under recovery.');
    }

    final now = FieldValue.serverTimestamp();

    final batch = _db.batch();

    final bookingRef = _db
        .collection(FirestoreCollections.mainEvents)
        .doc(booking.id);

    final timelineRef = _db
        .collection(FirestoreCollections.bookingTimelines)
        .doc();

    batch.update(bookingRef, {
      'status': BookingStatus.cancelled,
      'recoveryStatus': BookingRecoveryStatus.cancelled,
      'cancellationStatus': 'approved',
      'cancellationReason': reason.trim(),
      'cancelledAt': now,
      'updatedAt': now,
    });

    batch.set(timelineRef, {
      'bookingId': booking.id,
      'status': BookingStatus.cancelled,
      'title': 'Recovery Request Cancelled',
      'description': reason.trim().isEmpty
          ? 'Customer cancelled the booking recovery request.'
          : reason.trim(),
      'createdBy': currentUid,
      'createdByRole': UserRoles.customer,
      'createdAt': now,
    });

    final offersSnapshot = await _db
        .collection(FirestoreCollections.bookingRecoveryOffers)
        .where('bookingId', isEqualTo: booking.id)
        .where('status', isEqualTo: RecoveryOfferStatus.offered)
        .get();

    for (final doc in offersSnapshot.docs) {
      batch.update(doc.reference, {
        'status': RecoveryOfferStatus.declined,
        'declinedAt': now,
      });
    }

    final addonRequestsSnapshot = await _db
        .collection(FirestoreCollections.addonRequests)
        .where('bookingId', isEqualTo: booking.id)
        .get();

    for (final doc in addonRequestsSnapshot.docs) {
      final data = doc.data();

      final currentStatus = data['status'];

      if (currentStatus == AddonRequestStatus.cancelled ||
          currentStatus == AddonRequestStatus.rejected ||
          currentStatus == AddonRequestStatus.completed) {
        continue;
      }

      final paymentStatus = data['paymentStatus'];

      batch.update(doc.reference, {
        'status': AddonRequestStatus.cancelled,
        'paymentStatus': paymentStatus == 'paid'
            ? 'refund_review'
            : 'cancelled',
        'linkStatus': AddonLinkStatus.cancelledDueToMainBookingFailed,
        'mainBookingStatus': BookingStatus.cancelled,
        'currentCateringProviderId': null,
        'updatedAt': now,
      });

      final addonProviderId = data['addonProviderId'];

      if (addonProviderId != null && addonProviderId.toString().isNotEmpty) {
        final addonProviderDoc = await _db
            .collection(FirestoreCollections.providers)
            .doc(addonProviderId)
            .get();

        final addonProviderOwnerId = addonProviderDoc.data()?['ownerId'];

        if (addonProviderOwnerId != null) {
          final addonNotificationRef = _db
              .collection(FirestoreCollections.notifications)
              .doc();

          batch.set(addonNotificationRef, {
            'userId': addonProviderOwnerId,
            'title': 'Recovery Request Cancelled',
            'message':
                '${booking.customerFirstName} ${booking.customerLastName} cancelled the recovery request. The related add-on service request was cancelled.',
            'type': NotificationType.booking,
            'relatedId': doc.id,
            'relatedCollection': FirestoreCollections.addonRequests,
            'isRead': false,
            'readAt': null,
            'createdAt': now,
          });
        }
      }
    }

    await batch.commit();
  }

  Future<String> createBookingRequest({
    required CustomerModel customer,
    required ProviderModel provider,
    required PackageModel package,
    required String eventType,
    required DateTime eventDate,
    required String eventTime,
    required String eventEndTime,
    required int guestCount,
    required String eventLocation,
    required String eventAddress,
    required List<String> selectedFoods,
    required List<String> selectedDecorations,
    required List<String> selectedFurniture,
    required List<Map<String, dynamic>> selectedAddOns,
    required bool willArrangeOwnAddOns,
    required String customerArrangedAddOnsNote,
    required String specialRequest,
  }) async {
    final cateringAddOns = selectedAddOns
        .where((addon) => addon['source'] == 'catering_provider')
        .toList();

    final marketplaceAddOns = selectedAddOns
        .where((addon) => addon['source'] == 'feasta_addon_provider')
        .toList();

    final cateringAddOnsTotal = cateringAddOns.fold<double>(
      0,
      (total, addon) => total + ((addon['price'] ?? 0) as num).toDouble(),
    );

    final marketplaceAddOnsTotal = marketplaceAddOns.fold<double>(
      0,
      (total, addon) => total + ((addon['price'] ?? 0) as num).toDouble(),
    );

    final cateringSubtotal = package.price + cateringAddOnsTotal;
    final estimatedEventTotal = cateringSubtotal + marketplaceAddOnsTotal;

    final downPaymentAmount =
        cateringSubtotal * (package.downPaymentPercentage / 100);

    final remainingBalance = cateringSubtotal - downPaymentAmount;

    final bookingRef = _db.collection(FirestoreCollections.mainEvents).doc();
    final timelineRef = _db
        .collection(FirestoreCollections.bookingTimelines)
        .doc();
    final notificationRef = _db
        .collection(FirestoreCollections.notifications)
        .doc();

    final bookingCode = 'BK${DateTime.now().millisecondsSinceEpoch}';
    final now = FieldValue.serverTimestamp();

    final batch = _db.batch();

    batch.set(bookingRef, {
      'bookingCode': bookingCode,
      'customerId': customer.userId,
      'providerId': provider.id,
      'packageId': package.id,
      'customerFirstName': customer.firstName,
      'customerLastName': customer.lastName,
      'customerEmail': customer.email,
      'customerPhoneNumber': customer.phoneNumber,
      'providerBusinessName': provider.businessName,
      'packageName': package.name,
      'eventType': eventType,
      'eventDate': Timestamp.fromDate(eventDate),
      'eventTime': eventTime,
      'eventEndTime': eventEndTime,
      'guestCount': guestCount,
      'eventLocation': eventLocation,
      'eventAddress': eventAddress,
      'selectedFoods': selectedFoods,
      'selectedDecorations': selectedDecorations,
      'selectedFurniture': selectedFurniture,
      'selectedAddOns': selectedAddOns,
      'willArrangeOwnAddOns': willArrangeOwnAddOns,
      'customerArrangedAddOnsNote': customerArrangedAddOnsNote,
      'specialRequest': specialRequest,
      'packagePrice': package.price,
      // Keep old fields for compatibility.
      // These now represent catering charges only.
      'addOnsTotal': cateringAddOnsTotal,
      'totalAmount': cateringSubtotal,
      'cateringAddOnsTotal': cateringAddOnsTotal,
      'marketplaceAddOnsTotal': marketplaceAddOnsTotal,
      'cateringSubtotal': cateringSubtotal,
      'estimatedEventTotal': estimatedEventTotal,
      'downPaymentPercentage': package.downPaymentPercentage,
      'downPaymentAmount': downPaymentAmount,
      'remainingBalance': remainingBalance,
      'status': BookingStatus.pending,
      'paymentStatus': PaymentStatus.unpaid,
      'recoveryStatus': BookingRecoveryStatus.none,
      'originalProviderId': provider.id,
      'currentProviderId': provider.id,
      'rejectedByProviderIds': [],
      'selectedRecoveryOfferId': null,
      'recoveryOpenedAt': null,
      'recoveryCompletedAt': null,
      'cancellationReason': null,
      'rejectedReason': null,
      'cancellationStatus': 'none',
      'refundStatus': 'none',
      'refundAmount': 0,
      'refundPolicyType': null,
      'refundPercentage': 0,
      'cancellationRequestedAt': null,
      'cancellationReviewedAt': null,
      'cancellationReviewedBy': null,
      'paymentDeadline': null,
      'acceptedAt': null,
      'confirmedAt': null,
      'completedAt': null,
      'cancelledAt': null,
      'createdAt': now,
      'updatedAt': now,
    });

    batch.set(timelineRef, {
      'bookingId': bookingRef.id,
      'status': BookingStatus.pending,
      'title': 'Booking Request Submitted',
      'description': 'Customer submitted a booking request.',
      'createdBy': customer.userId,
      'createdByRole': UserRoles.customer,
      'createdAt': now,
    });

    batch.set(notificationRef, {
      'userId': provider.ownerId,
      'title': 'New Booking Request',
      'message':
          '${customer.firstName} ${customer.lastName} sent a booking request.',
      'type': NotificationType.booking,
      'relatedId': bookingRef.id,
      'relatedCollection': FirestoreCollections.mainEvents,
      'isRead': false,
      'readAt': null,
      'createdAt': now,
    });

    final validMarketplaceAddOns = marketplaceAddOns.where((addon) {
      return addon['providerId'] != null &&
          addon['providerId'].toString().isNotEmpty;
    }).toList();

    for (final addon in validMarketplaceAddOns) {
      final addonProviderId = addon['providerId'].toString();

      final addonProviderDoc = await _db
          .collection(FirestoreCollections.providers)
          .doc(addonProviderId)
          .get();

      final addonProviderData = addonProviderDoc.data();

      if (addonProviderData == null) {
        continue;
      }

      final addonProviderOwnerId = addonProviderData['ownerId'];

      if (addonProviderOwnerId == null ||
          addonProviderOwnerId.toString().isEmpty) {
        continue;
      }

      final addonRequestRef = _db
          .collection(FirestoreCollections.addonRequests)
          .doc();

      final addonNotificationRef = _db
          .collection(FirestoreCollections.notifications)
          .doc();

      batch.set(addonRequestRef, {
        'bookingId': bookingRef.id,
        'currentMainBookingId': bookingRef.id,
        'originalCateringProviderId': provider.id,
        'currentCateringProviderId': provider.id,
        'linkStatus': AddonLinkStatus.active,
        'mainBookingStatus': BookingStatus.pending,
        'addonId': addon['addonId'] ?? '',
        'addonProviderId': addonProviderId,
        'addonProviderBusinessName':
            addon['providerBusinessName'] ?? 'Add-on Provider',

        'customerId': customer.userId,
        'customerFirstName': customer.firstName,
        'customerLastName': customer.lastName,

        'eventDate': Timestamp.fromDate(eventDate),
        'eventTime': eventTime,
        'eventEndTime': eventEndTime,
        'eventAddress': eventAddress,

        'addonName': addon['name'] ?? '',
        'category': addon['category'] ?? '',
        'price': ((addon['price'] ?? 0) as num).toDouble(),

        'status': AddonRequestStatus.pending,

        'paymentStatus': 'unpaid',
        'paymentRequired': true,
        'paymentType': 'full_payment',
        'paidAt': null,
        'paymentId': null,

        'acceptedAt': null,
        'rejectedAt': null,
        'rejectedReason': null,

        'createdAt': now,
        'updatedAt': now,
      });

      batch.set(addonNotificationRef, {
        'userId': addonProviderOwnerId,
        'title': 'New Add-on Service Request',
        'message':
            '${customer.firstName} ${customer.lastName} requested ${addon['name'] ?? 'your service'} for an event.',
        'type': NotificationType.booking,
        'relatedId': addonRequestRef.id,
        'relatedCollection': FirestoreCollections.addonRequests,
        'isRead': false,
        'readAt': null,
        'createdAt': now,
      });
    }

    await batch.commit();

    return bookingRef.id;
  }

  Future<void> _cancelRelatedAddonRequests({
    required WriteBatch batch,
    required String bookingId,
    required BookingModel booking,
    required FieldValue now,
    required String notificationMessage,
  }) async {
    final addonRequestsSnapshot = await _db
        .collection(FirestoreCollections.addonRequests)
        .where('bookingId', isEqualTo: bookingId)
        .get();

    for (final doc in addonRequestsSnapshot.docs) {
      final data = doc.data();

      final currentStatus = data['status'];

      if (currentStatus == AddonRequestStatus.rejected ||
          currentStatus == AddonRequestStatus.cancelled ||
          currentStatus == AddonRequestStatus.completed) {
        continue;
      }

      batch.update(doc.reference, {
        'status': AddonRequestStatus.cancelled,
        'paymentStatus': data['paymentStatus'] == 'paid'
            ? 'refund_review'
            : 'cancelled',
        'updatedAt': now,
      });

      final addonProviderId = data['addonProviderId'];

      if (addonProviderId != null) {
        final addonProviderDoc = await _db
            .collection(FirestoreCollections.providers)
            .doc(addonProviderId)
            .get();

        final addonProviderOwnerId = addonProviderDoc.data()?['ownerId'];

        if (addonProviderOwnerId != null) {
          final addonNotificationRef = _db
              .collection(FirestoreCollections.notifications)
              .doc();

          batch.set(addonNotificationRef, {
            'userId': addonProviderOwnerId,
            'title': 'Add-on Request Cancelled',
            'message': notificationMessage,
            'type': NotificationType.booking,
            'relatedId': doc.id,
            'relatedCollection': FirestoreCollections.addonRequests,
            'isRead': false,
            'readAt': null,
            'createdAt': now,
          });
        }
      }
    }
  }

  Future<void> cancelOrRequestBookingCancellation({
    required BookingModel booking,
    required String reason,
  }) async {
    final now = FieldValue.serverTimestamp();

    final bookingRef = _db
        .collection(FirestoreCollections.mainEvents)
        .doc(booking.id);

    final timelineRef = _db
        .collection(FirestoreCollections.bookingTimelines)
        .doc();

    final notificationRef = _db
        .collection(FirestoreCollections.notifications)
        .doc();

    final providerDoc = await _db
        .collection(FirestoreCollections.providers)
        .doc(booking.providerId)
        .get();

    if (!providerDoc.exists) {
      throw Exception('Provider not found.');
    }

    final providerData = providerDoc.data() ?? {};
    final providerOwnerId = providerData['ownerId'];

    final cancellationPolicy =
        providerData['cancellationPolicy'] as Map<String, dynamic>? ?? {};

    final allowBeforePayment =
        cancellationPolicy['allowCancellationBeforePayment'] ?? true;

    final allowAfterPayment =
        cancellationPolicy['allowCancellationAfterPayment'] ?? true;

    final preparationDays =
        ((cancellationPolicy['preparationDaysBeforeEvent'] ?? 3) as num)
            .toInt();

    final refundPolicyType =
        cancellationPolicy['refundPolicyType'] ?? 'provider_discretion';

    final refundPercentage =
        ((cancellationPolicy['refundPercentage'] ?? 0) as num).toDouble();

    final eventDate = booking.eventDate;

    if (eventDate == null) {
      throw Exception('Event date not found.');
    }

    final today = DateTime.now();
    final todayOnly = DateTime(today.year, today.month, today.day);
    final eventOnly = DateTime(eventDate.year, eventDate.month, eventDate.day);

    final daysBeforeEvent = eventOnly.difference(todayOnly).inDays;

    final isInsidePreparationPeriod = daysBeforeEvent <= preparationDays;

    final isUnpaidBooking =
        booking.status == BookingStatus.pending ||
        booking.status == BookingStatus.waitingPayment;

    final isPaidBooking =
        booking.status == BookingStatus.confirmed ||
        booking.paymentStatus == PaymentStatus.partiallyPaid ||
        booking.paymentStatus == PaymentStatus.paid;

    if (booking.status == BookingStatus.cancelled ||
        booking.status == BookingStatus.completed ||
        booking.status == BookingStatus.rejected ||
        booking.status == BookingStatus.expired) {
      throw Exception('This booking can no longer be cancelled.');
    }

    final batch = _db.batch();

    // CASE 1: No down payment yet, cancel directly.
    if (isUnpaidBooking) {
      if (allowBeforePayment != true) {
        throw Exception(
          'This provider does not allow cancellation before payment.',
        );
      }

      batch.update(bookingRef, {
        'status': BookingStatus.cancelled,
        'cancellationReason': reason.trim(),
        'cancellationStatus': 'approved',
        'refundStatus': 'none',
        'refundAmount': 0,
        'cancelledAt': now,
        'updatedAt': now,
      });

      batch.set(timelineRef, {
        'bookingId': booking.id,
        'status': BookingStatus.cancelled,
        'title': 'Booking Cancelled',
        'description': reason.trim().isEmpty
            ? 'Customer cancelled the unpaid booking.'
            : reason.trim(),
        'createdBy': booking.customerId,
        'createdByRole': UserRoles.customer,
        'createdAt': now,
      });

      if (providerOwnerId != null) {
        batch.set(notificationRef, {
          'userId': providerOwnerId,
          'title': 'Booking Cancelled',
          'message':
              '${booking.customerFirstName} ${booking.customerLastName} cancelled an unpaid booking request.',
          'type': NotificationType.booking,
          'relatedId': booking.id,
          'relatedCollection': FirestoreCollections.mainEvents,
          'isRead': false,
          'readAt': null,
          'createdAt': now,
        });
      }

      await _cancelRelatedAddonRequests(
        batch: batch,
        bookingId: booking.id,
        booking: booking,
        now: now,
        notificationMessage:
            '${booking.customerFirstName} ${booking.customerLastName} cancelled the booking. The related add-on service request was cancelled.',
      );

      await batch.commit();
      return;
    }

    // CASE 2: Already paid, check provider policy.
    if (isPaidBooking) {
      if (allowAfterPayment != true) {
        throw Exception(
          'This provider does not allow cancellation after payment.',
        );
      }

      if (isInsidePreparationPeriod) {
        throw Exception(
          'This booking can no longer be cancelled because it is already within the provider preparation period.',
        );
      }

      double estimatedRefundAmount = 0;

      if (refundPolicyType == 'full_refund') {
        estimatedRefundAmount = booking.downPaymentAmount;
      } else if (refundPolicyType == 'partial_refund') {
        estimatedRefundAmount =
            booking.downPaymentAmount * (refundPercentage / 100);
      } else if (refundPolicyType == 'no_refund') {
        estimatedRefundAmount = 0;
      } else {
        estimatedRefundAmount =
            booking.downPaymentAmount * (refundPercentage / 100);
      }

      batch.update(bookingRef, {
        'cancellationStatus': 'requested',
        'refundStatus': refundPolicyType == 'no_refund' ? 'none' : 'pending',
        'refundAmount': estimatedRefundAmount,
        'refundPolicyType': refundPolicyType,
        'refundPercentage': refundPercentage,
        'cancellationReason': reason.trim(),
        'cancellationRequestedAt': now,
        'updatedAt': now,
      });

      batch.set(timelineRef, {
        'bookingId': booking.id,
        'status': booking.status,
        'title': 'Cancellation Requested',
        'description': reason.trim().isEmpty
            ? 'Customer requested cancellation for a paid booking.'
            : reason.trim(),
        'createdBy': booking.customerId,
        'createdByRole': UserRoles.customer,
        'createdAt': now,
      });

      if (providerOwnerId != null) {
        batch.set(notificationRef, {
          'userId': providerOwnerId,
          'title': 'Cancellation Request',
          'message':
              '${booking.customerFirstName} ${booking.customerLastName} requested cancellation for a paid booking.',
          'type': NotificationType.booking,
          'relatedId': booking.id,
          'relatedCollection': FirestoreCollections.mainEvents,
          'isRead': false,
          'readAt': null,
          'createdAt': now,
        });
      }

      await batch.commit();
      return;
    }

    throw Exception('This booking cannot be cancelled.');
  }

  Future<void> approveCancellationRequest({
    required BookingModel booking,
  }) async {
    if (booking.status != BookingStatus.confirmed) {
      throw Exception(
        'Only confirmed bookings can be reviewed for cancellation.',
      );
    }

    final now = FieldValue.serverTimestamp();

    final bookingRef = _db
        .collection(FirestoreCollections.mainEvents)
        .doc(booking.id);

    final timelineRef = _db
        .collection(FirestoreCollections.bookingTimelines)
        .doc();

    final notificationRef = _db
        .collection(FirestoreCollections.notifications)
        .doc();

    String refundStatus = 'none';

    if (booking.refundAmount > 0) {
      refundStatus = 'approved';
    }

    final batch = _db.batch();

    batch.update(bookingRef, {
      'status': BookingStatus.cancelled,
      'cancellationStatus': 'approved',
      'refundStatus': refundStatus,
      'cancellationReviewedAt': now,
      'cancellationReviewedBy': currentUid,
      'cancelledAt': now,
      'updatedAt': now,
    });

    await _cancelRelatedAddonRequests(
      batch: batch,
      bookingId: booking.id,
      booking: booking,
      now: now,
      notificationMessage:
          '${booking.providerBusinessName} approved the cancellation request. The related add-on service request was cancelled.',
    );

    batch.set(timelineRef, {
      'bookingId': booking.id,
      'status': BookingStatus.cancelled,
      'title': 'Cancellation Approved',
      'description': refundStatus == 'approved'
          ? 'Provider approved the cancellation request. Refund is subject to provider processing.'
          : 'Provider approved the cancellation request.',
      'createdBy': currentUid,
      'createdByRole': UserRoles.provider,
      'createdAt': now,
    });

    batch.set(notificationRef, {
      'userId': booking.customerId,
      'title': 'Cancellation Approved',
      'message': refundStatus == 'approved'
          ? '${booking.providerBusinessName} approved your cancellation request. Refund is subject to provider processing.'
          : '${booking.providerBusinessName} approved your cancellation request.',
      'type': NotificationType.booking,
      'relatedId': booking.id,
      'relatedCollection': FirestoreCollections.mainEvents,
      'isRead': false,
      'readAt': null,
      'createdAt': now,
    });

    await batch.commit();
  }

  Future<void> rejectCancellationRequest({
    required BookingModel booking,
    required String reason,
  }) async {
    if (booking.status != BookingStatus.confirmed) {
      throw Exception(
        'Only confirmed bookings can be reviewed for cancellation.',
      );
    }

    final now = FieldValue.serverTimestamp();

    final bookingRef = _db
        .collection(FirestoreCollections.mainEvents)
        .doc(booking.id);

    final timelineRef = _db
        .collection(FirestoreCollections.bookingTimelines)
        .doc();

    final notificationRef = _db
        .collection(FirestoreCollections.notifications)
        .doc();

    final batch = _db.batch();

    batch.update(bookingRef, {
      'cancellationStatus': 'rejected',
      'refundStatus': 'rejected',
      'cancellationReviewedAt': now,
      'cancellationReviewedBy': currentUid,
      'updatedAt': now,
    });

    batch.set(timelineRef, {
      'bookingId': booking.id,
      'status': booking.status,
      'title': 'Cancellation Rejected',
      'description': reason.trim().isEmpty
          ? 'Provider rejected the cancellation request.'
          : reason.trim(),
      'createdBy': currentUid,
      'createdByRole': UserRoles.provider,
      'createdAt': now,
    });

    batch.set(notificationRef, {
      'userId': booking.customerId,
      'title': 'Cancellation Rejected',
      'message':
          '${booking.providerBusinessName} rejected your cancellation request.',
      'type': NotificationType.booking,
      'relatedId': booking.id,
      'relatedCollection': FirestoreCollections.mainEvents,
      'isRead': false,
      'readAt': null,
      'createdAt': now,
    });

    await batch.commit();
  }

  Stream<List<BookingModel>> customerBookings() {
    return _db
        .collection(FirestoreCollections.mainEvents)
        .where('customerId', isEqualTo: currentUid)
        .orderBy('createdAt', descending: true)
        .orderBy(FieldPath.documentId, descending: true)
        .limit(20)
        .snapshots()
        .map((snapshot) {
          return snapshot.docs.map(BookingModel.fromDoc).toList();
        });
  }

  Stream<List<BookingModel>> customerCompletedBookings() {
    return _db
        .collection(FirestoreCollections.mainEvents)
        .where('customerId', isEqualTo: currentUid)
        .where('status', isEqualTo: BookingStatus.completed)
        .orderBy('eventDate', descending: true)
        .orderBy(FieldPath.documentId, descending: true)
        .limit(20)
        .snapshots()
        .map((snapshot) {
          final bookings = snapshot.docs.map(BookingModel.fromDoc).toList();

          bookings.sort((a, b) {
            final aDate = a.completedAt ?? a.createdAt ?? DateTime(2000);
            final bDate = b.completedAt ?? b.createdAt ?? DateTime(2000);
            return bDate.compareTo(aDate);
          });

          return bookings;
        });
  }

  Stream<List<BookingModel>> providerBookings(String providerId) {
    return _db
        .collection(FirestoreCollections.mainEvents)
        .where('providerId', isEqualTo: providerId)
        .orderBy('createdAt', descending: true)
        .orderBy(FieldPath.documentId, descending: true)
        .limit(20)
        .snapshots()
        .map((snapshot) {
          return snapshot.docs.map(BookingModel.fromDoc).toList();
        });
  }

  Stream<BookingModel?> bookingById(String bookingId) {
    return _db
        .collection(FirestoreCollections.mainEvents)
        .doc(bookingId)
        .snapshots()
        .map((doc) {
          if (!doc.exists) return null;
          return BookingModel.fromDoc(doc);
        });
  }

  Stream<QuerySnapshot<Map<String, dynamic>>> bookingTimelines(
    String bookingId,
  ) {
    return _db
        .collection(FirestoreCollections.bookingTimelines)
        .where('bookingId', isEqualTo: bookingId)
        .orderBy('createdAt', descending: true)
        .orderBy(FieldPath.documentId, descending: true)
        .limit(20)
        .snapshots();
  }

  Future<void> acceptBooking({required BookingModel booking}) async {
    final deadline = DateTime.now().add(const Duration(hours: 24));
    final now = FieldValue.serverTimestamp();

    final batch = _db.batch();

    final bookingRef = _db
        .collection(FirestoreCollections.mainEvents)
        .doc(booking.id);

    final timelineRef = _db
        .collection(FirestoreCollections.bookingTimelines)
        .doc();

    final notificationRef = _db
        .collection(FirestoreCollections.notifications)
        .doc();

    batch.update(bookingRef, {
      'status': BookingStatus.waitingPayment,
      'paymentDeadline': Timestamp.fromDate(deadline),
      'acceptedAt': now,
      'updatedAt': now,
    });

    batch.set(timelineRef, {
      'bookingId': booking.id,
      'status': BookingStatus.waitingPayment,
      'title': 'Booking Request Accepted',
      'description':
          'Provider accepted the booking request. Customer must complete the down payment.',
      'createdBy': currentUid,
      'createdByRole': UserRoles.provider,
      'createdAt': now,
    });

    batch.set(notificationRef, {
      'userId': booking.customerId,
      'title': 'Booking Accepted',
      'message':
          '${booking.providerBusinessName} accepted your booking request. Please complete your down payment.',
      'type': NotificationType.booking,
      'relatedId': booking.id,
      'relatedCollection': FirestoreCollections.mainEvents,
      'isRead': false,
      'readAt': null,
      'createdAt': now,
    });

    await batch.commit();
  }

  Future<String> createPaymentRecord({
    required BookingModel booking,
    required String paymentMethod,
  }) async {
    final now = FieldValue.serverTimestamp();

    final paymentRef = _db.collection(FirestoreCollections.payments).doc();

    await paymentRef.set({
      'bookingId': booking.id,
      'customerId': booking.customerId,
      'providerId': booking.providerId,
      'amount': booking.downPaymentAmount,
      'paymentType': 'down_payment',
      'paymentMethod': paymentMethod,
      'paymongoCheckoutId': null,
      'paymongoPaymentIntentId': null,
      'paymongoReferenceNumber': null,
      'paymongoStatus': null,
      'status': PaymentRecordStatus.pending,
      'paidAt': null,
      'failedAt': null,
      'receiptUrl': null,
      'createdAt': now,
      'updatedAt': now,
    });

    return paymentRef.id;
  }

  Future<void> markDownPaymentPaid({
    required BookingModel booking,
    required String paymentId,
    String? paymongoCheckoutId,
    String? paymongoPaymentIntentId,
    String? paymongoReferenceNumber,
  }) async {
    final now = FieldValue.serverTimestamp();

    final batch = _db.batch();

    final bookingRef = _db
        .collection(FirestoreCollections.mainEvents)
        .doc(booking.id);

    final paymentRef = _db
        .collection(FirestoreCollections.payments)
        .doc(paymentId);

    final timelineRef = _db
        .collection(FirestoreCollections.bookingTimelines)
        .doc();

    final notificationRef = _db
        .collection(FirestoreCollections.notifications)
        .doc();

    batch.update(bookingRef, {
      'status': BookingStatus.confirmed,
      'paymentStatus': PaymentStatus.partiallyPaid,
      'confirmedAt': now,
      'updatedAt': now,
    });

    batch.update(paymentRef, {
      'paymongoCheckoutId': paymongoCheckoutId,
      'paymongoPaymentIntentId': paymongoPaymentIntentId,
      'paymongoReferenceNumber': paymongoReferenceNumber,
      'paymongoStatus': 'paid',
      'status': PaymentRecordStatus.paid,
      'paidAt': now,
      'failedAt': null,
      'updatedAt': now,
    });

    batch.set(timelineRef, {
      'bookingId': booking.id,
      'status': BookingStatus.confirmed,
      'title': 'Booking Confirmed',
      'description':
          'Customer completed the down payment. Booking is now confirmed.',
      'createdBy': booking.customerId,
      'createdByRole': UserRoles.customer,
      'createdAt': now,
    });

    final providerDoc = await _db
        .collection(FirestoreCollections.providers)
        .doc(booking.providerId)
        .get();

    final providerOwnerId = providerDoc.data()?['ownerId'];

    if (providerOwnerId != null) {
      batch.set(notificationRef, {
        'userId': providerOwnerId,
        'title': 'Down Payment Completed',
        'message':
            '${booking.customerFirstName} ${booking.customerLastName} completed the down payment.',
        'type': NotificationType.payment,
        'relatedId': booking.id,
        'relatedCollection': FirestoreCollections.mainEvents,
        'isRead': false,
        'readAt': null,
        'createdAt': now,
      });
    }

    final addonRequestsSnapshot = await _db
        .collection(FirestoreCollections.addonRequests)
        .where('bookingId', isEqualTo: booking.id)
        .get();

    for (final doc in addonRequestsSnapshot.docs) {
      final data = doc.data();

      final currentStatus = data['status'];

      if (currentStatus == AddonRequestStatus.cancelled ||
          currentStatus == AddonRequestStatus.rejected ||
          currentStatus == AddonRequestStatus.completed) {
        continue;
      }

      batch.update(doc.reference, {
        'mainBookingStatus': BookingStatus.confirmed,
        'linkStatus': AddonLinkStatus.active,
        'currentCateringProviderId': booking.providerId,
        'updatedAt': now,
      });

      final addonProviderId = data['addonProviderId'];

      if (addonProviderId != null && addonProviderId.toString().isNotEmpty) {
        final addonProviderDoc = await _db
            .collection(FirestoreCollections.providers)
            .doc(addonProviderId)
            .get();

        final addonProviderOwnerId = addonProviderDoc.data()?['ownerId'];

        if (addonProviderOwnerId != null) {
          final addonNotificationRef = _db
              .collection(FirestoreCollections.notifications)
              .doc();

          batch.set(addonNotificationRef, {
            'userId': addonProviderOwnerId,
            'title': 'Main Booking Confirmed',
            'message':
                '${booking.customerFirstName} ${booking.customerLastName} confirmed the main catering booking. Your add-on service request is now active.',
            'type': NotificationType.booking,
            'relatedId': doc.id,
            'relatedCollection': FirestoreCollections.addonRequests,
            'isRead': false,
            'readAt': null,
            'createdAt': now,
          });
        }
      }
    }

    await batch.commit();
  }

  Future<String> createAddonPaymentRecord({
    required BookingModel booking,
    required AddonRequestModel addonRequest,
    required String paymentMethod,
  }) async {
    if (booking.status != BookingStatus.confirmed) {
      throw Exception(
        'Main catering booking must be confirmed before paying external add-ons.',
      );
    }

    if (addonRequest.status != AddonRequestStatus.accepted) {
      throw Exception(
        'Add-on provider must accept the request before payment.',
      );
    }

    if (addonRequest.paymentStatus != 'waiting_payment') {
      throw Exception('This add-on request is not waiting for payment.');
    }

    final now = FieldValue.serverTimestamp();

    final paymentRef = _db.collection(FirestoreCollections.payments).doc();

    await paymentRef.set({
      'bookingId': booking.id,
      'addonRequestId': addonRequest.id,

      'customerId': booking.customerId,
      'providerId': addonRequest.addonProviderId,
      'recipientProviderId': addonRequest.addonProviderId,

      'paymentCategory': 'addon_payment',
      'paymentType': addonRequest.paymentType,
      'paymentMethod': paymentMethod,

      'amount': addonRequest.price,

      'paymongoCheckoutId': null,
      'paymongoPaymentIntentId': null,
      'paymongoReferenceNumber': null,
      'paymongoStatus': null,

      'status': PaymentRecordStatus.pending,
      'paidAt': null,
      'failedAt': null,
      'receiptUrl': null,

      'createdAt': now,
      'updatedAt': now,
    });

    return paymentRef.id;
  }

  Future<void> markAddonPaymentPaid({
    required BookingModel booking,
    required AddonRequestModel addonRequest,
    required String paymentId,
    String? paymongoCheckoutId,
    String? paymongoPaymentIntentId,
    String? paymongoReferenceNumber,
  }) async {
    if (booking.status != BookingStatus.confirmed) {
      throw Exception(
        'Main catering booking must be confirmed before paying external add-ons.',
      );
    }

    if (addonRequest.status != AddonRequestStatus.accepted) {
      throw Exception(
        'Add-on provider must accept the request before payment.',
      );
    }

    if (addonRequest.paymentStatus != 'waiting_payment') {
      throw Exception('This add-on request is not waiting for payment.');
    }

    final now = FieldValue.serverTimestamp();

    final batch = _db.batch();

    final addonRequestRef = _db
        .collection(FirestoreCollections.addonRequests)
        .doc(addonRequest.id);

    final paymentRef = _db
        .collection(FirestoreCollections.payments)
        .doc(paymentId);

    final notificationRef = _db
        .collection(FirestoreCollections.notifications)
        .doc();

    batch.update(addonRequestRef, {
      'paymentStatus': 'paid',
      'paymentId': paymentId,
      'paidAt': now,
      'updatedAt': now,
    });

    batch.update(paymentRef, {
      'paymongoCheckoutId': paymongoCheckoutId,
      'paymongoPaymentIntentId': paymongoPaymentIntentId,
      'paymongoReferenceNumber': paymongoReferenceNumber,
      'paymongoStatus': 'paid',
      'status': PaymentRecordStatus.paid,
      'paidAt': now,
      'failedAt': null,
      'updatedAt': now,
    });

    final addonProviderDoc = await _db
        .collection(FirestoreCollections.providers)
        .doc(addonRequest.addonProviderId)
        .get();

    final addonProviderOwnerId = addonProviderDoc.data()?['ownerId'];

    if (addonProviderOwnerId != null) {
      batch.set(notificationRef, {
        'userId': addonProviderOwnerId,
        'title': 'Add-on Payment Completed',
        'message':
            '${booking.customerFirstName} ${booking.customerLastName} paid for ${addonRequest.addonName}.',
        'type': NotificationType.payment,
        'relatedId': addonRequest.id,
        'relatedCollection': FirestoreCollections.addonRequests,
        'isRead': false,
        'readAt': null,
        'createdAt': now,
      });
    }

    await batch.commit();
  }

  Future<void> addToFavorites({required ProviderModel provider}) async {
    final favoriteId = '${currentUid}_${provider.id}';

    await _db.collection(FirestoreCollections.favorites).doc(favoriteId).set({
      'customerId': currentUid,
      'providerId': provider.id,
      'providerBusinessName': provider.businessName,
      'providerImageUrl': provider.coverImageUrl,
      'createdAt': FieldValue.serverTimestamp(),
    });

    await _db
        .collection(FirestoreCollections.providers)
        .doc(provider.id)
        .update({'favoriteCount': FieldValue.increment(1)});
  }

  Future<void> removeFromFavorites(String providerId) async {
    final favoriteId = '${currentUid}_$providerId';

    await _db
        .collection(FirestoreCollections.favorites)
        .doc(favoriteId)
        .delete();

    await _db.collection(FirestoreCollections.providers).doc(providerId).update(
      {'favoriteCount': FieldValue.increment(-1)},
    );
  }

  Stream<QuerySnapshot<Map<String, dynamic>>> myFavorites() {
    return _db
        .collection(FirestoreCollections.favorites)
        .where('customerId', isEqualTo: currentUid)
        .orderBy('createdAt', descending: true)
        .orderBy(FieldPath.documentId, descending: true)
        .limit(20)
        .snapshots();
  }

  Future<String> createChatRoom({
    required BookingModel booking,
    String? providerLogoUrl,
  }) async {
    final chatRoomId = booking.id;
    final now = FieldValue.serverTimestamp();

    await _db.collection(FirestoreCollections.chatRooms).doc(chatRoomId).set({
      'bookingId': booking.id,
      'customerId': booking.customerId,
      'providerId': booking.providerId,
      'customerFirstName': booking.customerFirstName,
      'customerLastName': booking.customerLastName,
      'providerBusinessName': booking.providerBusinessName,
      'providerLogoUrl': providerLogoUrl,
      'lastMessage': '',
      'lastMessageAt': now,
      'lastMessageSenderId': null,
      'unreadCountCustomer': 0,
      'unreadCountProvider': 0,
      'isActive': true,
      'createdAt': now,
      'updatedAt': now,
    }, SetOptions(merge: true));

    return chatRoomId;
  }

  Future<void> sendMessage({
    required String chatRoomId,
    required String senderRole,
    required String message,
    String messageType = 'text',
    String? attachmentUrl,
  }) async {
    final now = FieldValue.serverTimestamp();

    final messageRef = _db
        .collection(FirestoreCollections.chatRooms)
        .doc(chatRoomId)
        .collection(FirestoreCollections.messages)
        .doc();

    final chatRoomRef = _db
        .collection(FirestoreCollections.chatRooms)
        .doc(chatRoomId);

    final chatRoomDoc = await chatRoomRef.get();

    if (!chatRoomDoc.exists) {
      throw Exception('Chat room not found.');
    }

    final chatRoomData = chatRoomDoc.data()!;

    final customerId = chatRoomData['customerId'];
    final providerId = chatRoomData['providerId'];
    final providerBusinessName =
        chatRoomData['providerBusinessName'] ?? 'Provider';
    final customerFirstName = chatRoomData['customerFirstName'] ?? 'Customer';
    final customerLastName = chatRoomData['customerLastName'] ?? '';

    String receiverId = '';
    String notificationTitle = '';
    String notificationMessage = '';

    if (senderRole == UserRoles.customer) {
      final providerDoc = await _db
          .collection(FirestoreCollections.providers)
          .doc(providerId)
          .get();

      receiverId = providerDoc.data()?['ownerId'] ?? '';
      notificationTitle = 'New Message';
      notificationMessage =
          '$customerFirstName $customerLastName sent you a message.';
    } else if (senderRole == UserRoles.provider) {
      receiverId = customerId;
      notificationTitle = 'New Message from $providerBusinessName';
      notificationMessage = message.length > 80
          ? '${message.substring(0, 80)}...'
          : message;
    }

    final notificationRef = _db
        .collection(FirestoreCollections.notifications)
        .doc();

    final batch = _db.batch();

    batch.set(messageRef, {
      'chatRoomId': chatRoomId,
      'senderId': currentUid,
      'senderRole': senderRole,
      'message': message.trim(),
      'messageType': messageType,
      'attachmentUrl': attachmentUrl,
      'isRead': false,
      'readAt': null,
      'createdAt': now,
    });

    batch.update(chatRoomRef, {
      'lastMessage': message.trim(),
      'lastMessageAt': now,
      'lastMessageSenderId': currentUid,
      'updatedAt': now,
      if (senderRole == UserRoles.customer)
        'unreadCountProvider': FieldValue.increment(1),
      if (senderRole == UserRoles.provider)
        'unreadCountCustomer': FieldValue.increment(1),
    });

    if (receiverId.isNotEmpty) {
      batch.set(notificationRef, {
        'userId': receiverId,
        'title': notificationTitle,
        'message': notificationMessage,
        'type': NotificationType.chat,
        'relatedId': chatRoomId,
        'relatedCollection': FirestoreCollections.chatRooms,
        'isRead': false,
        'readAt': null,
        'createdAt': now,
      });
    }

    await batch.commit();
  }

  Future<void> submitReview({
    required BookingModel booking,
    required int rating,
    required String comment,
  }) async {
    try {
      await _functions.httpsCallable('submitReview').call({
        'bookingId': booking.id,
        'rating': rating,
        'comment': comment.trim(),
        'idempotencyKey': '${booking.id}_$currentUid',
      });
    } on FirebaseFunctionsException catch (error) {
      throw Exception(error.message ?? 'The review could not be submitted.');
    }
  }

  Stream<QuerySnapshot<Map<String, dynamic>>> myNotifications() {
    return _db
        .collection(FirestoreCollections.notifications)
        .where('userId', isEqualTo: currentUid)
        .orderBy('createdAt', descending: true)
        .orderBy(FieldPath.documentId, descending: true)
        .limit(20)
        .snapshots();
  }

  Future<void> markNotificationAsRead(String notificationId) async {
    await _db
        .collection(FirestoreCollections.notifications)
        .doc(notificationId)
        .update({'isRead': true, 'readAt': FieldValue.serverTimestamp()});
  }

  Future<void> markAllNotificationsAsRead() async {
    while (true) {
      final snapshot = await _db
          .collection(FirestoreCollections.notifications)
          .where('userId', isEqualTo: currentUid)
          .where('isRead', isEqualTo: false)
          .orderBy(FieldPath.documentId)
          .limit(QueryBuilder.maximumPageSize)
          .get();

      if (snapshot.docs.isEmpty) return;

      final batch = _db.batch();
      for (final doc in snapshot.docs) {
        batch.update(doc.reference, {
          'isRead': true,
          'readAt': FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();

      if (snapshot.docs.length < QueryBuilder.maximumPageSize) return;
    }
  }

  Future<ProviderModel?> getMyProviderProfile() async {
    final snapshot = await _db
        .collection(FirestoreCollections.providers)
        .where('ownerId', isEqualTo: currentUid)
        .where('isDeleted', isEqualTo: false)
        .limit(1)
        .get();

    if (snapshot.docs.isEmpty) return null;

    return ProviderModel.fromDoc(snapshot.docs.first);
  }

  Stream<List<BookingModel>> providerBookingsByOwner() async* {
    final provider = await getMyProviderProfile();

    if (provider == null) {
      yield [];
      return;
    }

    yield* _db
        .collection(FirestoreCollections.mainEvents)
        .where('providerId', isEqualTo: provider.id)
        .orderBy('createdAt', descending: true)
        .orderBy(FieldPath.documentId, descending: true)
        .limit(20)
        .snapshots()
        .map((snapshot) {
          return snapshot.docs.map(BookingModel.fromDoc).toList();
        });
  }

  Future<void> rejectBooking({
    required BookingModel booking,
    required String reason,
  }) async {
    final now = FieldValue.serverTimestamp();

    final batch = _db.batch();

    final bookingRef = _db
        .collection(FirestoreCollections.mainEvents)
        .doc(booking.id);

    final timelineRef = _db
        .collection(FirestoreCollections.bookingTimelines)
        .doc();

    final customerNotificationRef = _db
        .collection(FirestoreCollections.notifications)
        .doc();

    batch.update(bookingRef, {
      'status': BookingStatus.rejected,
      'rejectedReason': reason.trim(),

      // Recovery opens after original caterer rejects.
      'recoveryStatus': BookingRecoveryStatus.open,
      'recoveryOpenedAt': now,
      'rejectedByProviderIds': FieldValue.arrayUnion([booking.providerId]),

      'updatedAt': now,
    });

    batch.set(timelineRef, {
      'bookingId': booking.id,
      'status': BookingStatus.rejected,
      'title': 'Booking Request Rejected',
      'description': reason.trim().isEmpty
          ? 'Provider rejected the booking request. Booking recovery is now open.'
          : '${reason.trim()} Booking recovery is now open.',
      'createdBy': currentUid,
      'createdByRole': UserRoles.provider,
      'createdAt': now,
    });

    batch.set(customerNotificationRef, {
      'userId': booking.customerId,
      'title': 'Booking Recovery Started',
      'message':
          '${booking.providerBusinessName} rejected your booking request. Your event request is now available for qualified caterers to offer service.',
      'type': NotificationType.booking,
      'relatedId': booking.id,
      'relatedCollection': FirestoreCollections.mainEvents,
      'isRead': false,
      'readAt': null,
      'createdAt': now,
    });

    final addonRequestsSnapshot = await _db
        .collection(FirestoreCollections.addonRequests)
        .where('bookingId', isEqualTo: booking.id)
        .get();

    for (final doc in addonRequestsSnapshot.docs) {
      final data = doc.data();

      final currentStatus = data['status'];

      if (currentStatus == AddonRequestStatus.cancelled ||
          currentStatus == AddonRequestStatus.rejected ||
          currentStatus == AddonRequestStatus.completed) {
        continue;
      }

      batch.update(doc.reference, {
        'linkStatus': AddonLinkStatus.awaitingCustomerRecoverySelection,
        'mainBookingStatus': 'recovery',
        'currentCateringProviderId': null,
        'updatedAt': now,
      });

      final addonProviderId = data['addonProviderId'];

      if (addonProviderId != null && addonProviderId.toString().isNotEmpty) {
        final addonProviderDoc = await _db
            .collection(FirestoreCollections.providers)
            .doc(addonProviderId)
            .get();

        final addonProviderOwnerId = addonProviderDoc.data()?['ownerId'];

        if (addonProviderOwnerId != null) {
          final addonNotificationRef = _db
              .collection(FirestoreCollections.notifications)
              .doc();

          batch.set(addonNotificationRef, {
            'userId': addonProviderOwnerId,
            'title': 'Event Request Under Recovery',
            'message':
                'The main catering request connected to ${booking.customerFirstName} ${booking.customerLastName}’s event was rejected. Your add-on request is on hold while the customer reviews other caterers.',
            'type': NotificationType.booking,
            'relatedId': doc.id,
            'relatedCollection': FirestoreCollections.addonRequests,
            'isRead': false,
            'readAt': null,
            'createdAt': now,
          });
        }
      }
    }

    await batch.commit();
  }

  Future<void> sendRecoveryOffer({
    required BookingModel booking,
    required ProviderModel offeringProvider,
    required String message,
    required double estimatedPrice,
  }) async {
    if (booking.recoveryStatus != BookingRecoveryStatus.open &&
        booking.recoveryStatus != BookingRecoveryStatus.offerReceived) {
      throw Exception('This booking is not open for recovery offers.');
    }

    if (booking.rejectedByProviderIds.contains(offeringProvider.id)) {
      throw Exception('This provider already rejected this booking.');
    }

    if (booking.providerId == offeringProvider.id) {
      throw Exception('Original rejected provider cannot offer again.');
    }

    final existingOffer = await _db
        .collection(FirestoreCollections.bookingRecoveryOffers)
        .where('bookingId', isEqualTo: booking.id)
        .where('offeringProviderId', isEqualTo: offeringProvider.id)
        .limit(1)
        .get();

    if (existingOffer.docs.isNotEmpty) {
      throw Exception('You already sent an offer for this recovery booking.');
    }

    final now = FieldValue.serverTimestamp();

    final offerRef = _db
        .collection(FirestoreCollections.bookingRecoveryOffers)
        .doc();

    final bookingRef = _db
        .collection(FirestoreCollections.mainEvents)
        .doc(booking.id);

    final notificationRef = _db
        .collection(FirestoreCollections.notifications)
        .doc();

    final batch = _db.batch();

    batch.set(offerRef, {
      'bookingId': booking.id,
      'customerId': booking.customerId,

      'originalProviderId': booking.providerId,
      'offeringProviderId': offeringProvider.id,
      'offeringProviderBusinessName': offeringProvider.businessName,

      'message': message.trim(),
      'estimatedPrice': estimatedPrice,

      'status': RecoveryOfferStatus.offered,

      'createdAt': now,
      'selectedAt': null,
      'declinedAt': null,
      'expiredAt': null,
    });

    batch.update(bookingRef, {
      'recoveryStatus': BookingRecoveryStatus.offerReceived,
      'updatedAt': now,
    });

    batch.set(notificationRef, {
      'userId': booking.customerId,
      'title': 'New Recovery Offer',
      'message':
          '${offeringProvider.businessName} offered to handle your rejected event request.',
      'type': NotificationType.booking,
      'relatedId': booking.id,
      'relatedCollection': FirestoreCollections.mainEvents,
      'isRead': false,
      'readAt': null,
      'createdAt': now,
    });

    await batch.commit();
  }

  Stream<List<BookingModel>> recoveryOpportunitiesForProvider(
    String providerId,
  ) {
    return _db
        .collection(FirestoreCollections.mainEvents)
        .where(
          'recoveryStatus',
          whereIn: [
            BookingRecoveryStatus.open,
            BookingRecoveryStatus.offerReceived,
          ],
        )
        .orderBy('createdAt', descending: true)
        .orderBy(FieldPath.documentId, descending: true)
        .limit(20)
        .snapshots()
        .map((snapshot) {
          final bookings = snapshot.docs.map(BookingModel.fromDoc).toList();

          return bookings.where((booking) {
            final isNotOriginalProvider =
                booking.originalProviderId != providerId;
            final isNotCurrentProvider =
                booking.currentProviderId != providerId;
            final hasNotRejectedBefore = !booking.rejectedByProviderIds
                .contains(providerId);

            return isNotOriginalProvider &&
                isNotCurrentProvider &&
                hasNotRejectedBefore;
          }).toList();
        });
  }

  Stream<List<RecoveryOfferModel>> recoveryOffersByProvider(String providerId) {
    return _db
        .collection(FirestoreCollections.bookingRecoveryOffers)
        .where('offeringProviderId', isEqualTo: providerId)
        .orderBy('createdAt', descending: true)
        .orderBy(FieldPath.documentId, descending: true)
        .limit(20)
        .snapshots()
        .map((snapshot) {
          final offers = snapshot.docs.map(RecoveryOfferModel.fromDoc).toList();

          offers.sort((a, b) {
            final aDate = a.createdAt ?? DateTime(2000);
            final bDate = b.createdAt ?? DateTime(2000);
            return bDate.compareTo(aDate);
          });

          return offers;
        });
  }

  Stream<DocumentSnapshot<Map<String, dynamic>>> chatRoomStream(
    String chatRoomId,
  ) {
    return _db
        .collection(FirestoreCollections.chatRooms)
        .doc(chatRoomId)
        .snapshots();
  }

  Stream<QuerySnapshot<Map<String, dynamic>>> chatMessages(String chatRoomId) {
    return _db
        .collection(FirestoreCollections.chatRooms)
        .doc(chatRoomId)
        .collection(FirestoreCollections.messages)
        .orderBy('createdAt', descending: true)
        .orderBy(FieldPath.documentId, descending: true)
        .limit(20)
        .snapshots();
  }

  Future<void> markChatAsRead({
    required String chatRoomId,
    required String currentRole,
  }) async {
    final chatRoomRef = _db
        .collection(FirestoreCollections.chatRooms)
        .doc(chatRoomId);

    if (currentRole == UserRoles.customer) {
      await chatRoomRef.update({
        'unreadCountCustomer': 0,
        'updatedAt': FieldValue.serverTimestamp(),
      });
    } else if (currentRole == UserRoles.provider) {
      await chatRoomRef.update({
        'unreadCountProvider': 0,
        'updatedAt': FieldValue.serverTimestamp(),
      });
    }
  }

  Stream<List<ProviderModel>> favoriteProviders() {
    return _db
        .collection(FirestoreCollections.favorites)
        .where('customerId', isEqualTo: currentUid)
        .orderBy('createdAt', descending: true)
        .orderBy(FieldPath.documentId, descending: true)
        .limit(20)
        .snapshots()
        .asyncMap((snapshot) async {
          final providers = <ProviderModel>[];

          for (final doc in snapshot.docs) {
            final data = doc.data();
            final providerId = data['providerId'];

            if (providerId == null || providerId.toString().isEmpty) {
              continue;
            }

            final providerDoc = await _db
                .collection(FirestoreCollections.providers)
                .doc(providerId)
                .get();

            if (providerDoc.exists) {
              providers.add(ProviderModel.fromDoc(providerDoc));
            }
          }

          return providers;
        });
  }

  Stream<List<ProviderModel>> searchVerifiedProviders({
    required String keyword,
    required String eventType,
    required String location,
    required double? minBudget,
    required double? maxBudget,
  }) {
    final normalizedTerm = keyword.trim().isNotEmpty
        ? keyword.trim().toLowerCase().split(RegExp(r'[^a-z0-9]+')).first
        : location.trim().toLowerCase().split(RegExp(r'[^a-z0-9]+')).first;

    Query<Map<String, dynamic>> providerQuery = _db
        .collection(FirestoreCollections.providers)
        .where(
          'verificationStatus',
          isEqualTo: ProviderVerificationStatus.approved,
        )
        .where('isActive', isEqualTo: true)
        .where('providerServiceType', isEqualTo: 'catering')
        .where('isDeleted', isEqualTo: false);

    if (normalizedTerm.isNotEmpty) {
      providerQuery = providerQuery.where(
        'searchTokens',
        arrayContains: normalizedTerm,
      );
    }

    return providerQuery
        .orderBy('favoriteCount', descending: true)
        .orderBy(FieldPath.documentId, descending: true)
        .limit(50)
        .snapshots()
        .map((snapshot) {
          final query = keyword.trim().toLowerCase();
          final selectedEventType = eventType.trim().toLowerCase();
          final selectedLocation = location.trim().toLowerCase();

          final providers = snapshot.docs.map(ProviderModel.fromDoc).toList();

          return providers.where((provider) {
            final businessName = provider.businessName.toLowerCase();
            final providerLocation = provider.location.toLowerCase();
            final city = provider.city.toLowerCase();
            final province = provider.province.toLowerCase();

            final matchesKeyword =
                query.isEmpty ||
                businessName.contains(query) ||
                providerLocation.contains(query) ||
                city.contains(query) ||
                province.contains(query);

            final matchesEventType =
                selectedEventType == 'all' ||
                selectedEventType.isEmpty ||
                provider.eventTypesSupported.any(
                  (type) => type.toLowerCase() == selectedEventType,
                );

            final matchesLocation =
                selectedLocation.isEmpty ||
                providerLocation.contains(selectedLocation) ||
                city.contains(selectedLocation) ||
                province.contains(selectedLocation);

            final matchesMinBudget =
                minBudget == null || provider.maxPrice >= minBudget;

            final matchesMaxBudget =
                maxBudget == null || provider.minPrice <= maxBudget;

            return matchesKeyword &&
                matchesEventType &&
                matchesLocation &&
                matchesMinBudget &&
                matchesMaxBudget;
          }).toList();
        });
  }

  Stream<List<ProviderModel>> searchAllVerifiedProviders({
    required String keyword,
    required String eventType,
    required String location,
    required double? minBudget,
    required double? maxBudget,
  }) {
    final normalizedTerm = keyword.trim().isNotEmpty
        ? keyword.trim().toLowerCase().split(RegExp(r'[^a-z0-9]+')).first
        : location.trim().toLowerCase().split(RegExp(r'[^a-z0-9]+')).first;

    Query<Map<String, dynamic>> providerQuery = _db
        .collection(FirestoreCollections.providers)
        .where(
          'verificationStatus',
          isEqualTo: ProviderVerificationStatus.approved,
        )
        .where('isActive', isEqualTo: true)
        .where('isDeleted', isEqualTo: false);

    if (normalizedTerm.isNotEmpty) {
      providerQuery = providerQuery.where(
        'searchTokens',
        arrayContains: normalizedTerm,
      );
    }

    return providerQuery
        .orderBy('favoriteCount', descending: true)
        .orderBy(FieldPath.documentId, descending: true)
        .limit(50)
        .snapshots()
        .map((snapshot) {
          final query = keyword.trim().toLowerCase();
          final selectedEventType = eventType.trim().toLowerCase();
          final selectedLocation = location.trim().toLowerCase();

          final providers = snapshot.docs.map(ProviderModel.fromDoc).toList();

          return providers.where((provider) {
            final businessName = provider.businessName.toLowerCase();
            final providerLocation = provider.location.toLowerCase();
            final city = provider.city.toLowerCase();
            final province = provider.province.toLowerCase();
            final category = provider.providerCategory.toLowerCase();
            final serviceType = provider.providerServiceType.toLowerCase();

            final categoryLabel = providerCategoryLabel(
              provider.providerCategory,
            ).toLowerCase();

            final matchesKeyword =
                query.isEmpty ||
                businessName.contains(query) ||
                providerLocation.contains(query) ||
                city.contains(query) ||
                province.contains(query) ||
                category.contains(query) ||
                categoryLabel.contains(query) ||
                serviceType.contains(query);

            final matchesEventType =
                selectedEventType == 'all' ||
                selectedEventType.isEmpty ||
                provider.eventTypesSupported.any(
                  (type) => type.toLowerCase() == selectedEventType,
                );

            final matchesLocation =
                selectedLocation.isEmpty ||
                providerLocation.contains(selectedLocation) ||
                city.contains(selectedLocation) ||
                province.contains(selectedLocation);

            final matchesMinBudget =
                minBudget == null || provider.maxPrice >= minBudget;

            final matchesMaxBudget =
                maxBudget == null || provider.minPrice <= maxBudget;

            return matchesKeyword &&
                matchesEventType &&
                matchesLocation &&
                matchesMinBudget &&
                matchesMaxBudget;
          }).toList();
        });
  }

  Stream<QuerySnapshot<Map<String, dynamic>>> providerReviews(
    String providerId,
  ) {
    return _db
        .collection(FirestoreCollections.reviews)
        .where('providerId', isEqualTo: providerId)
        .where('isVisible', isEqualTo: true)
        .where('isDeleted', isEqualTo: false)
        .orderBy('createdAt', descending: true)
        .orderBy(FieldPath.documentId, descending: true)
        .limit(20)
        .snapshots();
  }

  Future<void> markBookingCompleted({required BookingModel booking}) async {
    if (booking.status != BookingStatus.confirmed) {
      throw Exception('Only confirmed bookings can be marked as completed.');
    }

    final now = FieldValue.serverTimestamp();

    final batch = _db.batch();

    final bookingRef = _db
        .collection(FirestoreCollections.mainEvents)
        .doc(booking.id);

    final providerRef = _db
        .collection(FirestoreCollections.providers)
        .doc(booking.providerId);

    final timelineRef = _db
        .collection(FirestoreCollections.bookingTimelines)
        .doc();

    final notificationRef = _db
        .collection(FirestoreCollections.notifications)
        .doc();

    batch.update(bookingRef, {
      'status': BookingStatus.completed,
      'completedAt': now,
      'updatedAt': now,
    });

    batch.update(providerRef, {
      'totalCompletedBookings': FieldValue.increment(1),
      'updatedAt': now,
    });

    batch.set(timelineRef, {
      'bookingId': booking.id,
      'status': BookingStatus.completed,
      'title': 'Booking Completed',
      'description':
          'Provider marked the booking as completed. Customer can now leave a review.',
      'createdBy': currentUid,
      'createdByRole': UserRoles.provider,
      'createdAt': now,
    });

    batch.set(notificationRef, {
      'userId': booking.customerId,
      'title': 'Booking Completed',
      'message':
          '${booking.providerBusinessName} marked your booking as completed. You can now leave a review.',
      'type': NotificationType.booking,
      'relatedId': booking.id,
      'relatedCollection': FirestoreCollections.mainEvents,
      'isRead': false,
      'readAt': null,
      'createdAt': now,
    });

    await batch.commit();
  }

  Stream<List<PackageModel>> myProviderPackages(String providerId) {
    return _db
        .collection(FirestoreCollections.packages)
        .where('providerId', isEqualTo: providerId)
        .where('isActive', isEqualTo: true)
        .where('isDeleted', isEqualTo: false)
        .orderBy('createdAt', descending: true)
        .orderBy(FieldPath.documentId, descending: true)
        .limit(20)
        .snapshots()
        .map((snapshot) {
          return snapshot.docs.map(PackageModel.fromDoc).toList();
        });
  }

  Future<void> createPackage({
    required String providerId,
    required String name,
    required String description,
    required String eventType,
    required double price,
    required double downPaymentPercentage,
    required int guestCapacity,
    required int minimumGuests,
    required int maximumGuests,
    required String imageUrl,
    required List<String> foodInclusions,
    required List<String> decorInclusions,
    required List<String> furnitureInclusions,
    required List<String> serviceInclusions,
    required bool isCustomizable,
  }) async {
    final downPaymentAmount = price * (downPaymentPercentage / 100);
    final now = FieldValue.serverTimestamp();

    await _db.collection(FirestoreCollections.packages).add({
      'providerId': providerId,
      'name': name.trim(),
      'description': description.trim(),
      'eventType': eventType.trim(),
      'price': price,
      'downPaymentPercentage': downPaymentPercentage,
      'downPaymentAmount': downPaymentAmount,
      'guestCapacity': guestCapacity,
      'minimumGuests': minimumGuests,
      'maximumGuests': maximumGuests,
      'imageUrl': imageUrl.trim().isEmpty ? null : imageUrl.trim(),
      'foodInclusions': foodInclusions,
      'decorInclusions': decorInclusions,
      'furnitureInclusions': furnitureInclusions,
      'serviceInclusions': serviceInclusions,
      'isCustomizable': isCustomizable,
      'isActive': true,
      'isDeleted': false,
      'deletedAt': null,
      'deletedBy': null,
      'deletionReason': null,
      'createdAt': now,
      'updatedAt': now,
    });
  }

  Future<void> updatePackage({
    required String packageId,
    required String name,
    required String description,
    required String eventType,
    required double price,
    required double downPaymentPercentage,
    required int guestCapacity,
    required int minimumGuests,
    required int maximumGuests,
    required String imageUrl,
    required List<String> foodInclusions,
    required List<String> decorInclusions,
    required List<String> furnitureInclusions,
    required List<String> serviceInclusions,
    required bool isCustomizable,
  }) async {
    final downPaymentAmount = price * (downPaymentPercentage / 100);

    await _db.collection(FirestoreCollections.packages).doc(packageId).update({
      'name': name.trim(),
      'description': description.trim(),
      'eventType': eventType.trim(),
      'price': price,
      'downPaymentPercentage': downPaymentPercentage,
      'downPaymentAmount': downPaymentAmount,
      'guestCapacity': guestCapacity,
      'minimumGuests': minimumGuests,
      'maximumGuests': maximumGuests,
      'imageUrl': imageUrl.trim().isEmpty ? null : imageUrl.trim(),
      'foodInclusions': foodInclusions,
      'decorInclusions': decorInclusions,
      'furnitureInclusions': furnitureInclusions,
      'serviceInclusions': serviceInclusions,
      'isCustomizable': isCustomizable,
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  Future<void> deactivatePackage(
    String packageId, {
    String reason = 'Removed by provider',
  }) async {
    await _db.collection(FirestoreCollections.packages).doc(packageId).update({
      'isActive': false,
      'isDeleted': true,
      'deletedAt': FieldValue.serverTimestamp(),
      'deletedBy': currentUid,
      'deletionReason': reason.trim(),
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  Future<void> createAddon({
    required String providerId,
    required String name,
    required String description,
    required String category,
    required double price,
    required String imageUrl,
    required bool isAvailable,
  }) async {
    final now = FieldValue.serverTimestamp();

    final providerDoc = await _db
        .collection(FirestoreCollections.providers)
        .doc(providerId)
        .get();

    final providerData = providerDoc.data();

    final providerBusinessName =
        providerData?['businessName'] ?? 'Unknown Provider';

    final providerServiceType =
        providerData?['providerServiceType'] ?? 'catering';

    final providerType = providerServiceType == 'addon'
        ? 'addon_provider'
        : 'catering_provider';

    await _db.collection(FirestoreCollections.addons).add({
      'providerId': providerId,
      'providerBusinessName': providerBusinessName,
      'providerType': providerType,
      'name': name.trim(),
      'description': description.trim(),
      'category': category.trim(),
      'price': price,
      'imageUrl': imageUrl.trim().isEmpty ? null : imageUrl.trim(),
      'isAvailable': isAvailable,
      'isActive': true,
      'isDeleted': false,
      'deletedAt': null,
      'deletedBy': null,
      'deletionReason': null,
      'createdAt': now,
      'updatedAt': now,
    });
  }

  Stream<List<AddonModel>> myProviderAddons(String providerId) {
    return _db
        .collection(FirestoreCollections.addons)
        .where('providerId', isEqualTo: providerId)
        .where('isActive', isEqualTo: true)
        .where('isDeleted', isEqualTo: false)
        .orderBy('createdAt', descending: true)
        .orderBy(FieldPath.documentId, descending: true)
        .limit(20)
        .snapshots()
        .map((snapshot) {
          return snapshot.docs.map(AddonModel.fromDoc).toList();
        });
  }

  Future<void> updateAddon({
    required String addonId,
    required String name,
    required String description,
    required String category,
    required double price,
    required String imageUrl,
    required bool isAvailable,
  }) async {
    await _db.collection(FirestoreCollections.addons).doc(addonId).update({
      'name': name.trim(),
      'description': description.trim(),
      'category': category.trim(),
      'price': price,
      'imageUrl': imageUrl.trim().isEmpty ? null : imageUrl.trim(),
      'isAvailable': isAvailable,
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  Future<void> deactivateAddon(
    String addonId, {
    String reason = 'Removed by provider',
  }) async {
    await _db.collection(FirestoreCollections.addons).doc(addonId).update({
      'isActive': false,
      'isDeleted': true,
      'deletedAt': FieldValue.serverTimestamp(),
      'deletedBy': currentUid,
      'deletionReason': reason.trim(),
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  Stream<List<MenuItemModel>> myProviderMenuItems(String providerId) {
    return _db
        .collection(FirestoreCollections.menuItems)
        .where('providerId', isEqualTo: providerId)
        .where('isActive', isEqualTo: true)
        .orderBy('createdAt', descending: true)
        .orderBy(FieldPath.documentId, descending: true)
        .limit(20)
        .snapshots()
        .map((snapshot) {
          return snapshot.docs.map(MenuItemModel.fromDoc).toList();
        });
  }

  Stream<List<MenuItemModel>> menuItemsByProvider(String providerId) {
    return _db
        .collection(FirestoreCollections.menuItems)
        .where('providerId', isEqualTo: providerId)
        .where('isActive', isEqualTo: true)
        .where('isAvailable', isEqualTo: true)
        .orderBy('createdAt', descending: true)
        .orderBy(FieldPath.documentId, descending: true)
        .limit(20)
        .snapshots()
        .map((snapshot) {
          return snapshot.docs.map(MenuItemModel.fromDoc).toList();
        });
  }

  Future<void> createMenuItem({
    required String providerId,
    required String name,
    required String description,
    required String category,
    required double pricePerServing,
    required String imageUrl,
    required bool isAvailable,
  }) async {
    final now = FieldValue.serverTimestamp();

    await _db.collection(FirestoreCollections.menuItems).add({
      'providerId': providerId,
      'name': name.trim(),
      'description': description.trim(),
      'category': category.trim(),
      'pricePerServing': pricePerServing,
      'imageUrl': imageUrl.trim().isEmpty ? null : imageUrl.trim(),
      'isAvailable': isAvailable,
      'isActive': true,
      'createdAt': now,
      'updatedAt': now,
    });
  }

  Future<void> updateMenuItem({
    required String menuItemId,
    required String name,
    required String description,
    required String category,
    required double pricePerServing,
    required String imageUrl,
    required bool isAvailable,
  }) async {
    await _db
        .collection(FirestoreCollections.menuItems)
        .doc(menuItemId)
        .update({
          'name': name.trim(),
          'description': description.trim(),
          'category': category.trim(),
          'pricePerServing': pricePerServing,
          'imageUrl': imageUrl.trim().isEmpty ? null : imageUrl.trim(),
          'isAvailable': isAvailable,
          'updatedAt': FieldValue.serverTimestamp(),
        });
  }

  Future<void> deactivateMenuItem(String menuItemId) async {
    await _db.collection(FirestoreCollections.menuItems).doc(menuItemId).update(
      {'isActive': false, 'updatedAt': FieldValue.serverTimestamp()},
    );
  }

  Stream<List<AddonModel>> marketplaceAddons() {
    return _db
        .collection(FirestoreCollections.addons)
        .where('providerType', isEqualTo: 'addon_provider')
        .where('isActive', isEqualTo: true)
        .where('isAvailable', isEqualTo: true)
        .where('isDeleted', isEqualTo: false)
        .orderBy('createdAt', descending: true)
        .orderBy(FieldPath.documentId, descending: true)
        .limit(20)
        .snapshots()
        .map((snapshot) {
          return snapshot.docs.map(AddonModel.fromDoc).toList();
        });
  }
}
