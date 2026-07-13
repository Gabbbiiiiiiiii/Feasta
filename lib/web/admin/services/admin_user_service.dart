import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

import 'package:feasta/core/constants/firestore_collections.dart';
import 'package:feasta/web/admin/models/admin_user.dart';
import 'package:feasta/web/admin/models/admin_user_page.dart';

class AdminUserService {
  AdminUserService({FirebaseFirestore? firestore, FirebaseAuth? auth})
    : _firestore = firestore ?? FirebaseFirestore.instance,
      _auth = auth ?? FirebaseAuth.instance;

  static const int _whereInLimit = 30;

  static const int _maxBatchWrites = 500;
  static const int _maxProviderWrites = _maxBatchWrites - 2;

  final FirebaseFirestore _firestore;
  final FirebaseAuth _auth;

  CollectionReference<Map<String, dynamic>> get _usersCollection {
    return _firestore.collection(FirestoreCollections.users);
  }

  CollectionReference<Map<String, dynamic>> get _providersCollection {
    return _firestore.collection(FirestoreCollections.providers);
  }

  CollectionReference<Map<String, dynamic>> get _customersCollection {
    return _firestore.collection(FirestoreCollections.customers);
  }

  CollectionReference<Map<String, dynamic>> get _adminLogsCollection {
    return _firestore.collection(FirestoreCollections.adminLogs);
  }

  Future<AdminUserPage> loadUsers({
    int limit = 10,
    String? role,
    String? accountStatus,
    String? verificationStatus,
    DocumentSnapshot<Map<String, dynamic>>? startAfter,
  }) async {
    if (limit <= 0) {
      throw ArgumentError.value(
        limit,
        'limit',
        'The page size must be greater than zero.',
      );
    }

    Query<Map<String, dynamic>> query = _usersCollection;

    query = _applyUserFilters(
      query: query,
      role: role,
      accountStatus: accountStatus,
      verificationStatus: verificationStatus,
    );

    query = query.orderBy('createdAt', descending: true);

    if (startAfter != null) {
      query = query.startAfterDocument(startAfter);
    }

    final snapshot = await query.limit(limit + 1).get();

    final hasMore = snapshot.docs.length > limit;

    final visibleDocuments = hasMore
        ? snapshot.docs.take(limit).toList()
        : snapshot.docs.toList();

    var users = visibleDocuments.map(AdminUser.fromDocument).toList();

    users = await _attachProviderInformation(users);

    return AdminUserPage(
      users: users,
      firstDocument: visibleDocuments.isEmpty ? null : visibleDocuments.first,
      lastDocument: visibleDocuments.isEmpty ? null : visibleDocuments.last,
      hasMore: hasMore,
    );
  }

  Future<List<AdminUser>> searchUsers({
    required String searchText,
    String? role,
    String? accountStatus,
    String? verificationStatus,
  }) async {
    final normalizedSearch = searchText.trim().toLowerCase();

    if (normalizedSearch.isEmpty) {
      return const [];
    }

    Query<Map<String, dynamic>> query = _usersCollection;

    query = _applyUserFilters(
      query: query,
      role: role,
      accountStatus: accountStatus,
      verificationStatus: verificationStatus,
    );

    query = query.orderBy('createdAt', descending: true);

    final snapshot = await query.get();

    var users = snapshot.docs.map(AdminUser.fromDocument).toList();

    users = await _attachProviderInformation(users);

    return users.where((user) {
      final searchableText = <String>[
        user.fullName,
        user.firstName,
        user.lastName,
        user.email,
        user.phoneNumber,
        user.businessName ?? '',
        user.providerServiceType ?? '',
        user.providerCategory ?? '',
      ].join(' ').toLowerCase();

      return searchableText.contains(normalizedSearch);
    }).toList();
  }

  Query<Map<String, dynamic>> _applyUserFilters({
    required Query<Map<String, dynamic>> query,
    String? role,
    String? accountStatus,
    String? verificationStatus,
  }) {
    final normalizedRole = _normalize(role);
    final normalizedAccountStatus = _normalize(accountStatus);
    final normalizedVerificationStatus = _normalize(verificationStatus);

    // User Management only manages customers and providers.
    if (normalizedRole == 'customer' || normalizedRole == 'provider') {
      query = query.where('role', isEqualTo: normalizedRole);
    } else {
      query = query.where('role', whereIn: const ['customer', 'provider']);
    }

    if (normalizedAccountStatus == 'active') {
      query = query
          .where('isActive', isEqualTo: true)
          .where('isBlocked', isEqualTo: false);
    } else if (normalizedAccountStatus == 'disabled') {
      query = query.where('isActive', isEqualTo: false);
    } else if (normalizedAccountStatus == 'blocked') {
      query = query.where('isBlocked', isEqualTo: true);
    }

    if (normalizedVerificationStatus != null &&
        normalizedVerificationStatus != 'all') {
      query = query.where(
        'verificationStatus',
        isEqualTo: normalizedVerificationStatus,
      );
    }

    return query;
  }

