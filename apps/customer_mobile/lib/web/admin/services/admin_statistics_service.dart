import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:rxdart/rxdart.dart';

import 'package:feasta/core/constants/firestore_collections.dart';
import 'package:feasta/core/constants/status_constants.dart';
import 'package:feasta/web/admin/models/dashboard/admin_statistics.dart';

class AdminStatisticsService {
  AdminStatisticsService({
    FirebaseFirestore? firestore,
  }) : _firestore = firestore ?? FirebaseFirestore.instance;

  final FirebaseFirestore _firestore;

  Stream<AdminStatistics> watchUserManagementStatistics() {
    final usersStream = _firestore
        .collection(FirestoreCollections.users)
        .snapshots();

    final verificationStream = _firestore
        .collection(FirestoreCollections.providerVerifications)
        .snapshots();

    return Rx.combineLatest2<
        QuerySnapshot<Map<String, dynamic>>,
        QuerySnapshot<Map<String, dynamic>>,
        AdminStatistics>(
      usersStream,
      verificationStream,
      (
        QuerySnapshot<Map<String, dynamic>> usersSnapshot,
        QuerySnapshot<Map<String, dynamic>> verificationSnapshot,
      ) {
        var customers = 0;
        var providers = 0;
        var administrators = 0;
        var disabledAccounts = 0;
        var blockedAccounts = 0;

        for (final document in usersSnapshot.docs) {
          final data = document.data();

          final role = _readString(data['role']);
          final isActive = _readBool(
            data['isActive'],
            defaultValue: true,
          );
          final isBlocked = _readBool(
            data['isBlocked'],
            defaultValue: false,
          );

          switch (role) {
            case UserRoles.customer:
              customers++;
              break;

            case UserRoles.provider:
              providers++;
              break;

            case UserRoles.admin:
              administrators++;
              break;
          }

          if (!isActive && !isBlocked) {
            disabledAccounts++;
          }

          if (isBlocked) {
            blockedAccounts++;
          }
        }

        var verifiedProviders = 0;
        var pendingVerifications = 0;
        var rejectedVerifications = 0;

        for (final document in verificationSnapshot.docs) {
          final data = document.data();
          final status = _readString(data['status']);

          switch (status) {
            case ProviderVerificationRequestStatus.approved:
            case ProviderVerificationStatus.verified:
              verifiedProviders++;
              break;

            case ProviderVerificationRequestStatus.pending:
              pendingVerifications++;
              break;

            case ProviderVerificationRequestStatus.rejected:
              rejectedVerifications++;
              break;
          }
        }

        return AdminStatistics(
          totalAccounts: usersSnapshot.size,
          totalCustomers: customers,
          totalProviders: providers,
          totalAdministrators: administrators,
          verifiedProviders: verifiedProviders,
          pendingVerifications: pendingVerifications,
          rejectedVerifications: rejectedVerifications,
          disabledAccounts: disabledAccounts,
          blockedAccounts: blockedAccounts,
        );
      },
    );
  }

  static String _readString(dynamic value) {
    return value?.toString().trim().toLowerCase() ?? '';
  }

  static bool _readBool(
    dynamic value, {
    required bool defaultValue,
  }) {
    if (value is bool) return value;

    if (value is String) {
      final normalized = value.trim().toLowerCase();

      if (normalized == 'true') return true;
      if (normalized == 'false') return false;
    }

    if (value is num) {
      return value != 0;
    }

    return defaultValue;
  }
}