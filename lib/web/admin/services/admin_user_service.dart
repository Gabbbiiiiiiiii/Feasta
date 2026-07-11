import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

import 'package:feasta/core/constants/firestore_collections.dart';
import 'package:feasta/core/constants/status_constants.dart';
import 'package:feasta/web/admin/models/admin_user.dart';
import 'package:feasta/web/admin/models/admin_user_page.dart';

class AdminUserService {
  AdminUserService({
    FirebaseFirestore? firestore,
    FirebaseAuth? auth,
  })  : _firestore = firestore ?? FirebaseFirestore.instance,
        _auth = auth ?? FirebaseAuth.instance;

  final FirebaseFirestore _firestore;
  final FirebaseAuth _auth;

  Future<AdminUserPage> loadUsers({
    int limit = 10,
    String? role,
    String? accountStatus,
    DocumentSnapshot<Map<String, dynamic>>? startAfter,
  }) async {
    Query<Map<String, dynamic>> query = _firestore
        .collection(FirestoreCollections.users)
        .orderBy('createdAt', descending: true);

    if (role != null && role != 'all') {
      query = query.where('role', isEqualTo: role);
    }

    if (accountStatus == 'active') {
      query = query
          .where('isActive', isEqualTo: true)
          .where('isBlocked', isEqualTo: false);
    } else if (accountStatus == 'disabled') {
      query = query.where('isActive', isEqualTo: false);
    } else if (accountStatus == 'blocked') {
      query = query.where('isBlocked', isEqualTo: true);
    }

    if (startAfter != null) {
      query = query.startAfterDocument(startAfter);
    }

    final snapshot = await query.limit(limit + 1).get();

    final hasMore = snapshot.docs.length > limit;
    final visibleDocuments = hasMore
        ? snapshot.docs.take(limit).toList()
        : snapshot.docs;

    var users = visibleDocuments
        .map(AdminUser.fromDocument)
        .toList();

    users = await _attachProviderInformation(users);

    return AdminUserPage(
      users: users,
      firstDocument:
          visibleDocuments.isEmpty ? null : visibleDocuments.first,
      lastDocument:
          visibleDocuments.isEmpty ? null : visibleDocuments.last,
      hasMore: hasMore,
    );
  }

  Future<List<AdminUser>> _attachProviderInformation(
    List<AdminUser> users,
  ) async {
    final result = <AdminUser>[];

    for (final user in users) {
      if (!user.isProvider) {
        result.add(user);
        continue;
      }

      final providerSnapshot = await _firestore
          .collection(FirestoreCollections.providers)
          .where('ownerId', isEqualTo: user.id)
          .limit(1)
          .get();

      if (providerSnapshot.docs.isEmpty) {
        result.add(user);
        continue;
      }

      final providerDocument = providerSnapshot.docs.first;
      final providerData = providerDocument.data();

      result.add(
        user.copyWith(
          providerId: providerDocument.id,
          businessName:
              providerData['businessName']?.toString().trim(),
          providerServiceType:
              providerData['providerServiceType']?.toString().trim(),
          providerCategory:
              providerData['providerCategory']?.toString().trim(),
          verificationStatus:
              providerData['verificationStatus']?.toString().trim(),
        ),
      );
    }

    return result;
  }

  Future<void> updateAccountStatus({
    required AdminUser user,
    required bool isActive,
  }) async {
    _ensureAdministratorCanModify(user);

    final currentAdmin = _auth.currentUser;

    if (currentAdmin == null) {
      throw Exception('No administrator is signed in.');
    }

    if (currentAdmin.uid == user.id) {
      throw Exception('You cannot disable your own account.');
    }

    final userReference = _firestore
        .collection(FirestoreCollections.users)
        .doc(user.id);

    final logReference = _firestore
        .collection(FirestoreCollections.adminLogs)
        .doc();

    final batch = _firestore.batch();
    final now = FieldValue.serverTimestamp();

    batch.update(userReference, {
      'isActive': isActive,
      'updatedAt': now,
    });

    if (user.isCustomer) {
      final customerReference = _firestore
          .collection(FirestoreCollections.customers)
          .doc(user.id);

      batch.set(
        customerReference,
        {
          'isActive': isActive,
          'updatedAt': now,
        },
        SetOptions(merge: true),
      );
    }

    if (user.isProvider && user.providerId != null) {
      final providerReference = _firestore
          .collection(FirestoreCollections.providers)
          .doc(user.providerId);

      batch.update(providerReference, {
        'isActive': isActive &&
            user.verificationStatus ==
                ProviderVerificationStatus.verified,
        'updatedAt': now,
      });
    }

    batch.set(logReference, {
      'adminId': currentAdmin.uid,
      'action': isActive
          ? 'user_account_enabled'
          : 'user_account_disabled',
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

    final currentAdmin = _auth.currentUser;

    if (currentAdmin == null) {
      throw Exception('No administrator is signed in.');
    }

    if (currentAdmin.uid == user.id) {
      throw Exception('You cannot block your own account.');
    }

    final userReference = _firestore
        .collection(FirestoreCollections.users)
        .doc(user.id);

    final logReference = _firestore
        .collection(FirestoreCollections.adminLogs)
        .doc();

    final batch = _firestore.batch();
    final now = FieldValue.serverTimestamp();

    batch.update(userReference, {
      'isBlocked': isBlocked,
      'updatedAt': now,
    });

    batch.set(logReference, {
      'adminId': currentAdmin.uid,
      'action': isBlocked
          ? 'user_account_blocked'
          : 'user_account_unblocked',
      'description': isBlocked
          ? 'Blocked ${user.fullName} account.'
          : 'Unblocked ${user.fullName} account.',
      'targetCollection': FirestoreCollections.users,
      'targetId': user.id,
      'createdAt': now,
    });

    await batch.commit();
  }

  Future<AdminUser?> getUserById(String userId) async {
    final userDocument = await _firestore
        .collection(FirestoreCollections.users)
        .doc(userId)
        .get();

    if (!userDocument.exists) return null;

    final user = AdminUser.fromDocument(userDocument);
    final users = await _attachProviderInformation([user]);

    return users.first;
  }

  void _ensureAdministratorCanModify(AdminUser user) {
    if (user.isAdministrator) {
      throw Exception(
        'Administrator accounts cannot be modified from User Management.',
      );
    }
  }

  Future<List<AdminUser>> searchUsers({
    required String searchText,
    String? role,
    String? accountStatus,
  }) async {
    final normalizedSearch = searchText.trim().toLowerCase();

    if (normalizedSearch.isEmpty) {
      return const [];
    }

    Query<Map<String, dynamic>> query = _firestore
        .collection(FirestoreCollections.users)
        .orderBy('createdAt', descending: true);

    if (role != null && role != 'all') {
      query = query.where('role', isEqualTo: role);
    }

    if (accountStatus == 'active') {
      query = query
          .where('isActive', isEqualTo: true)
          .where('isBlocked', isEqualTo: false);
    } else if (accountStatus == 'disabled') {
      query = query.where('isActive', isEqualTo: false);
    } else if (accountStatus == 'blocked') {
      query = query.where('isBlocked', isEqualTo: true);
    }

    final snapshot = await query.get();

    var users = snapshot.docs
        .map(AdminUser.fromDocument)
        .toList();

    users = await _attachProviderInformation(users);

    return users.where((user) {
      final searchableText = [
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
}