  Future<List<AdminUser>> _attachProviderInformation(
    List<AdminUser> users,
  ) async {
    if (users.isEmpty) {
      return users;
    }

    final providerOwnerIds = users
        .where((user) => user.isProvider)
        .map((user) => user.id)
        .where((id) => id.trim().isNotEmpty)
        .toSet()
        .toList();

    if (providerOwnerIds.isEmpty) {
      return users;
    }

    final providerByOwnerId =
        <String, QueryDocumentSnapshot<Map<String, dynamic>>>{};

    for (final ownerIdChunk in _chunkList(providerOwnerIds, _whereInLimit)) {
      final providerSnapshot = await _providersCollection
          .where('ownerId', whereIn: ownerIdChunk)
          .get();

      for (final providerDocument in providerSnapshot.docs) {
        final ownerId = providerDocument.data()['ownerId']?.toString().trim();

        if (ownerId == null || ownerId.isEmpty) {
          continue;
        }

        final existingDocument = providerByOwnerId[ownerId];

        if (existingDocument == null) {
          providerByOwnerId[ownerId] = providerDocument;
          continue;
        }

        final existingPriority = _verificationPriority(
          existingDocument.data()['verificationStatus'],
        );

        final candidatePriority = _verificationPriority(
          providerDocument.data()['verificationStatus'],
        );

        if (candidatePriority > existingPriority ||
            (candidatePriority == existingPriority &&
                providerDocument.id.compareTo(existingDocument.id) < 0)) {
          providerByOwnerId[ownerId] = providerDocument;
        }
      }
    }

    return users.map((user) {
      if (!user.isProvider) {
        return user;
      }

      final providerDocument = providerByOwnerId[user.id];

      if (providerDocument == null) {
        return user;
      }

      final providerData = providerDocument.data();

      return user.copyWith(
        providerId: providerDocument.id,
        businessName: _trimmedString(providerData['businessName']),
        providerServiceType: _trimmedString(
          providerData['providerServiceType'],
        ),
        providerCategory: _trimmedString(providerData['providerCategory']),
        verificationStatus: _normalizeVerificationStatus(
          providerData['verificationStatus'],
        ),
      );
    }).toList();
  }

  QueryDocumentSnapshot<Map<String, dynamic>> _selectPreferredProvider(
    List<QueryDocumentSnapshot<Map<String, dynamic>>> documents,
  ) {
    if (documents.isEmpty) {
      throw ArgumentError('Provider documents cannot be empty.');
    }

    var selectedDocument = documents.first;

    for (final document in documents.skip(1)) {
      final selectedPriority = _verificationPriority(
        selectedDocument.data()['verificationStatus'],
      );

      final candidatePriority = _verificationPriority(
        document.data()['verificationStatus'],
      );

      if (candidatePriority > selectedPriority ||
          (candidatePriority == selectedPriority &&
              document.id.compareTo(selectedDocument.id) < 0)) {
        selectedDocument = document;
      }
    }

    return selectedDocument;
  }

  Future<AdminUser?> getUserById(String userId) async {
    final normalizedUserId = userId.trim();

    if (normalizedUserId.isEmpty) {
      return null;
    }

    final userDocument = await _usersCollection.doc(normalizedUserId).get();

    if (!userDocument.exists) {
      return null;
    }

    final user = AdminUser.fromDocument(userDocument);

    if (!user.isCustomer && !user.isProvider) {
      return null;
    }

    final enrichedUsers = await _attachProviderInformation([user]);

    return enrichedUsers.first;
  }

