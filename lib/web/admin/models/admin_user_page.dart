import 'package:cloud_firestore/cloud_firestore.dart';

import 'admin_user.dart';

class AdminUserPage {
  final List<AdminUser> users;
  final DocumentSnapshot<Map<String, dynamic>>? firstDocument;
  final DocumentSnapshot<Map<String, dynamic>>? lastDocument;
  final bool hasMore;

  const AdminUserPage({
    required this.users,
    required this.firstDocument,
    required this.lastDocument,
    required this.hasMore,
  });

  const AdminUserPage.empty()
      : users = const [],
        firstDocument = null,
        lastDocument = null,
        hasMore = false;
}