  Future<void> updateAccountStatus({
    required AdminUser user,
    required bool isActive,
  }) async {
    _ensureAdministratorCanModify(user);

    final currentAdmin = await _requireCurrentAdministrator();

    final userReference = _usersCollection.doc(user.id);
    final userSnapshot = await userReference.get();

    if (!userSnapshot.exists) {
      throw Exception('The user account no longer exists.');
    }

    final userData = userSnapshot.data()!;

    final currentRole = userData['role']?.toString().trim().toLowerCase() ?? '';

    if (currentRole != 'customer' && currentRole != 'provider') {
      throw Exception('This account cannot be modified from User Management.');
    }

    final currentIsBlocked = userData['isBlocked'] == true;

    List<QueryDocumentSnapshot<Map<String, dynamic>>> providerDocuments = [];
    var canActivateProvider = false;

    if (currentRole == 'provider') {
      final providerSnapshot = await _providersCollection
          .where('ownerId', isEqualTo: user.id)
          .get();

      if (providerSnapshot.docs.isEmpty) {
        throw Exception('The provider record no longer exists.');
      }

      providerDocuments = providerSnapshot.docs;

      if (providerDocuments.length > _maxProviderWrites) {
        throw Exception(
          'Too many duplicate provider records were found. Clean up the provider data before changing the account status.',
        );
      }

      final selectedProvider = _selectPreferredProvider(providerDocuments);

      final currentVerificationStatus = _normalizeVerificationStatus(
        selectedProvider.data()['verificationStatus'],
      );

      canActivateProvider =
          isActive &&
          !currentIsBlocked &&
          currentVerificationStatus == 'verified';
    }

    if (currentRole == 'customer') {
      final customerSnapshot = await _customersCollection.doc(user.id).get();

      if (!customerSnapshot.exists) {
        throw Exception('The customer profile no longer exists.');
      }
    }

    final batch = _firestore.batch();
    final now = FieldValue.serverTimestamp();
    final logReference = _adminLogsCollection.doc();

    batch.update(userReference, {'isActive': isActive, 'updatedAt': now});

    if (currentRole == 'customer') {
      batch.update(_customersCollection.doc(user.id), {
        'isActive': isActive,
        'updatedAt': now,
      });
    }

    for (final providerDocument in providerDocuments) {
      batch.update(providerDocument.reference, {
        'isActive': canActivateProvider,
        'updatedAt': now,
      });
    }

    batch.set(logReference, {
      'adminId': currentAdmin.uid,
      'action': isActive ? 'user_account_enabled' : 'user_account_disabled',
      'description': isActive
          ? 'Enabled ${user.fullName} account.'
          : 'Disabled ${user.fullName} account.',
      'targetCollection': FirestoreCollections.users,
      'targetId': user.id,
      'createdAt': now,
    });

    await batch.commit();
  }

  Future<void> updateBlockedStatus({
    required AdminUser user,
    required bool isBlocked,
  }) async {
    _ensureAdministratorCanModify(user);

    final currentAdmin = await _requireCurrentAdministrator();

    final userReference = _usersCollection.doc(user.id);
    final userSnapshot = await userReference.get();

    if (!userSnapshot.exists) {
      throw Exception('The user account no longer exists.');
    }

    final userData = userSnapshot.data()!;

    final currentRole = userData['role']?.toString().trim().toLowerCase() ?? '';

    if (currentRole != 'customer' && currentRole != 'provider') {
      throw Exception('This account cannot be modified from User Management.');
    }

    final currentIsActive = userData['isActive'] != false;

    List<QueryDocumentSnapshot<Map<String, dynamic>>> providerDocuments = [];
    var canActivateProvider = false;

    if (currentRole == 'provider') {
      final providerSnapshot = await _providersCollection
          .where('ownerId', isEqualTo: user.id)
          .get();

      if (providerSnapshot.docs.isEmpty) {
        throw Exception('The provider record no longer exists.');
      }

      providerDocuments = providerSnapshot.docs;

      if (providerDocuments.length > _maxProviderWrites) {
        throw Exception(
          'Too many duplicate provider records were found. Clean up the provider data before changing the blocked status.',
        );
      }

      final selectedProvider = _selectPreferredProvider(providerDocuments);

      final currentVerificationStatus = _normalizeVerificationStatus(
        selectedProvider.data()['verificationStatus'],
      );

      canActivateProvider =
          !isBlocked &&
          currentIsActive &&
          currentVerificationStatus == 'verified';
    }

    if (currentRole == 'customer') {
      final customerSnapshot = await _customersCollection.doc(user.id).get();

      if (!customerSnapshot.exists) {
        throw Exception('The customer profile no longer exists.');
      }
    }

    final batch = _firestore.batch();
    final now = FieldValue.serverTimestamp();
    final logReference = _adminLogsCollection.doc();

    batch.update(userReference, {'isBlocked': isBlocked, 'updatedAt': now});

    if (currentRole == 'customer') {
      batch.update(_customersCollection.doc(user.id), {
        'isBlocked': isBlocked,
        'updatedAt': now,
      });
    }

    for (final providerDocument in providerDocuments) {
      batch.update(providerDocument.reference, {
        'isBlocked': isBlocked,
        'isActive': canActivateProvider,
        'updatedAt': now,
      });
    }

    batch.set(logReference, {
      'adminId': currentAdmin.uid,
      'action': isBlocked ? 'user_account_blocked' : 'user_account_unblocked',
      'description': isBlocked
          ? 'Blocked ${user.fullName} account.'
          : 'Unblocked ${user.fullName} account.',
      'targetCollection': FirestoreCollections.users,
      'targetId': user.id,
      'createdAt': now,
    });

    await batch.commit();
  }

  Future<void> updateProviderVerificationStatus({
    required String providerId,
    required String ownerId,
    required String verificationStatus,
  }) async {
    final currentAdmin = await _requireCurrentAdministrator();

    final normalizedProviderId = providerId.trim();
    final normalizedOwnerId = ownerId.trim();
    final normalizedStatus = verificationStatus.trim().toLowerCase();

    if (normalizedProviderId.isEmpty) {
      throw ArgumentError.value(
        providerId,
        'providerId',
        'Provider ID cannot be empty.',
      );
    }

    if (normalizedOwnerId.isEmpty) {
      throw ArgumentError.value(
        ownerId,
        'ownerId',
        'Owner ID cannot be empty.',
      );
    }

    if (!const {'verified', 'pending', 'rejected'}.contains(normalizedStatus)) {
      throw ArgumentError.value(
        verificationStatus,
        'verificationStatus',
        'Verification status must be verified, pending, or rejected.',
      );
    }

    final userReference = _usersCollection.doc(normalizedOwnerId);

    final providerReference = _providersCollection.doc(normalizedProviderId);

    final duplicateProviderSnapshot = await _providersCollection
        .where('ownerId', isEqualTo: normalizedOwnerId)
        .get();

    final results = await Future.wait([
      userReference.get(),
      providerReference.get(),
    ]);

    final userSnapshot = results[0] as DocumentSnapshot<Map<String, dynamic>>;

    final providerSnapshot =
        results[1] as DocumentSnapshot<Map<String, dynamic>>;

    if (!userSnapshot.exists) {
      throw Exception('The provider owner account no longer exists.');
    }

    if (!providerSnapshot.exists) {
      throw Exception('The provider record no longer exists.');
    }

    final containsRequestedProvider = duplicateProviderSnapshot.docs.any(
      (document) => document.id == normalizedProviderId,
    );

    if (!containsRequestedProvider) {
      throw Exception(
        'The provider does not belong to the supplied owner account.',
      );
    }

    if (duplicateProviderSnapshot.docs.length > _maxProviderWrites) {
      throw Exception(
        'Too many duplicate provider records were found. Clean up the provider data before updating verification.',
      );
    }

    final userData = userSnapshot.data()!;
    final providerData = providerSnapshot.data()!;

    final userRole = userData['role']?.toString().trim().toLowerCase() ?? '';

    if (userRole != 'provider') {
      throw Exception('The supplied owner account is not a provider.');
    }

    final storedOwnerId = providerData['ownerId']?.toString().trim() ?? '';

    if (storedOwnerId != normalizedOwnerId) {
      throw Exception(
        'The provider does not belong to the supplied owner account.',
      );
    }

    final isUserActive = userData['isActive'] != false;
    final isUserBlocked = userData['isBlocked'] == true;

    final canActivateProvider =
        normalizedStatus == 'verified' && isUserActive && !isUserBlocked;

    final batch = _firestore.batch();
    final now = FieldValue.serverTimestamp();
    final logReference = _adminLogsCollection.doc();

    for (final providerDocument in duplicateProviderSnapshot.docs) {
      batch.update(providerDocument.reference, {
        'verificationStatus': normalizedStatus,
        'isActive': canActivateProvider,
        'updatedAt': now,
      });
    }

    batch.update(userReference, {
      'verificationStatus': normalizedStatus,
      'updatedAt': now,
    });

    batch.set(logReference, {
      'adminId': currentAdmin.uid,
      'action': 'provider_verification_$normalizedStatus',
      'description':
          'Changed provider verification status to $normalizedStatus.',
      'targetCollection': FirestoreCollections.providers,
      'targetId': normalizedProviderId,
      'ownerId': normalizedOwnerId,
      'createdAt': now,
    });

    await batch.commit();
  }

  Future<int> backfillProviderVerificationStatuses() async {
    await _requireCurrentAdministrator();

    final providerSnapshot = await _providersCollection.get();

    if (providerSnapshot.docs.isEmpty) {
      return 0;
    }

    /*
   * Resolve duplicate providers globally before creating write batches.
   * Priority: verified, pending, rejected.
   */
    final statusByOwnerId = <String, String>{};

    for (final providerDocument in providerSnapshot.docs) {
      final providerData = providerDocument.data();
      final ownerId = _trimmedString(providerData['ownerId']);

      if (ownerId == null) {
        continue;
      }

      final status = _normalizeVerificationStatus(
        providerData['verificationStatus'],
      );

      final existingStatus = statusByOwnerId[ownerId];

      if (existingStatus == null ||
          status == 'verified' ||
          (status == 'pending' && existingStatus == 'rejected')) {
        statusByOwnerId[ownerId] = status;
      }
    }

    if (statusByOwnerId.isEmpty) {
      return 0;
    }

    final ownerIds = statusByOwnerId.keys.toList();

    final existingUsers = <String, DocumentSnapshot<Map<String, dynamic>>>{};

    for (final ownerIdChunk in _chunkList(ownerIds, _whereInLimit)) {
      final userSnapshot = await _usersCollection
          .where(FieldPath.documentId, whereIn: ownerIdChunk)
          .get();

      for (final document in userSnapshot.docs) {
        existingUsers[document.id] = document;
      }
    }

    final validUpdates = <MapEntry<String, String>>[];

    for (final entry in statusByOwnerId.entries) {
      final ownerId = entry.key;
      final existingUser = existingUsers[ownerId];

      if (existingUser == null) {
        continue;
      }

      final role = existingUser
          .data()?['role']
          ?.toString()
          .trim()
          .toLowerCase();

      if (role != 'provider') {
        continue;
      }

      validUpdates.add(entry);
    }

    var updatedCount = 0;

    /*
   * Keep each batch safely below Firestore's 500-write limit.
   */
    for (final updateChunk in _chunkList(validUpdates, 400)) {
      final batch = _firestore.batch();
      final now = FieldValue.serverTimestamp();

      for (final entry in updateChunk) {
        batch.update(_usersCollection.doc(entry.key), {
          'verificationStatus': entry.value,
          'updatedAt': now,
        });
      }

      await batch.commit();
      updatedCount += updateChunk.length;
    }

    return updatedCount;
  }

  Future<User> _requireCurrentAdministrator() async {
    final currentUser = _auth.currentUser;

    if (currentUser == null) {
      throw Exception('No administrator is signed in.');
    }

    final userSnapshot = await _usersCollection.doc(currentUser.uid).get();

    if (!userSnapshot.exists) {
      throw Exception('The signed-in administrator account no longer exists.');
    }

    final data = userSnapshot.data()!;

    final role = data['role']?.toString().trim().toLowerCase() ?? '';

    final isActive = data['isActive'] != false;
    final isBlocked = data['isBlocked'] == true;

    if (role != 'admin') {
      throw Exception('Administrator access is required.');
    }

    if (!isActive || isBlocked) {
      throw Exception('This administrator account is not active.');
    }

    return currentUser;
  }

  void _ensureAdministratorCanModify(AdminUser user) {
    if (user.isAdministrator) {
      throw Exception(
        'Administrator accounts cannot be modified from User Management.',
      );
    }
  }

  int _verificationPriority(dynamic value) {
    switch (_normalizeVerificationStatus(value)) {
      case 'verified':
        return 3;

      case 'pending':
        return 2;

      case 'rejected':
        return 1;

      default:
        return 0;
    }
  }

  String _normalizeVerificationStatus(dynamic value) {
    final status = value?.toString().trim().toLowerCase() ?? 'pending';

    if (status == 'approved') {
      return 'verified';
    }

    switch (status) {
      case 'verified':
      case 'pending':
      case 'rejected':
        return status;

      default:
        return 'pending';
    }
  }

  String? _normalize(String? value) {
    final normalizedValue = value?.trim().toLowerCase();

    if (normalizedValue == null || normalizedValue.isEmpty) {
      return null;
    }

    return normalizedValue;
  }

  String? _trimmedString(dynamic value) {
    final text = value?.toString().trim();

    if (text == null || text.isEmpty) {
      return null;
    }

    return text;
  }

  List<List<T>> _chunkList<T>(List<T> values, int chunkSize) {
    if (chunkSize <= 0) {
      throw ArgumentError.value(
        chunkSize,
        'chunkSize',
        'Chunk size must be greater than zero.',
      );
    }

    if (values.isEmpty) {
      return const [];
    }

    final chunks = <List<T>>[];

    for (var start = 0; start < values.length; start += chunkSize) {
      final end = start + chunkSize > values.length
          ? values.length
          : start + chunkSize;

      chunks.add(values.sublist(start, end));
    }

    return chunks;
  }
}
